import { contributionAt, eventAmount } from '../cashflows/contributions';
import { MarketSimulator } from '../models/market';
import { runBatch } from '../runner';
import { quantile7 } from '../stats/quantiles';
import type { Scenario, Withdrawal } from '../types';
import { validateScenario } from '../validate';
import { SOLVER_PATHS, solveStaged, toSolverResult } from './bisect';
import type { SolverOptions, SolverResult } from './bisect';

/** Scenariusz z wypłatą stałą realną `monthly` (start jak w oryginale albo od miesiąca 0). */
export function withFixedWithdrawal(s: Scenario, monthly: number): Scenario {
  const w: Withdrawal = { kind: 'fixedReal', startMonth: s.withdrawal?.startMonth ?? 0, monthly };
  return { ...s, withdrawal: w };
}

/** Liczba ścieżek `[0, paths)` bez ruiny, liczona w partiach (wynik nie zależy od podziału, T7). */
export function countNoRuin(s: Scenario, seed: number, paths: number, batchSize: number): number {
  let ok = 0;
  for (let off = 0; off < paths; off += batchSize) {
    const r = runBatch(s, { seed, paths: Math.min(batchSize, paths - off), pathOffset: off });
    for (let p = 0; p < r.paths; p++) if (r.ruinMonth[p]! < 0) ok++;
  }
  return ok;
}

/**
 * Rozwiązanie zamknięte per ścieżka dla wariantu bez podatków i kosztów transakcji (spec 4.13 [Z-21]).
 * Portfel: stałe wagi docelowe (rebalans co miesiąc), lokaty i EDO ze stałą stopą początkową. Dla ścieżki
 * z indeksem wzrostu D_t i CPI C_t maksymalna stała realna wypłata miesięczna, przy której nie ma ruiny, to
 *   w* = min_t [W₀ + Σ_{u<t} f_u/D_{u+1} + f_t/D_t] / [Σ_{s≤u<t} C_u/D_{u+1} + C_t/D_t],  t ≥ start,
 * gdzie f_u to przepływy netto (wpłaty, zdarzenia). Zwraca kwantyl rzędu 1 − targetProb rozkładu w*.
 */
export function closedFormSafeWithdrawal(s: Scenario, o: { targetProb: number; seed: number; paths: number }): number {
  const v = validateScenario(s);
  if (!v.ok) throw new Error('closedFormSafeWithdrawal: niepoprawny scenariusz: ' + v.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
  const T = s.horizonMonths;
  const start = s.withdrawal?.startMonth ?? 0;
  const market = new MarketSimulator(s);
  const st = market.newState();

  // wagi docelowe na aktywo (jeśli same zera: wartości początkowe)
  const A = s.assets.length;
  const w = new Float64Array(A);
  const v0 = new Float64Array(A);
  let w0 = 0;
  for (const p of s.positions) {
    const i = s.assets.findIndex((a) => a.id === p.assetId);
    if (p.targetWeight > 0) w[i]! += p.targetWeight;
    if (p.value > 0) {
      v0[i]! += p.value;
      w0 += p.value;
    }
  }
  const wSum = w.reduce((x, y) => x + y, 0);
  const weights = wSum > 0 ? w.map((x) => x / wSum) : v0.map((x) => (w0 > 0 ? x / w0 : 0));
  const riskyOf = Int32Array.from(s.assets.map((a) => (a.kind === 'risky' || a.kind === 'realEstate' ? market.riskyIds.indexOf(a.id) : -1)));
  const terRetain = Float64Array.from(s.assets.map((a) => (a.kind === 'risky' ? Math.exp(Math.log1p(-Math.min(Math.max(a.ter, 0), 0.999999)) / 12) : 1)));
  const fixedRate = Float64Array.from(s.assets.map((a) => (a.kind === 'deposit' ? a.initialRate / 12 : a.kind === 'edo' ? a.firstYearRate / 12 : 0)));

  const out = new Float64Array(o.paths);
  const flow = new Float64Array(T);
  const cpi = new Float64Array(T + 1); // C_t = exp(cpiLog) na początku miesiąca t
  const growth = new Float64Array(T + 1); // D_t
  for (let p = 0; p < o.paths; p++) {
    market.initPath(o.seed, p);
    cpi[0] = 1;
    growth[0] = 1;
    for (let t = 0; t < T; t++) {
      market.step(t, st);
      let r = 0;
      for (let i = 0; i < A; i++) {
        const wi = weights[i]!;
        if (wi === 0) continue;
        r += riskyOf[i]! >= 0 ? wi * (Math.exp(st.assetLogRet[riskyOf[i]!]!) * terRetain[i]! - 1) : wi * fixedRate[i]!;
      }
      growth[t + 1] = growth[t]! * (1 + r);
      cpi[t + 1] = Math.exp(st.cpiLog);
    }
    for (let t = 0; t < T; t++) {
      let f = s.contribution ? contributionAt(s.contribution, t, Math.log(cpi[t]!)) : 0;
      for (const e of s.events) if (e.month === t) f += eventAmount(e, Math.log(cpi[t]!));
      flow[t] = f;
    }
    let best = Infinity;
    let flowSum = 0; // Σ_{u<t} f_u / D_{u+1}
    let cpiSum = 0; // Σ_{start≤u<t} C_u / D_{u+1}
    for (let t = 0; t < T; t++) {
      if (t >= start) {
        const num = w0 + flowSum + flow[t]! / growth[t]!;
        const den = cpiSum + cpi[t]! / growth[t]!;
        const c = num / den;
        if (c < best) best = c;
      }
      flowSum += flow[t]! / growth[t + 1]!;
      if (t >= start) cpiSum += cpi[t]! / growth[t + 1]!;
    }
    out[p] = Number.isFinite(best) ? Math.max(best, 0) : 0;
  }
  out.sort();
  return quantile7(out, 1 - o.targetProb);
}

/**
 * Ile można bezpiecznie wypłacać miesięcznie (realnie, ceny z początku symulacji), żeby P(brak ruiny) ≥ targetProb.
 * Bisekcja po kwocie na wspólnych liczbach losowych (spec 4.13 [Z-21]); zwraca niższy koniec przedziału.
 * Zakłada, że wypłata stała realna zastępuje ewentualną wypłatę z scenariusza (zachowuje jej `startMonth`).
 */
export function solveSafeWithdrawal(s: Scenario, o: SolverOptions): SolverResult {
  const paths = o.paths ?? SOLVER_PATHS;
  const batch = o.batchSize ?? 1000;
  const total = s.positions.reduce((x, p) => x + (p.value > 0 ? p.value : 0), 0);
  let start = closedFormSafeWithdrawal(s, { targetProb: o.targetProb, seed: o.seed, paths });
  if (!(start > 0)) start = Math.max(total, 1) / (100 * s.horizonMonths);
  return toSolverResult(
    solveStaged({
      successes: (x, n) => countNoRuin(withFixedWithdrawal(s, x), o.seed, n, batch),
      paths,
      targetProb: o.targetProb,
      increasing: false,
      start,
      xMax: Infinity,
    }),
  );
}
