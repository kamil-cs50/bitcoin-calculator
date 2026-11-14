import { Trans, useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field, inputClass } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PercentInput } from '../../components/ui/PercentInput';
import { formatMoney } from '../../lib/format';
import { assetFromPreset } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';
import { rebuildMarket } from '../../state/defaults';
import { fetchCryptoQuote } from './prices';
import { TILE_PRESET, useAssetNames, type TileKind } from './tiles';

type FetchState = 'idle' | 'loading' | 'error' | 'ok';

const MINUTE = 60_000;

/** Najdłuższa nazwa aktywa własnego. */
const CUSTOM_NAME_MAX = 40;

/** Nazwa aktywa własnego do id: „~” rozdziela człony w identyfikatorach kontroli modelu, więc zamieniamy go na „-”. */
const cleanName = (raw: string): string => raw.replace(/~/g, '-').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_NAME_MAX);

const round2 = (x: number) => Math.round(x * 100) / 100;

function Radio({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-base">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-5" />
      {children}
    </label>
  );
}

/** Aktywo użytkownika: parametry g i σ podaje użytkownik, reszta z szablonu akcji polskich. */
function addCustom(name: string, g: number, sigma: number, value: number): void {
  const st = useScenarioStore.getState();
  const taken = new Set(st.scenario.assets.map((a) => a.id));
  let id = `custom:${name}`;
  for (let n = 2; taken.has(id); n++) id = `custom:${name} ${n}`;
  const tpl = assetFromPreset(st.dataset, 'wigEquity');
  if (tpl.kind !== 'risky') throw new Error('Szablon aktywa własnego musi być ryzykowny');
  const assets = [...st.scenario.assets, { ...tpl, id, currency: 'PLN' as const, g, sigma }];
  st.setScenario({
    ...st.scenario,
    assets,
    positions: [
      ...st.scenario.positions,
      { assetId: id, wrapper: 'taxable', value, costBasis: value, targetWeight: value },
    ],
    market: rebuildMarket(st.dataset, st.scenario.market, assets, st.scenario.baseCurrency),
  });
}

