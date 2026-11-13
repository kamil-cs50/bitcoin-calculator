/** Rozkład własny symetrycznej macierzy metodą cyklicznego Jacobiego (n ≤ 20). */
function jacobiEigen(a: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const m = Float64Array.from(a);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    let diag = 0;
    for (let i = 0; i < n; i++) {
      diag += m[i * n + i]! * m[i * n + i]!;
      for (let j = i + 1; j < n; j++) off += m[i * n + j]! * m[i * n + j]!;
    }
    if (off <= 1e-30 * Math.max(diag, 1e-300)) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q]!;
        if (apq === 0) continue;
        const theta = (m[q * n + q]! - m[p * n + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const kp = m[k * n + p]!;
          const kq = m[k * n + q]!;
          m[k * n + p] = c * kp - s * kq;
          m[k * n + q] = s * kp + c * kq;
        }
        for (let k = 0; k < n; k++) {
          const pk = m[p * n + k]!;
          const qk = m[q * n + k]!;
          m[p * n + k] = c * pk - s * qk;
          m[q * n + k] = s * pk + c * qk;
        }
        for (let k = 0; k < n; k++) {
          const kp = v[k * n + p]!;
          const kq = v[k * n + q]!;
          v[k * n + p] = c * kp - s * kq;
          v[k * n + q] = s * kp + c * kq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = m[i * n + i]!;
  return { values, vectors: v };
}

/** Rzut na stożek PSD z przycięciem wartości własnych do ≥ floor. */
function projectPsd(a: Float64Array, n: number, floor: number): Float64Array {
  const { values, vectors } = jacobiEigen(a, n);
  const out = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const lam = Math.max(values[k]!, floor);
    for (let i = 0; i < n; i++) {
      const f = lam * vectors[i * n + k]!;
      for (let j = 0; j < n; j++) out[i * n + j] = out[i * n + j]! + f * vectors[j * n + k]!;
    }
  }
  return out;
}

const MIN_EIG = 1e-8;

function isValidCorrelation(a: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i++) {
    if (!(Math.abs(a[i * n + i]! - 1) <= 1e-12)) return false;
    for (let j = i + 1; j < n; j++) {
      const x = a[i * n + j]!;
      if (!(Math.abs(x) <= 1) || Math.abs(x - a[j * n + i]!) > 1e-12) return false;
    }
  }
  const { values } = jacobiEigen(a, n);
  for (let i = 0; i < n; i++) if (!(values[i]! >= MIN_EIG)) return false;
  return true;
}

/**
 * Najbliższa macierz korelacji (Higham 2002): rzuty naprzemienne z korektą Dykstry
 * (PSD ∩ jednostkowa przekątna). Wynik ma wartości własne ≥ 1e-8 i jedynki na przekątnej.
 */
export function nearestCorrelation(
  a: Float64Array,
  n: number,
  opts: { tol?: number; maxIter?: number } = {},
): { matrix: Float64Array; changed: boolean; iterations: number } {
  const tol = opts.tol ?? 1e-8;
  const maxIter = opts.maxIter ?? 200;
  if (isValidCorrelation(a, n)) return { matrix: Float64Array.from(a), changed: false, iterations: 0 };

  // symetryzacja wejścia
  let y = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) y[i * n + j] = 0.5 * (a[i * n + j]! + a[j * n + i]!);
  const s = new Float64Array(n * n); // korekta Dykstry
  let iterations = 0;
  while (iterations < maxIter) {
    iterations++;
    const r = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) r[i] = y[i]! - s[i]!;
    const x = projectPsd(r, n, 0);
    for (let i = 0; i < n * n; i++) s[i] = x[i]! - r[i]!;
    const yNew = Float64Array.from(x);
    for (let i = 0; i < n; i++) yNew[i * n + i] = 1;
    let diff = 0;
    for (let i = 0; i < n * n; i++) diff = Math.max(diff, Math.abs(yNew[i]! - y[i]!));
    y = yNew;
    if (diff < tol) break;
  }

  // wartości własne ≥ MIN_EIG, potem normalizacja do jedynek na przekątnej (kongruencja zachowuje PD)
  const p = projectPsd(y, n, MIN_EIG);
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = 1 / Math.sqrt(p[i * n + i]!);
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    out[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const v = Math.max(-1, Math.min(1, 0.5 * (p[i * n + j]! + p[j * n + i]!) * d[i]! * d[j]!));
      out[i * n + j] = v;
      out[j * n + i] = v;
    }
  }
  return { matrix: out, changed: true, iterations };
}
