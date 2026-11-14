import { plural, t } from '@lingui/core/macro';
import { numberLocale } from '../../i18n';

/** „10 lat”, „1 rok”, „2 lata”; niepełne lata jako ułamek („0,3 roku”). */
export function yearsText(month: number): string {
  const y = month / 12;
  if (Number.isInteger(y)) return plural(y, { one: '# rok', few: '# lata', many: '# lat', other: '# roku' });
  const n = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 }).format(y);
  return t`${n} roku`;
}

/** Wielka litera na początku (częstość naturalna zaczyna zdanie). */
export const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
