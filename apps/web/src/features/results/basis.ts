import { useLingui } from '@lingui/react/macro';
import type { Currency } from '@sim/data';
import { numberLocale } from '../../i18n';

/** Skrót waluty w tekstach („zł”, „USD”, „EUR”). */
export const currencyWord = (cur: Currency): string => (cur === 'PLN' && numberLocale() === 'pl-PL' ? 'zł' : cur);

/**
 * Podstawa liczb na wynikach: realnie albo nominalnie, po podatku albo przed. Jedno źródło tekstu dla
 * kafelków, tytułów kart i opisów wykresów, żeby liczba zawsze mówiła, czego dotyczy.
 */
export function useBasis(cur: Currency, real: boolean, afterTax: boolean): { value: string; tax: string; full: string; short: string } {
  const { t } = useLingui();
  const unit = currencyWord(cur);
  const value = real ? t`w dzisiejszych ${unit}` : t`nominalnie`;
  const tax = afterTax ? t`po podatku` : t`przed podatkiem`;
  // krótka podstawa do nagłówków wykresów i paska scenariusza (projekt v3: „realnie, po podatku”)
  const short = `${real ? t`realnie` : t`nominalnie`}, ${tax}`;
  return { value, tax, full: `${value}, ${tax}`, short };
}
