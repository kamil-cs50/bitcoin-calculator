import { useLingui } from '@lingui/react/macro';
import type { Dataset } from '@sim/data';
import type { RiskyAssetParams, Scenario } from '@sim/engine';
import { useEffect, useState } from 'react';
import { DataTable } from '../../charts/DataTable';
import { useId } from 'react';
import { Roll } from '../../components/ui/Roll';
import { BtcBell } from './BtcBell';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { formatMoney } from '../../lib/format';
import { rebuildMarket } from '../../state/defaults';
import { runTask } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';
import { SIM_SEED } from './useSimulation';
import { calendarYear } from './values';
import { currencyWord } from './basis';
import { numberLocale } from '../../i18n';
import { parseDecimal } from '../../components/ui/numberInput';

export interface BtcCardProps {
  scenario: Scenario;
  dataset: Dataset;
  month: number;
  /** Dzisiejsza cena 1 BTC; bez niej karta pokazuje tylko szansę upadku. */
  priceUsd?: number;
  pricePln?: number;
  /** Fabryka workerów (testy podstawiają wersję synchroniczną). */
  createWorker?: () => SimWorker;
}

const PRICE_KEY = 'btc-ref-price';
const PATHS = 1000;

function loadPrices(): { usd: number | null; pln: number | null } {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PRICE_KEY) ?? 'null');
    if (v && typeof v === 'object') {
      const { usd, pln } = v as { usd?: unknown; pln?: unknown };
      return { usd: typeof usd === 'number' && usd > 0 ? usd : null, pln: typeof pln === 'number' && pln > 0 ? pln : null };
    }
  } catch {
    // brak localStorage albo uszkodzony wpis: pola zostają puste
  }
  return { usd: null, pln: null };
}

/** Scenariusz samego BTC (1 jednostka, bez kosztów, podatku i przepływów) w walucie `base`. */
function btcOnlyScenario(s: Scenario, asset: RiskyAssetParams, dataset: Dataset, base: 'USD' | 'PLN'): Scenario {
  // cena nie zawiera kosztów funduszu ani podatku: 1 jednostka, bez przepływów
  const a: RiskyAssetParams = { ...asset, ter: 0, costBps: 0, taxForm: 'none' };
  return {
    ...s,
    baseCurrency: base,
    assets: [a],
    positions: [{ assetId: a.id, wrapper: 'taxable', value: 1, costBasis: 1, targetWeight: 1 }],
    market: rebuildMarket(dataset, s.market, [a], base),
    contribution: undefined,
    withdrawal: undefined,
    events: [],
    rebalance: { kind: 'none' },
    tax: { kind: 'none' },
    goal: undefined,
  };
}

const DEBOUNCE_MS = 120;

/** z dla 10. i 90. percentyla rozkładu normalnego. */
const Z90 = 1.2815515655446004;
const clampZ = (z: number): number => Math.max(-Z90, Math.min(Z90, z));

/** Dystrybuanta rozkładu normalnego (przybliżenie Abramowitza–Steguna erf, błąd < 1,5e−7). */
export function phi(x: number): number {
  const v = Math.abs(x) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * v);
  const e = 1 - ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-v * v);
  return 0.5 * (1 + Math.sign(x) * e);
}

/**
 * Cena przy wybranym z (przesuwanie po krzywej) — tylko do podglądu. Interpolacja między policzonymi
 * kwantylami 10/50/90% (log-liniowa dla dodatnich, liniowa gdy dolny kwantyl jest ≤ 0, np. przez upadek);
 * z jest ograniczone do [z10, z90], więc nigdy nie wychodzimy poza policzone kwantyle.
 */
export function priceAtZ(q: readonly [number, number, number], z: number): number {
  const zc = clampZ(z);
  const f = Math.abs(zc) / Z90;
  const [p10, med, p90] = q;
  const far = zc < 0 ? p10 : p90;
  if (far > 0 && med > 0) return Math.exp(Math.log(med) + f * (Math.log(far) - Math.log(med)));
  return med + f * (far - med);
}

