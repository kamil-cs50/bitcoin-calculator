import { Trans, useLingui } from '@lingui/react/macro';
import type { Withdrawal } from '@sim/engine';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Card } from '../../components/ui/Card';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PercentInput } from '../../components/ui/PercentInput';
import { useScenarioStore } from '../../state/scenarioStore';
import { estimateRealReturn } from './estimate';
import { numberLocale } from '../../i18n';
import { currencyWord } from '../results/basis';

type Kind = 'none' | Withdrawal['kind'];

const MONTHS_PER_YEAR = 12;

/** Opcja radiowa z opisem w prostym języku, powiązanym przez aria-describedby. */
export function RadioOption({
  name,
  checked,
  onChange,
  label,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label className="flex min-h-11 items-center gap-2 text-base">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          aria-describedby={description ? `${id}-d` : undefined}
          className="size-5"
        />
        {label}
      </label>
      {description && (
        <p id={`${id}-d`} className="m-0 ml-7 text-sm text-muted">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * Start wypłat wpisany przez użytkownika, ale nie na końcu horyzontu ani po nim (wypłata nic by wtedy nie
 * robiła): taki start przesuwamy na ostatni rok planu. Wpisana wartość zostaje w formularzu, więc wydłużenie
 * horyzontu (także w trakcie pisania) przywraca zamierzony start.
 */
export function effectiveStart(startYears: number | null, horizonMonths: number): number {
  const raw = Math.round((startYears ?? 0) * MONTHS_PER_YEAR);
  return raw >= horizonMonths ? Math.max(0, horizonMonths - MONTHS_PER_YEAR) : raw;
}

function buildWithdrawal(
  kind: Kind,
  f: { monthly: number | null; rate: number | null; startYears: number | null; floor: number | null; cap: number | null },
  est: number | null,
  horizonMonths: number,
): Withdrawal | undefined {
  const startMonth = effectiveStart(f.startYears, horizonMonths);
  if (kind === 'fixedReal') {
    return f.monthly && f.monthly > 0 ? { kind, startMonth, monthly: f.monthly } : undefined;
  }
  if (kind === 'percent') {
    return f.rate && f.rate > 0 ? { kind, startMonth, rate: f.rate } : undefined;
  }
  if (kind === 'guytonKlinger') {
    return f.rate && f.rate > 0 ? { kind, startMonth, initialRate: f.rate, guardrail: 0.2, adjustment: 0.1, inflationCap: 0.06 } : undefined;
  }
  if (kind === 'abw' && est !== null) {
    return {
      kind,
      startMonth,
      expectedRealReturn: est,
      ...(f.floor && f.floor > 0 ? { floor: f.floor } : {}),
      ...(f.cap && f.cap > 0 ? { cap: f.cap } : {}),
    };
  }
  return undefined;
}

/** Wypłaty: cztery strategie (spec 4.11) z opisami; ABW bierze `r` z `estimateRealReturn`. */
export function WithdrawalForm() {
  const { t } = useLingui();
  const initial = useScenarioStore.getState().scenario.withdrawal;
  const horizonMonths = useScenarioStore((s) => s.scenario.horizonMonths);
  const positions = useScenarioStore((s) => s.scenario.positions);
  const assets = useScenarioStore((s) => s.scenario.assets);
  const market = useScenarioStore((s) => s.scenario.market);
  const baseCurrency = useScenarioStore((s) => s.scenario.baseCurrency);

  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'none');
  const [monthly, setMonthly] = useState<number | null>(initial?.kind === 'fixedReal' ? initial.monthly : null);
  const [rate, setRate] = useState<number | null>(
    initial?.kind === 'percent' ? initial.rate : initial?.kind === 'guytonKlinger' ? initial.initialRate : null,
  );
  const [startYears, setStartYears] = useState<number | null>(initial ? initial.startMonth / MONTHS_PER_YEAR : null);
  const [floor, setFloor] = useState<number | null>(initial?.kind === 'abw' ? (initial.floor ?? null) : null);
  const [cap, setCap] = useState<number | null>(initial?.kind === 'abw' ? (initial.cap ?? null) : null);
  const [est, setEst] = useState<number | null>(initial?.kind === 'abw' ? initial.expectedRealReturn : null);
  const [estState, setEstState] = useState<'idle' | 'loading' | 'error'>('idle');

  // r dla ABW: przeliczane po wyborze strategii i przy każdej zmianie portfela, rynku lub horyzontu.
  useEffect(() => {
    if (kind !== 'abw') return;
    let cancelled = false;
    setEstState('loading');
    estimateRealReturn(useScenarioStore.getState().scenario).then(
      (r) => {
        if (cancelled) return;
        setEst(r);
        setEstState('idle');
      },
      () => {
        if (cancelled) return;
        setEst(null);
        setEstState('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, positions, assets, market, baseCurrency, horizonMonths]);

  // Formularz -> scenariusz (tylko gdy wypłata jest kompletna i coś się zmieniło).
  useEffect(() => {
    const next = buildWithdrawal(kind, { monthly, rate, startYears, floor, cap }, est, horizonMonths);
    const st = useScenarioStore.getState();
    if (JSON.stringify(next) === JSON.stringify(st.scenario.withdrawal)) return;
    const { withdrawal: _old, ...rest } = st.scenario;
    void _old;
    st.setScenario(next ? { ...rest, withdrawal: next } : rest);
  }, [kind, monthly, rate, startYears, floor, cap, est, horizonMonths]);

  const startMonth = Math.round((startYears ?? 0) * MONTHS_PER_YEAR);
  const afterHorizon = kind !== 'none' && startMonth > horizonMonths;

  return (
    <Card title={t`Wypłaty`}>
      <div className="flex flex-col gap-4">
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">
            <Trans>Jak chcesz wypłacać pieniądze?</Trans>
          </legend>
          <RadioOption
            name="withdrawal-kind"
            checked={kind === 'none'}
            onChange={() => setKind('none')}
            label={t`Brak wypłat`}
            description={t`Tylko oszczędzasz i patrzysz, ile urośnie portfel.`}
          />
          <RadioOption
            name="withdrawal-kind"
            checked={kind === 'fixedReal'}
            onChange={() => setKind('fixedReal')}
            label={t`Stała kwota`}
            description={t`Wypłacasz co miesiąc tyle samo w dzisiejszych pieniądzach (kwota rośnie razem z cenami).`}
          />
          <RadioOption
            name="withdrawal-kind"
            checked={kind === 'percent'}
            onChange={() => setKind('percent')}
            label={t`Stały procent portfela`}
            description={t`Co roku bierzesz stały ułamek tego, co zostało. Portfel nigdy się nie wyczerpuje, ale wypłata rośnie i maleje razem z rynkiem.`}
          />
          <RadioOption
            name="withdrawal-kind"
            checked={kind === 'abw'}
            onChange={() => setKind('abw')}
            label={t`Amortyzacja (ABW)`}
            description={t`Co roku aplikacja rozkłada majątek równo na pozostałe lata, więc do końca horyzontu środki dobiegają zera. Możesz ustawić dolną i górną granicę wypłaty.`}
          />
          <RadioOption
            name="withdrawal-kind"
            checked={kind === 'guytonKlinger'}
            onChange={() => setKind('guytonKlinger')}
            label={t`Reguły Guytona–Klingera`}
            description={t`Zaczynasz od stałego procentu portfela, a potem co roku podnosisz wypłatę o inflację. Gdy rynek mocno spada i wypłata staje się zbyt duża w stosunku do portfela, tniesz ją o 10%; gdy portfel mocno rośnie, podnosisz ją o 10%. Po roku ze stratą nie podwyższasz wypłaty o inflację.`}
          />
        </fieldset>

        {kind === 'fixedReal' && (
          <MoneyInput
            label={t`Kwota miesięczna`}
            suffix={currencyWord('PLN')}
            value={monthly}
            onChange={setMonthly}
            hint={t`W dzisiejszych pieniądzach.`}
          />
        )}
        {kind === 'percent' && (
          <PercentInput
            label={t`Procent rocznie`}
            value={rate}
            onChange={setRate}
            hint={t`Ustalany w styczniu od wartości portfela, wypłacany w 12 ratach.`}
          />
        )}
        {kind === 'guytonKlinger' && (
          <PercentInput
            label={t`Procent na start`}
            value={rate}
            onChange={setRate}
            hint={t`Pierwsza wypłata to ten ułamek portfela w roku startu. Potem co styczeń sprawdzamy, czy wypłata nie wyszła poza pasmo ±20% tej stopy.`}
          />
        )}
        {kind === 'abw' && (
          <>
            <div role="status" className="text-sm text-muted">
              {estState === 'loading' && <Trans>Szacuję typowy zwrot portfela…</Trans>}
              {estState === 'error' && <Trans>Nie udało się oszacować zwrotu portfela.</Trans>}
              {estState === 'idle' && est !== null && (
                <Trans>
                  Zakładany typowy zwrot realny portfela: {(est * 100).toLocaleString(numberLocale(), { maximumFractionDigits: 1 })}% rocznie
                  (mediana z symulacji, po kosztach).
                </Trans>
              )}
            </div>
            <MoneyInput
              label={t`Podłoga (zł miesięcznie, opcjonalnie)`}
              suffix={currencyWord('PLN')}
              value={floor}
              onChange={setFloor}
              hint={t`Wypłata nie spadnie poniżej tej kwoty (w dzisiejszych pieniądzach).`}
            />
            <MoneyInput
              label={t`Sufit (zł miesięcznie, opcjonalnie)`}
              suffix={currencyWord('PLN')}
              value={cap}
              onChange={setCap}
              hint={t`Wypłata nie wzrośnie powyżej tej kwoty (w dzisiejszych pieniądzach).`}
            />
          </>
        )}
        {kind !== 'none' && (
          <MoneyInput
            label={t`Wypłacaj od roku`}
            value={startYears}
            onChange={setStartYears}
            hint={t`Za ile lat zaczynasz wypłaty. Puste albo 0 oznacza: od razu.`}
            error={afterHorizon ? t`Ten rok wypada po końcu horyzontu, więc wypłaty zaczniemy w ostatnim roku planu.` : null}
          />
        )}
      </div>
    </Card>
  );
}
