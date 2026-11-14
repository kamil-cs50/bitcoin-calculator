import { modelCheck, runBatch, solveRequiredContribution, solveSafeWithdrawal, summarize } from '@sim/engine';
import type { ModelCheckRow, RunOptions, RunResult, Scenario, SolverOptions, SolverResult, Summary } from '@sim/engine';
import { pairedFromValues, type PairedDifference } from '../features/compare/diff';
import { estimateRealReturnSync } from '../features/plan/estimateCore';

export type SolverKind = 'safeWithdrawal' | 'requiredContribution';

/**
 * Zadania wykonywane poza głównym wątkiem (czyste funkcje). Ten sam zestaw obsługuje prawdziwy worker
 * (`sim.worker.ts`) i wersję synchroniczną w testach (`syncWorker.ts`).
 */
export const tasks = {
  run: (s: Scenario, o: RunOptions): RunResult => runBatch(s, o),
  /** Solver (kilka sekund liczenia); wynik to mały obiekt. */
  solve: (kind: SolverKind, s: Scenario, o: SolverOptions): SolverResult =>
    kind === 'safeWithdrawal' ? solveSafeWithdrawal(s, o) : solveRequiredContribution(s, o),
  /** Kontrola modelu: osobny, tańszy przebieg samego rynku. */
  modelCheck: (s: Scenario, o: { seed: number; paths: number }): ModelCheckRow[] => modelCheck(s, o),
  /** Przebieg + podsumowanie w jednym kroku (np. rozkład ceny BTC); nie przesyła buforów wyniku. */
  summary: (s: Scenario, o: RunOptions, v: { month: number; real: boolean; afterTax: boolean }): Summary =>
    summarize(runBatch(s, o), s, v),
  /** Realny zwrot portfela dla amortyzacji (ABW). */
  estimate: (s: Scenario): number => estimateRealReturnSync(s),
  /** Bootstrap różnicy kwantyli na parach ścieżek (porównanie scenariuszy). */
  pairedDiff: (va: Float64Array, vb: Float64Array, reps?: number): Omit<PairedDifference, 'month'> => pairedFromValues(va, vb, reps),
};

export type SimWorkerApi = typeof tasks;
