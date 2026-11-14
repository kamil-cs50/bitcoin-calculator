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
  const [monthly, setMonthly] = useState<number | null>(null);
  const [withdraw, setWithdraw] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(null);

  const total = scenario.positions.reduce((a, p) => a + p.value, 0);
  const yearsOk = years !== null && Number.isInteger(years) && years >= 1 && years <= 60;

  function savePlan() {
    if (!yearsOk || years === null) return;
    const horizonMonths = years * MONTHS_PER_YEAR;
    const next = { ...scenario, horizonMonths };
    if (monthly && monthly > 0) {
      next.contribution = { monthly, endMonth: horizonMonths, indexation: 'none', realGrowth: 0 };
    } else delete next.contribution;
    if (withdraw && withdraw > 0) {
      next.withdrawal = { kind: 'fixedReal', startMonth: horizonMonths, monthly: withdraw };
    } else delete next.withdrawal;
    if (goal && goal > 0) next.goal = { amountReal: goal, month: horizonMonths };
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
              label={t`Wypłata miesięczna po horyzoncie (w dzisiejszych zł)`}
              suffix="zł"
              value={withdraw}
              onChange={setWithdraw}
              hint={t`Opcjonalnie. Zaczyna się po zakończeniu horyzontu.`}
            />
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
              <Button disabled={!yearsOk} onClick={savePlan}>
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
