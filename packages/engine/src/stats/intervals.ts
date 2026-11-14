const Z95 = 1.959963984540054;

/** Przedział Wilsona dla k sukcesów w n próbach (domyślnie 95%). Brzegi dokładne: k = 0 → dół 0, k = n → góra 1. */
export function wilson(k: number, n: number, z: number = Z95): [number, number] {
  if (!(n > 0)) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const lo = k <= 0 ? 0 : Math.max(0, center - half);
  const hi = k >= n ? 1 : Math.min(1, center + half);
  return [lo, hi];
}

/**
 * Nieparametryczny przedział dla kwantyla rzędu p z statystyk pozycyjnych: liczba obserwacji poniżej
 * prawdziwego kwantyla ma rozkład Bin(n, p), więc granice to np ∓ z·√(np(1−p)) (przybliżenie normalne,
 * dół zaokrąglony w dół, góra w górę). Zwraca indeksy 0-based w próbie posortowanej, obcięte do [0, n−1].
 */
export function quantileCI(n: number, p: number, z: number = Z95): [number, number] {
  if (!(n > 0)) return [0, 0];
  const mean = n * p;
  const half = z * Math.sqrt(n * p * (1 - p));
  const lo = Math.max(0, Math.floor(mean - half + 1e-9));
  const hi = Math.min(n - 1, Math.ceil(mean + half - 1e-9));
  return [lo, hi];
}
