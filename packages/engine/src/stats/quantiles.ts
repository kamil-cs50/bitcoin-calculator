/**
 * Kwantyl typu 7 (Hyndman i Fan 1996; domyślny w NumPy i Excelu) z próby POSORTOWANEJ rosnąco:
 * h = (n − 1)·p, wynik = x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋]). `p` obcinane do [0, 1].
 */
export function quantile7(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pc = Math.min(Math.max(p, 0), 1);
  const h = (n - 1) * pc;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  const a = sorted[lo]!;
  return a + (h - lo) * (sorted[hi]! - a);
}
