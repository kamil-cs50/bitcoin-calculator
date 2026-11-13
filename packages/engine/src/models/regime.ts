import { nearestCorrelation } from '../linalg/nearestCorrelation';
import type { RegimeParams, Warning } from '../types';

/** Stałe łańcucha reżimów (spec 4.4). */
export interface RegimeConstants {
  pi0: number;
  pi1: number;
  lambda: number;
  A: number;
  vDelta: number;
  delta0: number;
  delta1: number;
}

const OMEGA_MAX = 0.8;

/** gbm (p01 = 0): π1 = 0, V_δ = 0, δ = 0. */
export function regimeConstants(r: RegimeParams): RegimeConstants {
  const sum = r.p01 + r.p10;
  const pi1 = sum > 0 ? r.p01 / sum : 0;
  const pi0 = 1 - pi1;
  const lambda = 1 - r.p01 - r.p10;
  let A = 12;
  for (let k = 1; k <= 11; k++) A += 2 * (12 - k) * Math.pow(lambda, k);
  return { pi0, pi1, lambda, A, vDelta: pi0 * pi1 * r.delta * r.delta, delta0: pi1 * r.delta, delta1: -pi0 * r.delta };
}

/** Udział wariancji rocznej z reżimu: ω = α² V_δ A. */
export function omega(alpha: number, c: RegimeConstants): number {
  return alpha * alpha * c.vDelta * c.A;
}

function kappa(b: number, kappaS: number): number {
  return 1 + b * (kappaS - 1);
}

function kFactor(b: number, r: RegimeParams, c: RegimeConstants): number {
  const k1 = kappa(b, r.kappa1);
  return c.pi0 + c.pi1 * k1 * k1;
}

/** σ_m / σ = √((1 − ω) / (12 K_ii)). */
export function sigmaMonthlyFactor(alpha: number, b: number, r: RegimeParams, c: RegimeConstants): number {
  return Math.sqrt((1 - omega(alpha, c)) / (12 * kFactor(b, r, c)));
}

/**
 * Macierz korelacji szoków wewnątrz reżimu R̃ (spec 4.4 [Z-7], z poprawką [R-1]).
 * `returnMask[i]` = czy czynnik i jest zwrotem aktywa (domyślnie wszystkie). Korekta dotyczy tylko par,
 * w których oba czynniki są zwrotowe; pozostałe pary (cpi, fx) przechodzą bez zmian. Gdy wynik nie jest
 * poprawną macierzą korelacji, rzut Highama + ostrzeżenie CORR_PROJECTED.
 */
export function inRegimeCorrelation(
  rho: Float64Array,
  n: number,
  alpha: number[],
  b: number[],
  r: RegimeParams,
  returnMask?: boolean[],
): { matrix: Float64Array; warnings: Warning[] } {
  const c = regimeConstants(r);
  const out = new Float64Array(n * n);
  const common = c.vDelta * c.A;
  for (let i = 0; i < n; i++) {
    out[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      let v = rho[i * n + j]!;
      if ((returnMask?.[i] ?? true) && (returnMask?.[j] ?? true)) {
        const wi = omega(alpha[i]!, c);
        const wj = omega(alpha[j]!, c);
        const ki = kappa(b[i]!, r.kappa1);
        const kj = kappa(b[j]!, r.kappa1);
        const kij = c.pi0 + c.pi1 * ki * kj;
        const kRatio = kij / Math.sqrt(kFactor(b[i]!, r, c) * kFactor(b[j]!, r, c));
        v = (v - alpha[i]! * alpha[j]! * common) / (Math.sqrt((1 - wi) * (1 - wj)) * kRatio);
      }
      out[i * n + j] = v;
      out[j * n + i] = v;
    }
  }
  const proj = nearestCorrelation(out, n);
  if (!proj.changed) return { matrix: out, warnings: [] };
  return {
    matrix: proj.matrix,
    warnings: [
      {
        code: 'CORR_PROJECTED',
        message: 'Macierz korelacji wewnątrz reżimu po kalibracji nie była poprawna; użyto najbliższej macierzy korelacji (Higham).',
      },
    ],
  };
}

/** Wymusza ω ≤ 0,8 (zachowuje znak α). */
export function clampAlpha(alpha: number, c: RegimeConstants): { alpha: number; clamped: boolean } {
  if (!(omega(alpha, c) > OMEGA_MAX)) return { alpha, clamped: false };
  return { alpha: Math.sign(alpha) * Math.sqrt(OMEGA_MAX / (c.vDelta * c.A)), clamped: true };
}
