import type { RunOptions, RunResult, Scenario } from '@sim/engine';
import * as Comlink from 'comlink';
import { tasks } from './tasks';

/** Wszystkie bufory wyniku (do przekazania bez kopiowania jako Transferable). */
export function transferablesOf(r: RunResult): ArrayBuffer[] {
  return [r.grid, r.wealth, r.wealthAfterTax, r.cpi, r.ruinMonth, r.maxDrawdown, r.worst12m, r.twrLog, r.collapsed, r.meanShare].map((a) => a.buffer as ArrayBuffer);
}

const api = {
  ...tasks,
  run(s: Scenario, o: RunOptions): RunResult {
    const r = tasks.run(s, o);
    return Comlink.transfer(r, transferablesOf(r));
  },
};

export type SimWorkerApi = typeof api;

Comlink.expose(api);
