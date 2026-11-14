import { runBatch } from '../runner';
import { summarize } from '../stats/summary';
import type { Scenario } from '../types';
import { SOLVER_PATHS, solveStaged, toSolverResult } from './bisect';
import type { SolverOptions, SolverResult } from './bisect';

/** Scenariusz z miesięczną wpłatą `monthly` (zachowuje indeksację i koniec wpłat z oryginału; domyślnie CPI do celu). */
export function withMonthlyContribution(s: Scenario, monthly: number): Scenario {
  const c = s.contribution ?? { monthly: 0, endMonth: Math.max(0, (s.goal?.month ?? s.horizonMonths) - 1), indexation: 'cpi' as const, realGrowth: 0 };
  return { ...s, contribution: { ...c, monthly } };
}

/** Liczba ścieżek `[0, paths)`, które osiągają cel (realnie, po podatku), liczona w partiach (T7). */
export function countGoalHits(s: Scenario, seed: number, paths: number, batchSize: number): number {
  let hits = 0;
  for (let off = 0; off < paths; off += batchSize) {
    const r = runBatch(s, { seed, paths: Math.min(batchSize, paths - off), pathOffset: off });
    const sm = summarize(r, s, { month: s.goal!.month, real: true, afterTax: true });
    hits += Math.round(sm.probGoal!.p * r.paths);
  }
  return hits;
}

/**
 * Jaką miesięczną wpłatę (realną, indeksowaną CPI, chyba że scenariusz ma inną indeksację) trzeba wpłacać, żeby
 * P(cel) ≥ targetProb. Wymaga `s.goal`. Maksymalna wpłata: 10 × cel / liczba miesięcy do celu; jeśli i ona nie
 * wystarcza, wynik to Infinity; jeśli cel jest spełniony bez wpłat, wynik to 0. Zwraca wyższy koniec przedziału.
 */
export function solveRequiredContribution(s: Scenario, o: SolverOptions): SolverResult {
  if (!s.goal) throw new Error('solveRequiredContribution: scenariusz nie ma celu (goal)');
  const paths = o.paths ?? SOLVER_PATHS;
  const batch = o.batchSize ?? 1000;
  const xMax = (10 * s.goal.amountReal) / Math.max(1, s.goal.month);
  return toSolverResult(
    solveStaged({
      successes: (x, n) => countGoalHits(withMonthlyContribution(s, x), o.seed, n, batch),
      paths,
      targetProb: o.targetProb,
      increasing: true,
      start: null,
      xMax,
    }),
  );
}
