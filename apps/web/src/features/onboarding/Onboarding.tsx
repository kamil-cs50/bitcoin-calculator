import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { formatMoney } from '../../lib/format';
import { useScenarioStore } from '../../state/scenarioStore';
import { AssetPicker } from '../portfolio/PortfolioEditor';
import { useAssetNames } from '../portfolio/tiles';

const MONTHS_PER_YEAR = 12;

/** Start w trzech krokach: (1) co masz, (2) plan, (3) wynik. Działa w całości bez sieci. */
export function Onboarding() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const names = useAssetNames();
  const scenario = useScenarioStore((s) => s.scenario);
  const setScenario = useScenarioStore((s) => s.setScenario);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formOpen, setFormOpen] = useState(false);
  const [years, setYears] = useState<number | null>(scenario.horizonMonths / MONTHS_PER_YEAR);
  // Pola startują od tego, co już jest w planie (np. z edytora planu), żeby powrót tu niczego nie kasował.
  const [monthly, setMonthly] = useState<number | null>(scenario.contribution?.monthly ?? null);
  const fixed = scenario.withdrawal?.kind === 'fixedReal' ? scenario.withdrawal : undefined;
  const [withdraw, setWithdraw] = useState<number | null>(fixed?.monthly ?? null);
  const [startYears, setStartYears] = useState<number | null>(fixed ? fixed.startMonth / MONTHS_PER_YEAR : null);
  const [goal, setGoal] = useState<number | null>(scenario.goal?.amountReal ?? null);

  const total = scenario.positions.reduce((a, p) => a + p.value, 0);
  const yearsOk = years !== null && Number.isInteger(years) && years >= 1 && years <= 60;

  const horizonNow = yearsOk && years !== null ? years * MONTHS_PER_YEAR : scenario.horizonMonths;
  const startMonth = Math.round((startYears ?? 0) * MONTHS_PER_YEAR);
  const withdrawOn = withdraw !== null && withdraw > 0;
  const startBad = withdrawOn && (startYears !== null && startYears < 0 ? true : startMonth >= horizonNow);
  /** Miesiąc „do końca horyzontu” podąża za nowym horyzontem; wcześniejszy zostaje (ucięty do horyzontu). */
  const follow = (month: number, oldHorizon: number, horizon: number): number =>
    month >= oldHorizon ? horizon : Math.min(month, horizon);

  function savePlan() {
    if (!yearsOk || years === null || startBad) return;
    const horizonMonths = years * MONTHS_PER_YEAR;
    const old = scenario.horizonMonths;
    const next = { ...scenario, horizonMonths };
    const c = scenario.contribution;
    if (monthly && monthly > 0) {
      next.contribution = {
        indexation: 'none',
        realGrowth: 0,
        ...c,
        monthly,
        endMonth: c ? follow(c.endMonth, old, horizonMonths) : horizonMonths,
      };
    } else delete next.contribution;
    if (withdrawOn) {
      next.withdrawal = { kind: 'fixedReal', startMonth, monthly: withdraw };
    } else if (scenario.withdrawal && scenario.withdrawal.kind !== 'fixedReal') {
      // procent / amortyzacja z edytora planu zostają; ich start nie może wypaść poza nowy horyzont
      const w = scenario.withdrawal;
      next.withdrawal = w.startMonth >= horizonMonths ? { ...w, startMonth: Math.max(0, horizonMonths - MONTHS_PER_YEAR) } : w;
    } else delete next.withdrawal;
    const g = scenario.goal;
    if (goal && goal > 0) next.goal = { amountReal: goal, month: g ? follow(g.month, old, horizonMonths) : horizonMonths };
    else delete next.goal;
    setScenario(next);
    setStep(3);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted" aria-live="polite">
        <Trans>Krok {step} z 3</Trans>
      </p>

      {step === 1 && (
        <>
          <Card title={t`Co masz?`}>
            <p className="mb-3 text-muted">
              <Trans>
                Wybierz aktywa i wpisz kwotę w złotych. Dane zostają na tym urządzeniu. Aplikacja nie pobiera
                żadnych cen, dopóki sam o to nie poprosisz.
              </Trans>
            </p>
            <AssetPicker onOpenChange={setFormOpen} />
          </Card>
          {scenario.positions.length > 0 && (
            <Card title={t`Twój portfel`}>
              <ul className="m-0 list-none space-y-1 p-0">
                {scenario.positions.map((p, i) => (
                  <li key={`${p.assetId}-${i}`} className="flex justify-between gap-2">
                    <span>{names.asset(p.assetId)}</span>
                    <span className="num">{formatMoney(p.value, scenario.baseCurrency)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div>
            <Button disabled={scenario.positions.length === 0 || formOpen} onClick={() => setStep(2)}>
              <Trans>Dalej</Trans>
            </Button>
            {formOpen && (
              <p className="mt-1 text-sm text-muted">
                <Trans>Dodaj otwartą pozycję albo kliknij „Anuluj”, żeby przejść dalej.</Trans>
              </p>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <Card title={t`Plan`}>
          <div className="flex flex-col gap-4">
            <MoneyInput
              label={t`Horyzont (lata)`}
              suffix={t`lat`}
              value={years}
              onChange={setYears}
              error={years !== null && !yearsOk ? t`Podaj pełną liczbę lat od 1 do 60.` : null}
            />
            <MoneyInput
              label={t`Wpłata miesięczna`}
              suffix="zł"
              value={monthly}
              onChange={setMonthly}
              hint={t`Możesz zostawić puste, jeśli nie dopłacasz.`}
            />
            <MoneyInput
              label={t`Wypłata miesięczna (w dzisiejszych zł)`}
              suffix="zł"
              value={withdraw}
              onChange={setWithdraw}
              hint={t`Opcjonalnie. Domyślnie zaczyna się od razu; rok startu podasz poniżej.`}
            />
            {withdrawOn && (
              <MoneyInput
                label={t`Wypłacaj od roku`}
                suffix={t`lat`}
                value={startYears}
                onChange={setStartYears}
                hint={t`Za ile lat zaczynasz wypłaty. Puste albo 0 oznacza: od razu.`}
                error={startBad ? t`Wypłaty muszą zacząć się przed końcem horyzontu.` : null}
              />
            )}
            <MoneyInput
              label={t`Cel (w dzisiejszych zł)`}
              suffix="zł"
              value={goal}
              onChange={setGoal}
              hint={t`Opcjonalnie: kwota, którą chcesz mieć na końcu horyzontu.`}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <Trans>Wstecz</Trans>
              </Button>
              <Button disabled={!yearsOk || startBad} onClick={savePlan}>
                <Trans>Dalej</Trans>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title={t`Gotowe`}>
          <p>
            <Trans>
              Portfel: {scenario.positions.length} poz., razem {formatMoney(total, scenario.baseCurrency)}.
              Horyzont: {scenario.horizonMonths / MONTHS_PER_YEAR} lat.
            </Trans>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <Trans>Wstecz</Trans>
            </Button>
            <Button onClick={() => void navigate('/wynik')}>
              <Trans>Pokaż wynik</Trans>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