const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 2 });
/** „$1.1M”, „$80K” — zapis z projektu (cena BTC podawana w USD). */
const usdShort = (v: number): string => usdCompact.format(v);

/** Wąskie pole ceny w „pigułce” nagłówka: polski zapis jak MoneyInput, bez ramki. */
function PriceField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(() => (value === null ? '' : new Intl.NumberFormat(numberLocale()).format(value)));
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      value={text}
      placeholder="—"
      className="num w-[86px] border-0 bg-transparent p-0 text-right text-[15px] text-fg placeholder:text-fg/40"
      onChange={(e) => {
        const next = e.target.value;
        if (!/^[\d\s\u00a0\u202f,.]*$/.test(next)) return;
        setText(next);
        const v = parseDecimal(next);
        onChange(v !== null && v > 0 ? v : null);
      }}
      onBlur={() => value !== null && setText(new Intl.NumberFormat(numberLocale()).format(value))}
    />
  );
}

/**
 * Kwantyle (10/50/90%) mnożnika ceny BTC po `month` miesiącach, liczone w workerze osobnym przebiegiem
 * samego BTC (nie blokuje głównego wątku; przy szybkich zmianach suwaka liczy dopiero po krótkiej pauzie).
 */
function usePriceMultiples(
  s: Scenario,
  asset: RiskyAssetParams | undefined,
  dataset: Dataset,
  base: 'USD' | 'PLN',
  month: number,
  createWorker?: () => SimWorker,
): [number, number, number] | null {
  const [q, setQ] = useState<[number, number, number] | null>(null);
  useEffect(() => {
    if (!asset) return;
    let alive = true;
    let handle: ReturnType<typeof runTask<unknown>> | undefined;
    const timer = setTimeout(() => {
      try {
        const sc = btcOnlyScenario(s, asset, dataset, base);
        const h = runTask((w) => w.summary(sc, { seed: SIM_SEED, paths: PATHS }, { month, real: false, afterTax: false }), createWorker);
        handle = h;
        h.done.then(
          (r) => alive && setQ([r.p10, r.median, r.p90]),
          () => alive && setQ(null),
        );
      } catch {
        setQ(null);
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      handle?.cancel();
    };
  }, [s, asset, dataset, base, month, createWorker]);
  return q;
}

/** Karta „Bitcoin: rozkład ceny w roku X” (spec 5.1); widoczna tylko, gdy w portfelu jest BTC. */
export function BtcCard({ scenario, dataset, month, priceUsd, pricePln, createWorker }: BtcCardProps) {
  const { t } = useLingui();
  const headingId = useId();
  const asset = scenario.assets.find(
    (a): a is RiskyAssetParams => a.kind === 'risky' && /^btc/.test(a.id) && scenario.positions.some((p) => p.assetId === a.id),
  );
  const [prices, setPrices] = useState(() => {
    const saved = loadPrices();
    return { usd: priceUsd ?? saved.usd, pln: pricePln ?? saved.pln };
  });
  useEffect(() => {
    try {
      localStorage.setItem(PRICE_KEY, JSON.stringify(prices));
    } catch {
      // zapis opcjonalny
    }
  }, [prices]);

  const usd = usePriceMultiples(scenario, asset, dataset, 'USD', month, createWorker);
  const pln = usePriceMultiples(scenario, asset, dataset, 'PLN', month, createWorker);
  if (!asset) return null;

  const year = calendarYear(scenario.startYear, scenario.startMonth, month);
  const money = (v: number, c: 'USD' | 'PLN') => formatMoney(v, c, { sigDigits: 2 });
  const rows = [
    { k: 9, i: 0 },
    { k: 5, i: 1 },
    { k: 1, i: 2 },
  ].map(({ k, i }) => ({
    label: t`w ${k} na 10 przyszłości więcej niż`,
    cells: [usd && prices.usd ? money(prices.usd * usd[i]!, 'USD') : '–', pln && prices.pln ? money(prices.pln * pln[i]!, 'PLN') : '–'],
  }));
  let collapse: string | null = null;
  if (asset.collapse) {
    const p = 1 - Math.exp(-asset.collapse.hazard * (month / 12));
    const n = Math.round(p * 100);
    collapse = n === 0 && p > 0 ? t`Szansa upadku do roku ${year}: mniej niż 1 na 100` : t`Szansa upadku do roku ${year}: ${n} na 100`;
  }

  const [z, setZ] = useState<number | null>(null);
  const q = usd && prices.usd ? ([prices.usd * usd[0], prices.usd * usd[1], prices.usd * usd[2]] as const) : null;
  const zz = z === null ? null : clampZ(z);
  const shown = q ? (zz === null ? q[1] : priceAtZ(q, zz)) : null;
  const above = zz === null ? 50 : Math.round((1 - phi(zz)) * 100);
  const multiple = usd ? new Intl.NumberFormat(numberLocale(), { maximumSignificantDigits: 2 }).format(usd[1]) : null;

  return (
    <section
      aria-label={t`Bitcoin: rozkład ceny w roku ${year}`}
      className="glass flex min-w-0 grow-[5] basis-[380px] flex-col gap-3.5 rounded-card p-[clamp(20px,2.2vw,28px)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="eyebrow m-0 font-normal">
          {t`Bitcoin · cena w roku ${year}`}
        </h2>
        <label className="flex min-h-[38px] items-center gap-2.5 rounded-full border border-hairline bg-white/[0.03] py-1 pl-3.5 pr-3 focus-within:border-accent-text">
          <span className="eyebrow-sm">{t`1 BTC dziś`}</span>
          <PriceField
            label={t`Dzisiejsza cena 1 BTC (USD)`}
            value={prices.usd}
            onChange={(v) => setPrices((p) => ({ ...p, usd: v }))}
          />
          <span aria-hidden="true" className="text-[13px] text-fg/60">
            USD
          </span>
        </label>
      </div>
      <BtcBell z={q ? zz : null} onScrub={q ? setZ : undefined} />
      {q && shown !== null ? (
        <div className="flex flex-col items-center gap-1.5 text-center" aria-hidden="true">
          <span className="text-base font-light text-fg/80">{zz === null ? t`Mediana ceny 1 BTC` : t`Percentyl ${100 - above}.`}</span>
          <span className="text-[clamp(56px,6.8vw,88px)] leading-none font-light tracking-[-0.05em] tabular-nums">
            <Roll text={usdShort(shown)} />
          </span>
          <span className="text-[13px] font-light text-fg/60">
            {zz === null
              ? multiple
                ? t`×${multiple} dzisiejszej ceny · przesuń po krzywej`
                : t`przesuń po krzywej`
              : t`w ${above} na 100 przyszłości cena będzie wyższa`}
          </span>
        </div>
      ) : (
        !(prices.usd || prices.pln) && (
          <p className="m-0 text-[13px] leading-normal font-light text-muted">{t`Wpisz dzisiejszą cenę 1 BTC (aplikacja nie pobiera cen sama), a pokażemy możliwe ceny w przyszłości.`}</p>
        )
      )}
      <div className="eyebrow-sm mt-auto flex flex-wrap justify-between gap-x-5 gap-y-2 border-t border-hairline pt-3.5">
        {q && (
          <>
            <span>{`${t`9 na 10`} › ${usdShort(q[0])}`}</span>
            <span>{`${t`1 na 10`} › ${usdShort(q[2])}`}</span>
          </>
        )}
        {collapse && <span>{collapse}</span>}
      </div>
      {(prices.usd || prices.pln) && (
        <details>
          <summary className="eyebrow-sm min-h-11 cursor-pointer py-2.5">{t`Pokaż ceny w tabeli (USD i zł)`}</summary>
          <div className="mt-2 flex flex-col gap-3">
            <MoneyInput
              label={t`Dzisiejsza cena 1 BTC (zł)`}
              suffix={currencyWord('PLN')}
              value={prices.pln}
              onChange={(v) => setPrices((p) => ({ ...p, pln: v }))}
            />
            <DataTable caption={t`Percentyle ceny bitcoina w roku ${year}`} cornerLabel={t`Częstość`} columns={['USD', 'PLN']} rows={rows} />
          </div>
        </details>
      )}
    </section>
  );
}
