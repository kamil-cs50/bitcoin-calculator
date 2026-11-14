import { mergeResults, STAGES } from '@sim/engine';
import type { RunOptions, RunResult, Scenario } from '@sim/engine';
import * as Comlink from 'comlink';
import type { SimWorkerApi } from './sim.worker';

export interface SimHandle {
  cancel(): void;
  done: Promise<RunResult>;
}

export interface PoolOptions {
  workers?: number;
  maxPaths: number;
  onStage(result: RunResult, stage: number): void;
  /** Fabryka workerów; domyślnie prawdziwe Web Workery z Comlink (testy podstawiają wersję synchroniczną). */
  createWorker?: () => SimWorker;
}

/** Minimalny kontrakt workera widziany przez pulę. */
export interface SimWorker {
  run(s: Scenario, o: RunOptions): Promise<RunResult>;
  terminate(): void;
}

export function defaultWorkerCount(): number {
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.min(8, Math.max(1, hc - 1));
}

export function defaultMaxPaths(): number {
  const mem = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  const width = typeof screen !== 'undefined' ? screen.width : Infinity;
  return (mem !== undefined && mem <= 4) || width < 768 ? 10000 : 25000;
}

function createRealWorker(): SimWorker {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  const remote = Comlink.wrap<SimWorkerApi>(worker);
  return { run: (s, o) => remote.run(s, o), terminate: () => worker.terminate() };
}

/** Skumulowane rozmiary etapów: 1000 → 4000 → 10000, obcięte do maxPaths; maxPaths ponad 10000 dodaje etap końcowy. */
function stagesFor(maxPaths: number): number[] {
  const out: number[] = [];
  for (const s of STAGES) {
    const n = Math.min(s, maxPaths);
    if (out[out.length - 1] !== n) out.push(n);
  }
  if (maxPaths > out[out.length - 1]!) out.push(maxPaths);
  return out;
}

/** Dzieli `count` ścieżek od `offset` na co najwyżej `parts` ciągłych kawałków (rosnące pathOffset). */
function splitRange(offset: number, count: number, parts: number): { pathOffset: number; paths: number }[] {
  const n = Math.max(1, Math.min(parts, count));
  const out: { pathOffset: number; paths: number }[] = [];
  let at = offset;
  for (let i = 0; i < n; i++) {
    const size = Math.floor(count / n) + (i < count % n ? 1 : 0);
    out.push({ pathOffset: at, paths: size });
    at += size;
  }
  return out;
}

const abortError = (): Error => Object.assign(new Error('Symulacja anulowana'), { name: 'AbortError' });

/**
 * Symulacja progresywna: każdy etap dolicza tylko brakujące ścieżki (pathOffset) i scala je w kolejności offsetów,
 * więc wynik nie zależy od liczby workerów (T7).
 */
export function runProgressive(s: Scenario, seed: number, o: PoolOptions): SimHandle {
  const factory = o.createWorker ?? createRealWorker;
  const count = Math.max(1, o.workers ?? defaultWorkerCount());
  const stages = stagesFor(o.maxPaths);
  let cancelled = false;
  let pool: SimWorker[] = [];
  let rejectDone: (e: Error) => void = () => undefined;

  const shutdown = (): void => {
    for (const w of pool) w.terminate();
    pool = [];
  };

  const done = new Promise<RunResult>((resolve, reject) => {
    rejectDone = reject;
    void (async () => {
      try {
        pool = Array.from({ length: count }, factory);
        let acc: RunResult | undefined;
        let have = 0;
        for (const target of stages) {
          const chunks = splitRange(have, target - have, count);
          const parts = await Promise.all(chunks.map((c, i) => pool[i]!.run(s, { seed, paths: c.paths, pathOffset: c.pathOffset })));
          if (cancelled) throw abortError();
          acc = mergeResults(acc ? [acc, ...parts] : parts);
          have = target;
          o.onStage(acc, target);
          if (cancelled) throw abortError();
        }
        shutdown();
        resolve(acc!);
      } catch (e) {
        shutdown();
        reject(cancelled ? abortError() : e);
      }
    })();
  });

  return {
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      shutdown();
      rejectDone(abortError());
    },
    done,
  };
}
