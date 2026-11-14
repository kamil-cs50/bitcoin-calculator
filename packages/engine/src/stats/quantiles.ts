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

/**
 * Kwantyle typu 7 dla kilku poziomów naraz bez pełnego sortowania: wybór statystyk pozycyjnych
 * (quickselect z medianą z trzech, rekurencja po sąsiednich rangach). Wynik jest dokładnie taki sam jak
 * `quantile7` na próbie posortowanej. UWAGA: przestawia elementy `a` (wywołujący oddaje własną kopię).
 * Złożoność O(n) na poziom zamiast O(n log n) sortowania; używane przy wachlarzu (161 kolumn × 10 000 ścieżek).
 */
export function quantilesSelect(a: Float64Array, ps: readonly number[]): number[] {
  const n = a.length;
  if (n === 0) return ps.map(() => NaN);
  const need = new Set<number>();
  const pos = ps.map((p) => {
    const h = (n - 1) * Math.min(Math.max(p, 0), 1);
    const lo = Math.floor(h);
    need.add(lo);
    need.add(Math.min(lo + 1, n - 1));
    return { h, lo, hi: Math.min(lo + 1, n - 1) };
  });
  const ranks = [...need].sort((x, y) => x - y);

  const place = (l: number, r: number, from: number, to: number): void => {
    // ustawia na właściwych miejscach rangi ranks[from..to] leżące w a[l..r]
    if (from > to || l >= r) return;
    const mid = (from + to) >> 1;
    const k = ranks[mid]!;
    let lo = l;
    let hi = r;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      // mediana z trzech jako pivot
      const x = a[lo]!, y = a[m]!, z = a[hi]!;
      const pivot = x < y ? (y < z ? y : x < z ? z : x) : x < z ? x : y < z ? z : y;
      let i = lo;
      let j = hi;
      while (i <= j) {
        while (a[i]! < pivot) i++;
        while (a[j]! > pivot) j--;
        if (i <= j) {
          const t = a[i]!;
          a[i] = a[j]!;
          a[j] = t;
          i++;
          j--;
        }
      }
      if (k <= j) hi = j;
      else if (k >= i) lo = i;
      else break; // a[k] jest na miejscu (między partycjami)
    }
    place(l, k - 1, from, mid - 1);
    place(k + 1, r, mid + 1, to);
  };
  place(0, n - 1, 0, ranks.length - 1);

  return pos.map(({ h, lo, hi }) => {
    const v = a[lo]!;
    return v + (h - lo) * (a[hi]! - v);
  });
}
