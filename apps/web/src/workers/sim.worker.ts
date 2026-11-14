import { runBatch, solveRequiredContribution, solveSafeWithdrawal } from '@sim/engine';
import type { RunOptions, RunResult, Scenario, SolverOptions, SolverResult } from '@sim/engine';
import * as Comlink from 'comlink';

/** Wszystkie bufory wyniku (do przekazania bez kopiowania jako Transferable). */
export function transferablesOf(r: RunResult): ArrayBuffer[] {
  return [r.grid, r.wealth, r.wealthAfterTax, r.cpi, r.ruinMonth, r.maxDrawdown, r.worst12m, r.twrLog, r.collapsed, r.meanShare].map((a) => a.buffer as ArrayBuffer);
}

export type SolverKind = 'safeWithdrawal' | 'requiredContribution';

const api = {
  run(s: Scenario, o: RunOptions): RunResult {
    const r = runBatch(s, o);
    return Comlink.transfer(r, transferablesOf(r));
  },
  /** Solver (kilka sekund liczenia) poza głównym wątkiem; wynik to mały obiekt, bez transferu. */
  solve(kind: SolverKind, s: Scenario, o: SolverOptions): SolverResult {
    return kind === 'safeWithdrawal' ? solveSafeWithdrawal(s, o) : solveRequiredContribution(s, o);
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
