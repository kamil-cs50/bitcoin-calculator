import type { Scenario } from '@sim/engine';
import { runTask } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';

/**
 * Mediana realnego rocznego zwrotu portfela (CAGR), `r` dla amortyzacji (ABW, spec 4.11); definicja w
 * `estimateCore.ts`. Liczona w osobnym workerze, żeby zmiana portfela nie blokowała interfejsu.
 */
export function estimateRealReturn(s: Scenario, createWorker?: () => SimWorker): Promise<number> {
  return runTask((w) => w.estimate(s), createWorker).done;
}
