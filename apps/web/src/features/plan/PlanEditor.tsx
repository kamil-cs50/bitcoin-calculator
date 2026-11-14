import { Trans, useLingui } from '@lingui/react/macro';
import { validateScenario } from '@sim/engine';
import type { Contribution, Scenario } from '@sim/engine';
import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PercentInput } from '../../components/ui/PercentInput';
import { useScenarioStore } from '../../state/scenarioStore';
import { RadioOption, WithdrawalForm } from './WithdrawalForm';

const MONTHS_PER_YEAR = 12;
const monthsOf = (years: number): number => Math.round(years * MONTHS_PER_YEAR);

interface Flows {
  monthly: number | null;
  indexation: Contribution['indexation'];
  realGrowth: number | null;
  /** Przez ile lat wpłacasz; null = do końca horyzontu. */
  contribYears: number | null;
  goalAmount: number | null;
  /** Za ile lat cel; null = na końcu horyzontu. */
  goalYears: number | null;
}

const goalMonth = (f: Flows, horizonMonths: number): number =>
  f.goalYears === null ? horizonMonths : monthsOf(f.goalYears);
const goalInvalid = (f: Flows, horizonMonths: number): boolean =>
  f.goalAmount !== null && f.goalAmount > 0 && (goalMonth(f, horizonMonths) < 1 || goalMonth(f, horizonMonths) > horizonMonths);

/** Wpłaty i cel wynikają z formularza i horyzontu; zapis do store tylko przez tę funkcję. */
function applyFlows(base: Scenario, f: Flows, horizonMonths: number): Scenario {
  const { contribution: _c, goal: _g, ...rest } = base;
  void _c;
  void _g;
  const next: Scenario = { ...rest, horizonMonths };
  if (f.monthly !== null && f.monthly > 0) {
    const end = f.contribYears === null ? horizonMonths : Math.min(monthsOf(f.contribYears), horizonMonths);
    next.contribution = {
      monthly: f.monthly,
      endMonth: end,
      indexation: f.indexation,
      realGrowth: f.indexation === 'cpiPlus' ? (f.realGrowth ?? 0) : 0,
    };
  }
  if (f.goalAmount !== null && f.goalAmount > 0 && !goalInvalid(f, horizonMonths)) {
    next.goal = { amountReal: f.goalAmount, month: goalMonth(f, horizonMonths) };
  }
  return next;
}

