import type { SimWorker } from './pool';
import { tasks } from './tasks';

/** Worker synchroniczny (bez Web Workera): testy i środowiska bez `Worker`. Pola można nadpisać. */
export function syncWorker(over: Partial<SimWorker> = {}): SimWorker {
  return {
    run: async (s, o) => tasks.run(s, o),
    solve: async (k, s, o) => tasks.solve(k, s, o),
    modelCheck: async (s, o) => tasks.modelCheck(s, o),
    summary: async (s, o, v) => tasks.summary(s, o, v),
    estimate: async (s) => tasks.estimate(s),
    pairedDiff: async (a, b, r) => tasks.pairedDiff(a, b, r),
    terminate: () => undefined,
    ...over,
  };
}
