import { useLingui } from '@lingui/react/macro';
import type { RunResult, Scenario } from '@sim/engine';
import { summarize } from '@sim/engine';
import { useMemo } from 'react';
import { Badge } from '../../components/ui/Badge';
import { numberLocale } from '../../i18n';

export interface QualityBadgeProps {
  result: RunResult;
  scenario: Scenario;
  running: boolean;
  /** `undefined` = kontrola modelu jeszcze nie policzona (plakietka się nie pokazuje). */
  calibrated?: boolean;
  /** Plakietka kalibracji w tym miejscu (domyślnie tak); Dashboard v3 pokazuje ją przy wyniku głównym. */
  showCalibration?: boolean;
}

/** „● Model skalibrowany ✓” (projekt v3: przy opisie mediany). */
export function CalibrationBadge() {
  const { t } = useLingui();
  return (
    <span className="eyebrow inline-flex items-center gap-2.5 !text-fg">
      <span aria-hidden="true" className="size-[7px] rounded-full bg-[#7fa8ff] shadow-[0_0_12px_#4d7dff]" />
      {t`model skalibrowany ✓`}
    </span>
  );
}

/**
 * „10 000 przyszłości · dokładność ±0,9 pp”: połowa szerokości 95% przedziału Wilsona dla szansy celu
 * (bez celu: dla szansy realnej straty), plus stan liczenia i plakietka kalibracji modelu.
 */
export function QualityBadge({ result, scenario, running, calibrated, showCalibration = true }: QualityBadgeProps) {
  const { t } = useLingui();
  const half = useMemo(() => {
    const month = scenario.goal?.month ?? scenario.horizonMonths;
    const s = summarize(result, scenario, { month, real: true, afterTax: true });
    const { ci } = s.probGoal ?? s.probRealLoss;
    return ((ci[1] - ci[0]) / 2) * 100;
  }, [result, scenario]);
  const n = new Intl.NumberFormat(numberLocale()).format(result.paths);
  const pp = new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(half);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span data-testid="quality" className="tabular-nums">
        {t`${n} przyszłości · ±${pp} pp`}
      </span>
      {running && <Badge tone="neutral">{t`liczę dalej, wynik się doprecyzuje`}</Badge>}
      {showCalibration && calibrated === true && <CalibrationBadge />}
    </div>
  );
}
