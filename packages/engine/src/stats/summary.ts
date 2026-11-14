import type { RunResult, Scenario } from '../types';
import { quantileCI, wilson } from './intervals';
import { quantile7, quantilesSelect } from './quantiles';

export const FAN_LEVELS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] as const;

export interface FanChart {
  months: Int32Array;
  levels: readonly number[];
  values: Float32Array; // [level * months.length + j]
}

export interface Summary {
  median: number;
  p10: number;
  p90: number;
  mean: number;
  cvar5: number;
  probGoal?: { p: number; ci: [number, number] };
  probRealLoss: { p: number; ci: [number, number] };
  probRuin: { p: number; ci: [number, number] };
  medianCI: [number, number];
  maxDrawdown: { p50: number; p90: number };
  worst12m: { p10: number };
  realCagr: { p10: number; p50: number; p90: number };
  probCollapse: Record<string, number>;
}

/** Wartość ścieżek w punkcie siatki j (nominalnie lub realnie, przed lub po podatku), Float64; ruina = 0. */
function column(r: RunResult, j: number, real: boolean, afterTax: boolean): Float64Array {
  const G = r.grid.length;
  const src = afterTax ? r.wealthAfterTax : r.wealth;
  const out = new Float64Array(r.paths);
  for (let p = 0; p < r.paths; p++) {
    const w = src[p * G + j]!;
    out[p] = real ? w / r.cpi[p * G + j]! : w;
  }
  return out;
}

/** Ostatni punkt siatki o miesiącu ≤ `month` (min. punkt 0). */
function gridIndex(grid: Int32Array, month: number): number {
  let j = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]! <= month) j = i;
  return j;
}

const sortedCopy = (a: ArrayLike<number>): Float64Array => Float64Array.from(a as ArrayLike<number>).sort();

export function fanChart(r: RunResult, o: { real: boolean; afterTax: boolean }): FanChart {
  const G = r.grid.length;
  const L = FAN_LEVELS.length;
  const values = new Float32Array(L * G);
  for (let j = 0; j < G; j++) {
    const q = quantilesSelect(column(r, j, o.real, o.afterTax), FAN_LEVELS);
    for (let l = 0; l < L; l++) values[l * G + j] = q[l]!;
  }
  return { months: Int32Array.from(r.grid), levels: FAN_LEVELS, values };
}

function prob(k: number, n: number): { p: number; ci: [number, number] } {
  return { p: n > 0 ? k / n : 0, ci: wilson(k, n) };
}

export function summarize(r: RunResult, s: Scenario, o: { month: number; real: boolean; afterTax: boolean }): Summary {
  const n = r.paths;
  const G = r.grid.length;
  const j = gridIndex(r.grid, o.month);
  const month = r.grid[j]!;
  const vals = column(r, j, o.real, o.afterTax);
  const sorted = Float64Array.from(vals).sort();

  let sum = 0;
  for (let p = 0; p < n; p++) sum += vals[p]!;
  const m = Math.max(1, Math.ceil(0.05 * n - 1e-9));
  let tail = 0;
  for (let i = 0; i < m && i < n; i++) tail += sorted[i]!;
  const [cl, ch] = quantileCI(n, 0.5);

  // strata realna: wartość realna w miesiącu `month` poniżej realnej wartości początkowej (punkt 0, CPI = 1)
  const real = column(r, j, true, o.afterTax);
  const real0 = column(r, 0, true, o.afterTax);
  let loss = 0;
  for (let p = 0; p < n; p++) if (real[p]! < real0[p]!) loss++;

  let ruin = 0;
  for (let p = 0; p < n; p++) if (r.ruinMonth[p]! >= 0 && r.ruinMonth[p]! <= month) ruin++;

  let probGoal: Summary['probGoal'];
  if (s.goal) {
    const gv = column(r, gridIndex(r.grid, s.goal.month), true, o.afterTax);
    let hit = 0;
    for (let p = 0; p < n; p++) if (gv[p]! >= s.goal.amountReal) hit++;
    probGoal = prob(hit, n);
  }

  const dd = sortedCopy(r.maxDrawdown);
  const w12 = sortedCopy(r.worst12m);
  const years = r.grid[G - 1]! / 12;
  const cagr = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    const realLog = r.twrLog[p]! - Math.log(r.cpi[p * G + G - 1]!);
    cagr[p] = years > 0 ? Math.expm1(realLog / years) : 0;
  }
  cagr.sort();

  const A = n > 0 ? r.collapsed.length / n : 0;
  const probCollapse: Record<string, number> = {};
  for (let i = 0; i < A && i < s.assets.length; i++) {
    let c = 0;
    for (let p = 0; p < n; p++) if (r.collapsed[p * A + i]! !== 0) c++;
    probCollapse[s.assets[i]!.id] = n > 0 ? c / n : 0;
  }

  return {
    median: quantile7(sorted, 0.5),
    p10: quantile7(sorted, 0.1),
    p90: quantile7(sorted, 0.9),
    mean: n > 0 ? sum / n : NaN,
    cvar5: tail / Math.min(m, Math.max(n, 1)),
    probGoal,
    probRealLoss: prob(loss, n),
    probRuin: prob(ruin, n),
    medianCI: [sorted[cl]!, sorted[ch]!],
    maxDrawdown: { p50: quantile7(dd, 0.5), p90: quantile7(dd, 0.9) },
    worst12m: { p10: quantile7(w12, 0.1) },
    realCagr: { p10: quantile7(cagr, 0.1), p50: quantile7(cagr, 0.5), p90: quantile7(cagr, 0.9) },
    probCollapse,
  };
}

/** Histogram o `bins` równych koszach od min do max; max trafia do ostatniego kosza. Stała próba: szerokość 1. */
export function histogram(values: ArrayLike<number>, bins: number): { edges: Float64Array; counts: Uint32Array } {
  const edges = new Float64Array(bins + 1);
  const counts = new Uint32Array(bins);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(values.length > 0)) return { edges, counts };
  const width = max > min ? (max - min) / bins : 1 / bins;
  for (let b = 0; b <= bins; b++) edges[b] = min + b * width;
  if (max > min) edges[bins] = max;
  for (let i = 0; i < values.length; i++) {
    const b = Math.min(bins - 1, Math.floor((values[i]! - min) / width));
    counts[b]!++;
  }
  return { edges, counts };
}

/**
 * Indeksy ścieżek najbliższych kwantylom `levels` wartości końcowej (ostatni punkt siatki; domyślnie
 * nominalnie, przed podatkiem; opcjonalnie realnie / po podatku). Remisy rozstrzyga niższy indeks ścieżki.
 */
export function samplePathIndices(r: RunResult, levels: number[], o: { real?: boolean; afterTax?: boolean } = {}): number[] {
  const n = r.paths;
  if (n === 0) return levels.map(() => -1);
  const vals = column(r, r.grid.length - 1, o.real ?? false, o.afterTax ?? false);
  const order = Int32Array.from({ length: n }, (_, i) => i).sort((a, b) => vals[a]! - vals[b]! || a - b);
  const sorted = Float64Array.from(order, (i) => vals[i]!);
  return levels.map((q) => {
    const t = quantile7(sorted, q);
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    // lo = pierwszy element >= t; sąsiad po lewej może być bliższy
    let best = lo;
    if (lo > 0 && t - sorted[lo - 1]! <= sorted[lo]! - t) best = lo - 1;
    // przy remisie wartości wybierz najniższy indeks ścieżki
    const v = sorted[best]!;
    while (best > 0 && sorted[best - 1] === v) best--;
    return order[best]!;
  });
}
