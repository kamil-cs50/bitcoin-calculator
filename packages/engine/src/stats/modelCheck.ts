import { buildScaleTable } from '../math/scaleTable';
import { regimeConstants, sigmaMonthlyFactor } from '../models/regime';
import type { RegimeParams } from '../types';

/**
 * Miesięczna średnia arytmetyczna E[e^r] z reżimami (spec 4.3, R-6):
 * E[e^r] = e^μ · Σ_s π_s e^{ασδ_s} · (1/K) Σ_k exp(σ_m² κ_s² s_k² / 2),
 * ze stacjonarnym rozkładem reżimów i tą samą tabelą skali co symulator. `mu` = miesięczny dryf log-zwrotu,
 * `sigma` = roczna zmienność aktywa; przy p01 = 0 wynik sprowadza się do wzoru bez reżimów.
 * Średnią roczną (reżim skorelowany w czasie) liczymy z symulacji kontrolnej: `arithmeticMeanFromLogReturns`.
 */
export function arithmeticMeanMonthly(p: { mu: number; sigma: number; alpha: number; b: number; nu: number; regime: RegimeParams }): number {
  const c = regimeConstants(p.regime);
  const sm = p.sigma * sigmaMonthlyFactor(p.alpha, p.b, p.regime, c);
  const table = buildScaleTable(p.nu);
  const K = table.length;
  const kap = [1, 1 + p.b * (p.regime.kappa1 - 1)] as const;
  const pi = [c.pi0, c.pi1] as const;
  const delta = [c.delta0, c.delta1] as const;
  let total = 0;
  for (let s = 0; s < 2; s++) {
    const ps = pi[s]!;
    if (!(ps > 0)) continue;
    const half = (sm * kap[s]! * sm * kap[s]!) / 2;
    let acc = 0;
    for (let k = 0; k < K; k++) acc += Math.exp(half * table[k]! * table[k]!);
    total += ps * Math.exp(p.alpha * p.sigma * delta[s]!) * (acc / K);
  }
  return Math.exp(p.mu) * total;
}

/** Średnia arytmetyczna e^x z próby log-zwrotów (np. rocznych z symulacji kontrolnej). */
export function arithmeticMeanFromLogReturns(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.exp(x[i]!);
  return x.length > 0 ? s / x.length : NaN;
}

/** Korelacja próbkowa Pearsona (panel „Kontrola modelu”: korelacja roczna par z udziałem inflacji/kursu, R-1). */
export function sampleCorrelation(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}
