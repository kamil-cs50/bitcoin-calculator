import { useLingui } from '@lingui/react/macro';
import type { Param } from '@sim/data';
import { Card } from '../../components/ui/Card';
import { formatMoney } from '../../lib/format';
import { numberLocale } from '../../i18n';
import { useScenarioStore } from '../../state/scenarioStore';
import { ReadOnlyParamRow } from './ParamRow';

const pct = (v: number): string => `${new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 2 }).format(v * 100)}%`;
const num = (v: number): string => new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 2 }).format(v);

/** Zasady wypłat z IKE/IKZE są zaszyte w silniku z pamięci (spec 6.4, ISAP niedostępny), więc zawsze ❌. */
const PAYOUT_RULES: Param = { value: 0, kind: 'assumption', verified: 'no', sources: [], note: '' };

/**
 * Przepisy podatkowe i limity użyte w obliczeniach, ze statusem weryfikacji (spec 6.4): stawki i zasady cytowane
 * z pamięci (❌), limity IKE/IKZE ze źródeł wtórnych (◐). Tylko do odczytu: silnik ma je zaszyte, więc zmiana
 * wartości tutaj niczego by nie zmieniała.
 */
export function TaxRulesCard() {
  const { t } = useLingui();
  const tax = useScenarioStore((s) => s.dataset.taxPL);
  const pln = (v: number): string => formatMoney(v, 'PLN');
  return (
    <Card title={t`Podatki i limity (Polska)`}>
      <p className="mt-0 text-sm text-muted">
        {t`Przepisy cytowane z pamięci, nie sprawdzone w ISAP (❌), mogą się różnić od obowiązujących; limity IKE i IKZE pochodzą ze źródeł wtórnych (◐). Traktuj wyniki po podatku jako orientacyjne. Wartości są wbudowane w obliczenia i nie podlegają edycji.`}
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        <ReadOnlyParamRow label={t`Podatek od zysków kapitałowych`} valueText={pct(tax.capitalGainsRate.value)} param={tax.capitalGainsRate} />
        <ReadOnlyParamRow label={t`Podatek od odsetek`} valueText={pct(tax.interestRate.value)} param={tax.interestRate} />
        <ReadOnlyParamRow label={t`Straty kapitałowe: lata rozliczenia`} valueText={num(tax.lossCarryYears.value)} param={tax.lossCarryYears} />
        <ReadOnlyParamRow label={t`Straty kapitałowe: jednorazowe odliczenie do`} valueText={pln(tax.lossOneOffLimit.value)} param={tax.lossOneOffLimit} />
        <ReadOnlyParamRow label={t`Straty kapitałowe: roczny udział reszty`} valueText={pct(tax.lossAnnualShare.value)} param={tax.lossAnnualShare} />
        <ReadOnlyParamRow label={t`Ryczałt od najmu do progu`} valueText={pct(tax.rentalRateLow.value)} param={tax.rentalRateLow} />
        <ReadOnlyParamRow label={t`Ryczałt od najmu powyżej progu`} valueText={pct(tax.rentalRateHigh.value)} param={tax.rentalRateHigh} />
        <ReadOnlyParamRow label={t`Próg przychodu z najmu (rocznie)`} valueText={pln(tax.rentalThreshold.value)} param={tax.rentalThreshold} />
        <ReadOnlyParamRow label={t`Zwolnienie sprzedaży mieszkania po latach od zakupu`} valueText={num(tax.realEstateExemptionYears.value)} param={tax.realEstateExemptionYears} />
        <ReadOnlyParamRow label={t`Limit wpłat na IKE w 2026`} valueText={pln(tax.ikeLimit2026.value)} param={tax.ikeLimit2026} />
        <ReadOnlyParamRow label={t`Limit wpłat na IKE w 2027`} valueText={pln(tax.ikeLimit2027.value)} param={tax.ikeLimit2027} />
        <ReadOnlyParamRow label={t`Limit wpłat na IKZE w 2026`} valueText={pln(tax.ikzeLimit2026.value)} param={tax.ikzeLimit2026} />
        <ReadOnlyParamRow label={t`Limit wpłat na IKZE w 2027`} valueText={pln(tax.ikzeLimit2027.value)} param={tax.ikzeLimit2027} />
        <ReadOnlyParamRow label={t`Limit wpłat na IKZE w 2026 przy działalności gospodarczej (nieużywany w symulacji)`} valueText={pln(tax.ikzeLimitBusiness2026.value)} param={tax.ikzeLimitBusiness2026} />
        <ReadOnlyParamRow
          label={t`Zasady wypłat z IKE i IKZE`}
          valueText={t`IKE bez podatku od 60 lat, IKZE 10% od 65 lat, wcześniej 19% od zysku (wymóg 5 lat wpłat pominięty)`}
          param={PAYOUT_RULES}
        />
      </ul>
    </Card>
  );
}