/** Edytor planu: horyzont (lata albo wiek), wpłaty, wypłaty i cel. */
export function PlanEditor() {
  const { t } = useLingui();
  const horizonMonths = useScenarioStore((s) => s.scenario.horizonMonths);
  const initial = useScenarioStore.getState().scenario;

  const [mode, setMode] = useState<'years' | 'age'>('years');
  const [years, setYears] = useState<number | null>(horizonMonths / MONTHS_PER_YEAR);
  const [ageNow, setAgeNow] = useState<number | null>(null);
  const [ageTarget, setAgeTarget] = useState<number | null>(null);
  const [flows, setFlows] = useState<Flows>(() => ({
    monthly: initial.contribution?.monthly ?? null,
    indexation: initial.contribution?.indexation ?? 'none',
    realGrowth: initial.contribution?.realGrowth ?? null,
    contribYears:
      initial.contribution && initial.contribution.endMonth < initial.horizonMonths
        ? initial.contribution.endMonth / MONTHS_PER_YEAR
        : null,
    goalAmount: initial.goal?.amountReal ?? null,
    goalYears: initial.goal && initial.goal.month !== initial.horizonMonths ? initial.goal.month / MONTHS_PER_YEAR : null,
  }));

  const candidate =
    mode === 'years'
      ? years === null
        ? null
        : monthsOf(years)
      : ageNow === null || ageTarget === null
        ? null
        : monthsOf(ageTarget - ageNow);

  // Walidacja horyzontu robi silnik (1..960 miesięcy); do store trafia tylko poprawny.
  const horizonOk = candidate !== null && validateScenario({ ...initial, horizonMonths: candidate }).ok;
  const horizonError =
    candidate === null || horizonOk
      ? null
      : mode === 'age' && candidate < 1
        ? t`Wiek docelowy musi być większy niż Twój obecny wiek.`
        : t`Horyzont może mieć od 1 miesiąca do 80 lat.`;

  function commit(nextFlows: Flows, nextHorizon: number): void {
    setFlows(nextFlows);
    const st = useScenarioStore.getState();
    st.setScenario(applyFlows(st.scenario, nextFlows, nextHorizon));
  }
  function setHorizon(months: number | null): void {
    if (months === null) return;
    const st = useScenarioStore.getState();
    if (!validateScenario({ ...st.scenario, horizonMonths: months }).ok) return;
    commit(flows, months);
  }
  const patch = (p: Partial<Flows>): void => commit({ ...flows, ...p }, horizonMonths);

  const contribOn = flows.monthly !== null && flows.monthly > 0;
  const contribYearsError =
    contribOn && flows.contribYears !== null && monthsOf(flows.contribYears) > horizonMonths
      ? t`Wpłaty trwają najwyżej do końca horyzontu.`
      : null;
  const goalError = goalInvalid(flows, horizonMonths) ? t`Cel musi przypadać w horyzoncie planu.` : null;

  return (
    <div className="flex flex-col gap-4">
      <Card title={t`Horyzont`}>
        <div className="flex flex-col gap-3">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">
              <Trans>Jak podać długość planu?</Trans>
            </legend>
            <RadioOption
              name="horizon-mode"
              checked={mode === 'years'}
              onChange={() => setMode('years')}
              label={t`Liczba lat`}
            />
            <RadioOption
              name="horizon-mode"
              checked={mode === 'age'}
              onChange={() => setMode('age')}
              label={t`Do wieku`}
            />
          </fieldset>
          {mode === 'years' ? (
            <MoneyInput
              label={t`Horyzont (lata)`}
              suffix={t`lat`}
              value={years}
              onChange={(v) => {
                setYears(v);
                setHorizon(v === null ? null : monthsOf(v));
              }}
              hint={t`Od 1 miesiąca do 80 lat.`}
              error={horizonError}
            />
          ) : (
            <>
              <MoneyInput
                label={t`Mój wiek`}
                suffix={t`lat`}
                value={ageNow}
                onChange={(v) => {
                  setAgeNow(v);
                  if (v !== null && ageTarget !== null) setHorizon(monthsOf(ageTarget - v));
                }}
              />
              <MoneyInput
                label={t`Wiek docelowy`}
                suffix={t`lat`}
                value={ageTarget}
                onChange={(v) => {
                  setAgeTarget(v);
                  if (v !== null && ageNow !== null) setHorizon(monthsOf(v - ageNow));
                }}
                hint={t`Do jakiego wieku ma wystarczyć plan.`}
                error={horizonError}
              />
            </>
          )}
          <p className="m-0 text-sm text-muted" aria-live="polite">
            <Trans>Plan obejmuje {horizonMonths / MONTHS_PER_YEAR} lat.</Trans>
          </p>
        </div>
      </Card>

      <Card title={t`Wpłaty`}>
        <div className="flex flex-col gap-3">
          <MoneyInput
            label={t`Wpłata miesięczna`}
            suffix="zł"
            value={flows.monthly}
            onChange={(v) => patch({ monthly: v })}
            hint={t`Ile odkładasz co miesiąc. Puste albo 0 oznacza brak wpłat.`}
          />
          {contribOn && (
            <>
              <Field
                label={t`Indeksacja wpłat`}
                hint={t`Czy wpłata rośnie z czasem, żeby nadążać za cenami.`}
              >
                {(p) => (
                  <select
                    {...p}
                    className={inputClass}
                    value={flows.indexation}
                    onChange={(e) => patch({ indexation: e.target.value as Contribution['indexation'] })}
                  >
                    <option value="none">{t`Bez indeksacji (stała kwota)`}</option>
                    <option value="cpi">{t`Inflacją`}</option>
                    <option value="cpiPlus">{t`Inflacją i realnym wzrostem`}</option>
                  </select>
                )}
              </Field>
              {flows.indexation === 'cpiPlus' && (
                <PercentInput
                  label={t`Realny wzrost wpłat rocznie`}
                  value={flows.realGrowth}
                  onChange={(v) => patch({ realGrowth: v })}
                  hint={t`Ponad inflację, np. gdy zarobki rosną szybciej niż ceny.`}
                />
              )}
              <MoneyInput
                label={t`Wpłacaj przez (lat)`}
                suffix={t`lat`}
                value={flows.contribYears}
                onChange={(v) => patch({ contribYears: v })}
                hint={t`Puste oznacza: do końca horyzontu.`}
                error={contribYearsError}
              />
            </>
          )}
        </div>
      </Card>

      <WithdrawalForm />

      <Card title={t`Cel`}>
        <div className="flex flex-col gap-3">
          <MoneyInput
            label={t`Kwota celu`}
            suffix="zł"
            value={flows.goalAmount}
            onChange={(v) => patch({ goalAmount: v })}
            hint={t`W dzisiejszych pieniądzach, np. 1 000 000 zł. Puste oznacza brak celu.`}
          />
          {flows.goalAmount !== null && flows.goalAmount > 0 && (
            <MoneyInput
              label={t`Cel za ile lat`}
              suffix={t`lat`}
              value={flows.goalYears}
              onChange={(v) => patch({ goalYears: v })}
              hint={t`Puste oznacza: na końcu horyzontu.`}
              error={goalError}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
