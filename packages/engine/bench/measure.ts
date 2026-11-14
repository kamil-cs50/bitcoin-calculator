import { runBatch } from '../src/runner';
import { makePerfScenario } from './perfScenario';

export const PATHS = 10_000;
export const RUNS = 3;

/** Mierzy runBatch (jeden wątek): rozgrzewka na 300 ścieżkach, potem RUNS pełnych przebiegów; zwraca czasy w sekundach. */
export function measure(log: (line: string) => void): { times: number[]; best: number; median: number } {
  const s = makePerfScenario();
  runBatch(s, { seed: 1, paths: 300 });
  const times: number[] = [];
  for (let k = 0; k < RUNS; k++) {
    const t0 = performance.now();
    runBatch(s, { seed: 20_261_114, paths: PATHS });
    const sec = (performance.now() - t0) / 1000;
    times.push(sec);
    log(`[perf] ${PATHS} ścieżek × ${s.horizonMonths} mies.: ${sec.toFixed(3)} s, ${((PATHS * s.horizonMonths) / sec / 1e6).toFixed(2)} mln ścieżko-miesięcy/s`);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  log(`[perf] mediana ${median.toFixed(3)} s, najlepszy ${sorted[0]!.toFixed(3)} s (kryterium < 3,0 s)`);
  return { times, best: sorted[0]!, median };
}

// uruchomienie bezpośrednie: `pnpm --filter @sim/engine bench:node` (bez narzutu transformacji vitest)
if (process.argv[1] && /measure\.ts$/.test(process.argv[1])) measure((l) => console.log(l));
