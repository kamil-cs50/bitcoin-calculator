/** Macierz nie jest dodatnio określona (pivot ≤ 0 lub nie-liczba). */
export class NotPositiveDefiniteError extends Error {
  constructor(message = 'Macierz nie jest dodatnio określona') {
    super(message);
    this.name = 'NotPositiveDefiniteError';
  }
}

/** Rozkład Choleskiego A = L·Lᵀ; `a` n×n wierszami, wynik: dolna trójkątna n×n wierszami. */
export function cholesky(a: Float64Array, n: number): Float64Array {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= l[i * n + k]! * l[j * n + k]!;
      if (i === j) {
        if (!(s > 0)) throw new NotPositiveDefiniteError();
        l[i * n + i] = Math.sqrt(s);
      } else {
        l[i * n + j] = s / l[j * n + j]!;
      }
    }
  }
  return l;
}
