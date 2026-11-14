import { useLingui } from '@lingui/react/macro';
import type { Dataset } from '@sim/data';
import type { RiskyAssetParams, Scenario } from '@sim/engine';
import { useEffect, useState } from 'react';
import { DataTable } from '../../charts/DataTable';
import { Card } from '../../components/ui/Card';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { formatMoney } from '../../lib/format';
import { rebuildMarket } from '../../state/defaults';
import { runTask } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';
import { SIM_SEED } from './useSimulation';
import { calendarYear } from './values';
import { currencyWord } from './basis';

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

  return (
    <Card title={t`Bitcoin: rozkład ceny w roku ${year}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyInput label={t`Dzisiejsza cena 1 BTC (USD)`} suffix="USD" value={prices.usd} onChange={(v) => setPrices((p) => ({ ...p, usd: v }))} />
        <MoneyInput label={t`Dzisiejsza cena 1 BTC (zł)`} suffix={currencyWord('PLN')} value={prices.pln} onChange={(v) => setPrices((p) => ({ ...p, pln: v }))} />
      </div>
      {prices.usd || prices.pln ? (
        <div className="mt-3">
          <DataTable caption={t`Percentyle ceny bitcoina w roku ${year}`} cornerLabel={t`Częstość`} columns={['USD', 'PLN']} rows={rows} />
        </div>
      ) : (
        <p className="mb-0 mt-3 text-sm text-muted">{t`Wpisz dzisiejszą cenę 1 BTC (aplikacja nie pobiera cen sama), a pokażemy możliwe ceny w przyszłości.`}</p>
      )}
      {collapse && <p className="mb-0 mt-3 font-medium">{collapse}</p>}
    </Card>
  );
}
