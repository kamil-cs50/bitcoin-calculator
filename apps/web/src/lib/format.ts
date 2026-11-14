import { t } from '@lingui/core/macro';
import type { Currency } from '@sim/data';

const LOCALE = 'pl-PL';

/** Zaokrągla do n cyfr znaczących (bez fałszywej precyzji). */
export function roundSig(x: number, n: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(n));
}

const moneyFmt = new Map<Currency, Intl.NumberFormat>();
function money(currency: Currency): Intl.NumberFormat {
  let f = moneyFmt.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
    moneyFmt.set(currency, f);
  }
  return f;
}

function symbolOf(currency: Currency): string {
  return money(currency).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
}

/**
 * Kwota po polsku. Z `sigDigits` zaokrągla do cyfr znaczących, a miliony i
 * miliardy skraca („1,2 mln zł”). Bez niego pokazuje pełną kwotę w złotych/centach
 * do całości.
 */
export function formatMoney(value: number, currency: Currency, o: { sigDigits?: number } = {}): string {
  const v = o.sigDigits ? roundSig(value, o.sigDigits) : value;
  const abs = Math.abs(v);
  const scale = abs >= 1e9 ? { div: 1e9, word: 'mld' } : abs >= 1e6 ? { div: 1e6, word: 'mln' } : null;
  if (scale && o.sigDigits) {
    const num = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: Math.max(0, o.sigDigits - 1) }).format(
      v / scale.div,
    );
    return `${num} ${scale.word} ${symbolOf(currency)}`;
  }
  return money(currency).format(v);
}

/** Procent z ułamka: 0,123 -> „12,3%”. */
export function formatPercent(p: number, digits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(p);
}

/**
 * Prawdopodobieństwo jako częstość naturalna („w 8 na 10 przyszłości”).
 * Skraje (poniżej 10% i powyżej 90%) w setkach; granice 1% i 99% uczciwie „mniej niż”/„ponad”.
 */
export function naturalFrequency(p: number): string {
  if (p <= 0) return t`w żadnej przyszłości`;
  if (p >= 1) return t`w każdej przyszłości`;
  if (p < 0.01) return t`w mniej niż 1 na 100 przyszłości`;
  if (p > 0.99) return t`w ponad 99 na 100 przyszłości`;
  if (p < 0.1 || p > 0.9) {
    const k = Math.round(p * 100);
    return t`w ${k} na 100 przyszłości`;
  }
  const k = Math.round(p * 10);
  return t`w ${k} na 10 przyszłości`;
}
