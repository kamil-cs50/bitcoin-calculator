import { runBatch } from '@sim/engine';
import type { Scenario } from '@sim/engine';

const ESTIMATE_PATHS = 1000;
const ESTIMATE_SEED = 20_261_113;

/**
 * Mediana realnego rocznego zwrotu portfela (CAGR) z 1 000 ścieżek bez żadnych przepływów
 * (bez wpłat, wypłat i zdarzeń), po kosztach aktywów. To `r` dla amortyzacji (ABW, spec 4.11).
 * Pusty portfel albo zerowy horyzont dają 0. Stałe ziarno: ta sama liczba dla tego samego portfela.
 */
export async function estimateRealReturn(s: Scenario): Promise<number> {
  const start = s.positions.reduce((a, p) => a + p.value, 0);
  if (!(start > 0)) return 0;
  const { contribution: _c, withdrawal: _w, goal: _g, ...rest } = s;
  void _c;
  void _w;
  void _g;
  const r = runBatch({ ...rest, events: [] }, { seed: ESTIMATE_SEED, paths: ESTIMATE_PATHS });
  const G = r.grid.length;
  const years = r.grid[G - 1]! / 12;
  if (!(years > 0)) return 0;
  const cagr: number[] = [];
  for (let p = 0; p < r.paths; p++) {
    const end = r.wealth[p * G + G - 1]! / r.cpi[p * G + G - 1]!;
    const first = r.wealth[p * G]! / r.cpi[p * G]!;
    cagr.push(end > 0 && first > 0 ? Math.pow(end / first, 1 / years) - 1 : -1);
  }
  cagr.sort((a, b) => a - b);
  const n = cagr.length;
  return n % 2 ? cagr[(n - 1) / 2]! : (cagr[n / 2 - 1]! + cagr[n / 2]!) / 2;
}
