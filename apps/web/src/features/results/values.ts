import type { RunResult } from '@sim/engine';

/** Ostatni punkt siatki o miesiącu ≤ `month` (jak w silniku). */
export function gridIndex(grid: Int32Array, month: number): number {
  let j = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]! <= month) j = i;
  return j;
}

/** Wartości wszystkich ścieżek w punkcie siatki `j` (nominalnie lub realnie, przed lub po podatku). */
export function valuesAt(r: RunResult, j: number, o: { real: boolean; afterTax: boolean }): Float64Array {
  const G = r.grid.length;
  const src = o.afterTax ? r.wealthAfterTax : r.wealth;
  const out = new Float64Array(r.paths);
  for (let p = 0; p < r.paths; p++) out[p] = o.real ? src[p * G + j]! / r.cpi[p * G + j]! : src[p * G + j]!;
  return out;
}

/** Kopia z wartościami powyżej kwantyla `q` obciętymi do niego (czytelny histogram przy grubym prawym ogonie). */
export function winsorize(values: Float64Array, q: number): Float64Array {
  if (values.length === 0) return values;
  const sorted = Float64Array.from(values).sort();
  const cap = sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
  return values.map((v) => Math.min(v, cap));
}

/** Rok kalendarzowy, w którym przypada `month` miesięcy po starcie symulacji. */
export function calendarYear(startYear: number, startMonth: number, month: number): number {
  return startYear + Math.floor((startMonth - 1 + month) / 12);
}
