import { useLingui } from '@lingui/react/macro';
import type { RunResult, Scenario } from '@sim/engine';
import { summarize } from '@sim/engine';
import { useMemo } from 'react';
import { Badge } from '../../components/ui/Badge';

export interface QualityBadgeProps {
  result: RunResult;
  scenario: Scenario;
  running: boolean;
  /** `undefined` = kontrola modelu jeszcze nie policzona (plakietka się nie pokazuje). */
  calibrated?: boolean;
}

/**
 * „10 000 przyszłości · dokładność ±0,9 pp”: połowa szerokości 95% przedziału Wilsona dla szansy celu
 * (bez celu: dla szansy realnej straty), plus stan liczenia i plakietka kalibracji modelu.
 */
export function QualityBadge({ result, scenario, running, calibrated }: QualityBadgeProps) {
  const { t } = useLingui();
  const half = useMemo(() => {
    const month = scenario.goal?.month ?? scenario.horizonMonths;
    const s = summarize(result, scenario, { month, real: true, afterTax: true });
    const { ci } = s.probGoal ?? s.probRealLoss;
    return ((ci[1] - ci[0]) / 2) * 100;
  }, [result, scenario]);
  const n = new Intl.NumberFormat('pl-PL').format(result.paths);
  const pp = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(half);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span data-testid="quality" className="text-sm font-medium tabular-nums">
        {t`${n} przyszłości · dokładność ±${pp} pp`}
      </span>
      {running && <Badge tone="neutral">{t`liczę dalej, wynik się doprecyzuje`}</Badge>}
      {calibrated === true && <Badge tone="ok">{t`model skalibrowany ✓`}</Badge>}
    </div>
  );
}