export interface PositionFormProps {
  kind: Exclude<TileKind, 'home'>;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Formularz jednej pozycji. Brak sieci nie blokuje niczego: cena 1 BTC jest zawsze polem
 * do wpisania (wymaganym, gdy podajemy liczbę BTC); „Pobierz cenę” tylko podpowiada wartość.
 */
export function PositionForm({ kind, onDone, onCancel }: PositionFormProps) {
  const { t } = useLingui();
  const names = useAssetNames();
  /** Wiek ceny z cache (do 24 h): uczciwie zamiast twierdzenia, że jest świeża. */
  const ageText = (at: number): string => {
    const min = Math.max(0, Math.floor((Date.now() - at) / MINUTE));
    if (min < 1) return t`przed chwilą`;
    if (min < 60) return t`${min} min temu`;
    const h = Math.floor(min / 60);
    return t`${h} godz. temu`;
  };
  const addPosition = useScenarioStore((s) => s.addPosition);
  const baseCurrency = useScenarioStore((s) => s.scenario.baseCurrency);

  const [amount, setAmount] = useState<number | null>(null);
  const [units, setUnits] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [mode, setMode] = useState<'units' | 'amount'>(kind === 'btc' ? 'units' : 'amount');
  const [variant, setVariant] = useState<'direct' | 'etf'>('direct');
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [g, setG] = useState<number | null>(null);
  const [sigma, setSigma] = useState<number | null>(null);

  const byUnits = kind === 'btc' && mode === 'units';
  const priceOk = price !== null && price > 0;
  const value = byUnits ? (units !== null && units > 0 && priceOk ? round2(units * price) : null) : amount;
  const customOk =
    kind !== 'custom' ||
    (cleanName(customName) !== '' && g !== null && g > -0.5 && g < 0.5 && sigma !== null && sigma > 0 && sigma <= 1.5);
  const valid = value !== null && value > 0 && customOk;

  async function loadPrice() {
    setFetchState('loading');
    try {
      const q = await fetchCryptoQuote('bitcoin', 'pln');
      setPrice(q.price);
      setFetchedAt(q.fetchedAt);
      setFetchState('ok');
    } catch {
      setFetchState('error');
    }
  }

  function submit() {
    if (!valid || value === null) return;
    if (kind === 'custom') {
      addCustom(cleanName(customName), g ?? 0, sigma ?? 0, value);
    } else {
      const presetId = TILE_PRESET[kind];
      // wariant ETF to osobne aktywo (osobny podatek), więc nie zmienia podatku już dodanej pozycji „giełda”
      // nieruchomość jest niepłynna: waga docelowa 0, żeby nie brała udziału w rebalansie ani wpłatach
      addPosition({ presetId, value, etf: variant === 'etf' && (kind === 'btc' || kind === 'gold'), ...(kind === 'rental' ? { targetWeight: 0 } : {}) });
    }
    onDone();
  }

  return (
    <Card title={names.tile(kind)}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {kind === 'btc' && (
          <>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">
                <Trans>Gdzie trzymasz bitcoina?</Trans>
              </legend>
              <Radio name="btc-where" checked={variant === 'direct'} onChange={() => setVariant('direct')}>
                <Trans>Giełda lub własny portfel</Trans>
              </Radio>
              <Radio name="btc-where" checked={variant === 'etf'} onChange={() => setVariant('etf')}>
                <Trans>ETF/ETP na bitcoina</Trans>
              </Radio>
            </fieldset>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">
                <Trans>Co wpisujesz?</Trans>
              </legend>
              <Radio name="btc-mode" checked={mode === 'units'} onChange={() => setMode('units')}>
                <Trans>Liczbę BTC</Trans>
              </Radio>
              <Radio name="btc-mode" checked={mode === 'amount'} onChange={() => setMode('amount')}>
                <Trans>Kwotę w zł</Trans>
              </Radio>
            </fieldset>
          </>
        )}

        {kind === 'gold' && (
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">
              <Trans>Jakie złoto?</Trans>
            </legend>
            <Radio name="gold-kind" checked={variant === 'direct'} onChange={() => setVariant('direct')}>
              <Trans>Fizyczne (sztabki, monety)</Trans>
            </Radio>
            <Radio name="gold-kind" checked={variant === 'etf'} onChange={() => setVariant('etf')}>
              <Trans>ETF na złoto</Trans>
            </Radio>
          </fieldset>
        )}

        {kind === 'custom' && (
          <>
            <Field label={t`Nazwa`}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  maxLength={CUSTOM_NAME_MAX}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <PercentInput
              label={t`Oczekiwany roczny wzrost`}
              hint={t`To założenie, nie prognoza. Zmienisz je później w Założeniach.`}
              value={g}
              onChange={setG}
            />
            <PercentInput
              label={t`Roczna zmienność`}
              hint={t`Typowe wahania roku: akcje około 15-20%, bitcoin ponad 50%.`}
              value={sigma}
              onChange={setSigma}
            />
          </>
        )}

        {byUnits ? (
          <>
            <MoneyInput label={t`Liczba BTC`} suffix="BTC" value={units} onChange={setUnits} placeholder="0,35" />
            <MoneyInput
              label={t`Cena 1 BTC (zł), wymagana`}
              suffix="zł"
              required
              value={price}
              onChange={(v) => {
                setPrice(v);
                setFetchedAt(null);
                setFetchState('idle');
              }}
              hint={t`Wpisz cenę 1 BTC w złotych, np. z giełdy. Aplikacja nie pobiera cen sama i działa bez internetu, więc cenę możesz podać ręcznie.`}
              error={units !== null && units > 0 && !priceOk ? t`Bez ceny nie przeliczymy BTC na złotówki.` : null}
            />
            <div className="flex flex-col gap-1">
              <Button
                variant="secondary"
                onClick={() => void loadPrice()}
                disabled={fetchState === 'loading'}
                className="self-start"
              >
                <Trans>Pobierz cenę</Trans>
              </Button>
              <div role="status" className="text-sm text-muted">
                {fetchState === 'loading' && <Trans>Pobieram cenę…</Trans>}
                {fetchState === 'error' && (
                  <Trans>Nie udało się pobrać ceny (brak sieci lub limit). Wpisz ją ręcznie powyżej.</Trans>
                )}
                {fetchState === 'ok' && fetchedAt !== null && (
                  <Trans>Cena z CoinGecko, pobrana {ageText(fetchedAt)}. Możesz ją poprawić. Powered by CoinGecko</Trans>
                )}
              </div>
            </div>
            {value !== null && (
              <p className="text-sm">
                <Trans>Wartość pozycji: {formatMoney(value, baseCurrency)}</Trans>
              </p>
            )}
          </>
        ) : (
          <MoneyInput
            label={t`Kwota`}
            suffix="zł"
            value={amount}
            onChange={setAmount}
            hint={
              kind === 'edo'
                ? t`Wartość Twoich obligacji EDO dziś.`
                : kind === 'rental'
                  ? t`Wartość rynkowa mieszkania dziś. Czynsz netto (zakładane 3,5% wartości rocznie) trafia co miesiąc do gotówki po ryczałcie; mieszkanie nie bierze udziału w rebalansie ani wypłatach.`
                  : undefined
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!valid}>
            <Trans>Dodaj do portfela</Trans>
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            <Trans>Anuluj</Trans>
          </Button>
        </div>
      </form>
    </Card>
  );
}
