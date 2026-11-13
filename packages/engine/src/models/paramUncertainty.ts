/**
 * Spec 4.5 (Z-9): roczne przesunięcia log-dryfu aktywów `out_i = scale · SE_i · (L_ρ z)_i`,
 * gdzie `L_ρ` to czynnik Cholesky'ego wpisanej macierzy korelacji aktywów (wiersze, n×n).
 * `scale` = mnożnik niepewności (0 = brak niepewności, same zera).
 */
export function drawDriftShifts(
  z: Float64Array,
  se: Float64Array,
  cholRho: Float64Array,
  n: number,
  scale: number,
  out: Float64Array,
): void {
  for (let i = 0; i < n; i++) {
    let acc = 0;
    const row = i * n;
    for (let j = 0; j <= i; j++) acc += cholRho[row + j]! * z[j]!;
    out[i] = scale * se[i]! * acc;
  }
}
