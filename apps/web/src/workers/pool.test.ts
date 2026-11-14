import { runBatch } from '@sim/engine';
import type { RunResult } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import { describe, expect, it } from 'vitest';
import { runProgressive } from './pool';
import type { SimWorker } from './pool';

const scenario = makeScenario({ horizonMonths: 24 });

/** Worker podmieniony na wywołanie synchroniczne (bez Comlink i bez prawdziwego wątku). */
const syncWorker = (): SimWorker => ({ run: async (s, o) => runBatch(s, o), terminate: () => undefined });

const same = (a: RunResult, b: RunResult): void => {
  expect(a.paths).toBe(b.paths);
  expect(a.wealth).toEqual(b.wealth);
  expect(a.wealthAfterTax).toEqual(b.wealthAfterTax);
  expect(a.cpi).toEqual(b.cpi);
  expect(a.ruinMonth).toEqual(b.ruinMonth);
  expect(a.maxDrawdown).toEqual(b.maxDrawdown);
  expect(a.worst12m).toEqual(b.worst12m);
  expect(a.twrLog).toEqual(b.twrLog);
  expect(a.collapsed).toEqual(b.collapsed);
  expect(a.meanShare).toEqual(b.meanShare);
};

describe('runProgressive', () => {
  it('woła onStage 3 razy (1000, 4000, 10000), a wynik końcowy równa się runBatch', async () => {
    const stages: number[] = [];
    const h = runProgressive(scenario, 7, { maxPaths: 10000, workers: 3, createWorker: syncWorker, onStage: (r) => stages.push(r.paths) });
    const final = await h.done;
    expect(stages).toEqual([1000, 4000, 10000]);
    same(final, runBatch(scenario, { seed: 7, paths: 10000 }));
  });

  it('obcina etapy do maxPaths', async () => {
    const stages: number[] = [];
    await runProgressive(scenario, 7, { maxPaths: 2500, workers: 2, createWorker: syncWorker, onStage: (r) => stages.push(r.paths) }).done;
    expect(stages).toEqual([1000, 2500]);
  });

  it('cancel() po pierwszym etapie zatrzymuje kolejne etapy i odrzuca done z AbortError', async () => {
    const stages: number[] = [];
    let terminated = 0;
    const h = runProgressive(scenario, 7, {
      maxPaths: 10000,
      workers: 2,
      createWorker: () => ({ ...syncWorker(), terminate: () => void terminated++ }),
      onStage: (r) => {
        stages.push(r.paths);
        h.cancel();
      },
    });
    await expect(h.done).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 20));
    expect(stages).toEqual([1000]);
    expect(terminated).toBe(2);
  });

  it('wynik identyczny dla workers: 1 i workers: 4', async () => {
    const run = (workers: number) => runProgressive(scenario, 11, { maxPaths: 4000, workers, createWorker: syncWorker, onStage: () => undefined }).done;
    same(await run(1), await run(4));
  });
});
