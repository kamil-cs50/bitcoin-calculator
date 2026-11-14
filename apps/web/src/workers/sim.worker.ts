import { runBatch } from '@sim/engine';
import type { RunOptions, RunResult, Scenario } from '@sim/engine';
import * as Comlink from 'comlink';

/** Wszystkie bufory wyniku (do przekazania bez kopiowania jako Transferable). */
export function transferablesOf(r: RunResult): ArrayBuffer[] {
  return [r.grid, r.wealth, r.wealthAfterTax, r.cpi, r.ruinMonth, r.maxDrawdown, r.worst12m, r.twrLog, r.collapsed, r.meanShare].map((a) => a.buffer as ArrayBuffer);
}

const api = {
  run(s: Scenario, o: RunOptions): RunResult {
    const r = runBatch(s, o);
    return Comlink.transfer(r, transferablesOf(r));
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
