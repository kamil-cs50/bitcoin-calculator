import { useLingui } from '@lingui/react/macro';
import type { RunResult, Scenario } from '@sim/engine';
import { summarize, wilson } from '@sim/engine';
import { useMemo, type ReactNode } from 'react';
import { Card } from '../../components/ui/Card';
import { formatMoney, naturalFrequency } from '../../lib/format';
import { capitalize, yearsText } from './periods';

export interface KpiTilesProps {
  result: RunResult;
  scenario: Scenario;
  month: number;
  real: boolean;
  afterTax: boolean;
  expert: boolean;
}

const Big = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p data-testid={testId} className="m-0 text-3xl font-semibold tabular-nums">
    {children}
  </p>
);
const Note = ({ children }: { children: ReactNode }) => <p className="m-0 mt-1 text-sm text-muted">{children}</p>;

/** Kafelki KPI (spec 5.1): wszystkie liczby w jednej walucie bazowej, 2 cyfry znaczące, częstości naturalne. */
export function KpiTiles({ result, scenario, month, real, afterTax, expert }: KpiTilesProps) {
  const { t } = useLingui();
  const cur = scenario.baseCurrency;
  const money = (v: number) => formatMoney(v, cur, { sigDigits: 2 });
  const s = useMemo(() => summarize(result, scenario, { month, real, afterTax }), [result, scenario, month, real, afterTax]);
  // ryzyko dużego spadku dotyczy całego okresu (maksymalne obsunięcie), niezależnie od wybranego roku
  const deep = useMemo(() => {
    let k = 0;
    for (let p = 0; p < result.paths; p++) if (result.maxDrawdown[p]! > 0.3) k++;
    return { p: result.paths > 0 ? k / result.paths : 0, ci: wilson(k, result.paths) };
  }, [result]);
  const years = yearsText(month);
  const basis = real ? t`w dzisiejszych zł` : t`nominalnie`;
  const half = (ci: [number, number]) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(((ci[1] - ci[0]) / 2) * 100);
  const goalPp = s.probGoal ? half(s.probGoal.ci) : '';
  const deepPp = half(deep.ci);
  const lossPp = half(s.probRealLoss.ci);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title={t`Typowy wynik za ${years} (${basis})`}>
        <Big testId="kpi-median">{money(s.median)}</Big>
        <Note>{afterTax ? t`Mediana, po podatku` : t`Mediana, przed podatkiem`}</Note>
      </Card>
      <Card title={t`Zakres wyników`}>
        <p data-testid="kpi-range" className="m-0 text-xl font-semibold tabular-nums">
          {t`W 8 na 10 przyszłości między ${money(s.p10)} a ${money(s.p90)}`}
        </p>
        <Note>{t`Przedział od 10. do 90. percentyla`}</Note>
      </Card>
      {s.probGoal && scenario.goal && (
        <Card title={t`Szansa na cel`}>
          <Big>{capitalize(naturalFrequency(s.probGoal.p))}</Big>
          <Note>
            {t`Cel: ${money(scenario.goal.amountReal)} w dzisiejszych zł za ${yearsText(scenario.goal.month)} (±${goalPp} pp)`}
          </Note>
        </Card>
      )}
      <Card title={t`Ryzyko spadku o ponad 30%`}>
        <Big>{capitalize(naturalFrequency(deep.p))}</Big>
        <Note>{t`portfel traci ponad 30% od swojego szczytu (cały okres, ±${deepPp} pp)`}</Note>
      </Card>
      <Card title={t`Najgorsze 5% przyszłości: średnio`}>
        <Big>{money(s.cvar5)}</Big>
        <Note>{t`Średnia wartość w najgorszych 5 na 100 przyszłości`}</Note>
      </Card>
      <Card title={t`Szansa straty realnej`}>
        <Big>{capitalize(naturalFrequency(s.probRealLoss.p))}</Big>
        <Note>{t`wartość portfela niższa niż dziś po uwzględnieniu inflacji (±${lossPp} pp)`}</Note>
      </Card>
      {scenario.withdrawal && s.probRuin.p > 0 && (
        <Card title={t`Szansa wyczerpania portfela`}>
          <Big>{capitalize(naturalFrequency(s.probRuin.p))}</Big>
          <Note>{t`pieniądze kończą się przed wybranym rokiem`}</Note>
        </Card>
      )}
      {expert && (
        <Card title={t`Średnia (tryb eksperta)`}>
          <Big>{money(s.mean)}</Big>
          <Note>
            {t`Średnia jest zawyżana przez rzadkie, skrajnie dobre scenariusze, dlatego jako typowy wynik pokazujemy medianę.`}
          </Note>
        </Card>
      )}
    </div>
  );
}
