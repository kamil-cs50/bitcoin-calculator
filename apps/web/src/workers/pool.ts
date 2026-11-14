import { mergeResults, STAGES } from '@sim/engine';
import type { AssetRiskShare, ModelCheckFull, RunOptions, RunResult, Scenario, SolverOptions, SolverResult, Summary } from '@sim/engine';
import * as Comlink from 'comlink';
import type { PairedDifference } from '../features/compare/diff';
import type { SimWorkerApi } from './sim.worker';
import type { SolverKind } from './tasks';

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
  solve(kind: SolverKind, s: Scenario, o: SolverOptions): Promise<SolverResult>;
  modelCheck(s: Scenario, o: { seed: number; paths: number }): Promise<ModelCheckFull>;
  riskShares(s: Scenario, o: { seed: number; paths: number }): Promise<AssetRiskShare[]>;
  summary(s: Scenario, o: RunOptions, v: { month: number; real: boolean; afterTax: boolean }): Promise<Summary>;
  estimate(s: Scenario): Promise<number>;
  ruinAlive(ruinMonth: Int32Array, qx: number[], age: number, months: number, extraYears: number): Promise<{ p: number; ci: [number, number] }>;
  pairedDiff(va: Float64Array, vb: Float64Array, reps?: number): Promise<Omit<PairedDifference, 'month'>>;
  terminate(): void;
}

export type { SolverKind };

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
  return {
    run: (s, o) => remote.run(s, o),
    solve: (k, s, o) => remote.solve(k, s, o),
    modelCheck: (s, o) => remote.modelCheck(s, o),
    riskShares: (s, o) => remote.riskShares(s, o),
    summary: (s, o, v) => remote.summary(s, o, v),
    estimate: (s) => remote.estimate(s),
    ruinAlive: (m, q, a, n, x) => remote.ruinAlive(m, q, a, n, x),
    pairedDiff: (a, b, r) => remote.pairedDiff(a, b, r),
    terminate: () => worker.terminate(),
  };
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
  let signalCancel: () => void = () => undefined;
  const cancelSignal = new Promise<never>((_, reject) => {
    signalCancel = () => reject(abortError());
  });
  cancelSignal.catch(() => undefined); // sygnał bywa nieużyty (brak anulowania): bez ostrzeżenia o nieobsłużonym odrzuceniu

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
          // po cancel() zakończone workery nigdy nie odpowiedzą: wyścig z sygnałem anulowania zwalnia tę pętlę
          const parts = await Promise.race([
            Promise.all(chunks.map((c, i) => pool[i]!.run(s, { seed, paths: c.paths, pathOffset: c.pathOffset }))),
            cancelSignal,
          ]);
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
      signalCancel();
      rejectDone(abortError());
    },
    done,
  };
}

export interface TaskHandle<T> {
  cancel(): void;
  done: Promise<T>;
}

/**
 * Jedno zadanie w osobnym workerze (bez blokowania interfejsu). `cancel()` kończy workera, a `done`
 * odrzuca z AbortError. Worker jest kończony także po zakończeniu zadania.
 */
export function runTask<T>(call: (w: SimWorker) => Promise<T>, createWorker: () => SimWorker = createRealWorker): TaskHandle<T> {
  const worker = createWorker();
  let rejectDone: (e: Error) => void = () => undefined;
  const done = new Promise<T>((resolve, reject) => {
    rejectDone = reject;
    call(worker).then(resolve, reject);
  }).finally(() => worker.terminate());
  return {
    cancel(): void {
      worker.terminate();
      rejectDone(abortError());
    },
    done,
  };
}

export type SolverHandle = TaskHandle<SolverResult>;

/** Solver w osobnym workerze; postęp jest nieokreślony (solver nie raportuje kroków). */
export function runSolver(kind: SolverKind, s: Scenario, o: SolverOptions, createWorker?: () => SimWorker): SolverHandle {
  return runTask((w) => w.solve(kind, s, o), createWorker);
}
