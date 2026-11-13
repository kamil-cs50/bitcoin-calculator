import { chi2Quantile } from './gamma';

/**
 * Tabela skali mieszanki (spec 4.3, Z-4): s_k = √((ν−2)/Q_χ²ν(u_k)), u_k = (k+0,5)/K,
 * znormalizowana tak, że (1/K)·Σ s_k² = 1. ν = Infinity daje same jedynki. Wymaga ν ≥ 3.
 */
export function buildScaleTable(nu: number, K = 1024): Float64Array {
  if (!(nu >= 3)) throw new RangeError('buildScaleTable: wymagane nu >= 3');
  if (!Number.isInteger(K) || K < 1)
    throw new RangeError('buildScaleTable: K musi być dodatnią liczbą całkowitą');
  const s = new Float64Array(K);
  if (nu === Infinity) return s.fill(1);
  let sumSq = 0;
  for (let k = 0; k < K; k++) {
    const v = Math.sqrt((nu - 2) / chi2Quantile((k + 0.5) / K, nu));
    s[k] = v;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq / K);
  for (let k = 0; k < K; k++) s[k] = s[k]! / norm;
  return s;
}

/** (1/K) Σ exp(σ² s_k² / 2): czynnik średniej arytmetycznej E[e^r] = e^μ · wynik. */
export function meanExpHalfVar(sigmaM: number, table: Float64Array): number {
  const half = (sigmaM * sigmaM) / 2;
  let sum = 0;
  for (let k = 0; k < table.length; k++) sum += Math.exp(half * table[k]! * table[k]!);
  return sum / table.length;
}
