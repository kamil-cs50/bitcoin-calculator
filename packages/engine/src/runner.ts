import { Kernel } from './kernel';
import type { PathSink } from './kernel';
import type { RunOptions, RunResult, Scenario, Warning } from './types';

/** Etapy progresywne (spec 4.14) i limit trybu eksperckiego. */
export const STAGES = [1000, 4000, 10000] as const;
export const EXPERT_STAGE = 25000;

/**
 * Udziały średnie liczone w arytmetyce stałoprzecinkowej (2^32 na obserwację): sumy całkowite są łączne
 * i przemienne, więc wynik nie zależy od podziału ścieżek na części (T7, bajt w bajt).
 */
const SHARE_ONE = 4_294_967_296;

class BatchSink implements PathSink {
  path = 0;
  private readonly wealth: Float32Array;
  private readonly wealthAfterTax: Float32Array;
  private readonly cpi: Float32Array;
  private readonly G: number;
  private readonly A: number;
  private readonly assetOfPos: Int32Array;
  private readonly fallback: Float64Array; // udziały docelowe (stałoprzecinkowe) dla obserwacji z zerową wartością (ruina)
  private readonly yearOfPoint: Int32Array;
  private readonly kernel: Kernel;
  private readonly q: Float64Array;
  private readonly qOut: Float64Array;
  readonly shareSum: Float64Array;
  readonly ruinMonth: Int32Array;
  readonly maxDrawdown: Float32Array;
  readonly worst12m: Float32Array;
  readonly twrLog: Float32Array;

  constructor(s: Scenario, kernel: Kernel, paths: number, wealth: Float32Array, wealthAfterTax: Float32Array, cpi: Float32Array, yearOfPoint: Int32Array, years: number) {
    this.kernel = kernel;
    this.wealth = wealth;
    this.wealthAfterTax = wealthAfterTax;
    this.cpi = cpi;
    this.yearOfPoint = yearOfPoint;
    this.G = kernel.grid.length;
    this.A = s.assets.length;
    this.assetOfPos = Int32Array.from(s.positions.map((p) => s.assets.findIndex((a) => a.id === p.assetId)));
    this.q = new Float64Array(this.A);
    this.qOut = new Float64Array(this.A);
    this.shareSum = new Float64Array(years * this.A);
    this.ruinMonth = new Int32Array(paths);
    this.maxDrawdown = new Float32Array(paths);
    this.worst12m = new Float32Array(paths);
    this.twrLog = new Float32Array(paths);
    this.fallback = new Float64Array(this.A);
    this.buildFallback(s);
  }

  private buildFallback(s: Scenario): void {
    const w = new Float64Array(this.A);
    s.positions.forEach((p, i) => {
      if (p.targetWeight > 0) w[this.assetOfPos[i]!]! += p.targetWeight;
    });
    let sum = 0;
    for (let i = 0; i < this.A; i++) sum += w[i]!;
    if (!(sum > 0)) {
      w.fill(0);
      w[this.assetOfPos[0] ?? 0] = 1;
      sum = 1;
    }
    this.quantize(w, sum, this.fallback);
  }

  /** Zamienia wartości `w` (suma `sum` > 0) na liczby całkowite sumujące się dokładnie do SHARE_ONE. */
  private quantize(w: Float64Array, sum: number, out: Float64Array): void {
    let total = 0;
    let big = 0;
    for (let i = 0; i < this.A; i++) {
      const v = Math.round((w[i]! / sum) * SHARE_ONE);
      out[i] = v;
      total += v;
      if (w[i]! > w[big]!) big = i;
    }
    out[big]! += SHARE_ONE - total;
  }

  onGrid(j: number, wealth: number, wealthAfterTax: number, cpiLog: number): void {
    const o = this.path * this.G + j;
    this.wealth[o] = wealth;
    this.wealthAfterTax[o] = wealthAfterTax;
    this.cpi[o] = Math.exp(cpiLog);
    const y = this.yearOfPoint[j]!;
    if (y < 0) return;
    const A = this.A;
    const base = y * A;
    const values = this.kernel.positionValues();
    const w = this.q; // bufor roboczy wartości na aktywo
    w.fill(0);
    let sum = 0;
    for (let i = 0; i < this.assetOfPos.length; i++) {
      const v = values[i]!;
      if (v > 0) {
        w[this.assetOfPos[i]!]! += v;
        sum += v;
      }
    }
    if (sum > 0) {
      this.quantize(w, sum, this.qOut);
      for (let i = 0; i < A; i++) this.shareSum[base + i]! += this.qOut[i]!;
    } else {
      for (let i = 0; i < A; i++) this.shareSum[base + i]! += this.fallback[i]!;
    }
  }

  onEnd(ruinMonth: number, maxDrawdown: number, worst12mLog: number, twrLog: number): void {
    const p = this.path;
    this.ruinMonth[p] = ruinMonth;
    this.maxDrawdown[p] = maxDrawdown;
    // brak pełnego okna 12 mies. nie występuje (okno = min(T, 12)); Infinity tylko przy T = 0
    this.worst12m[p] = Number.isFinite(worst12mLog) ? Math.exp(worst12mLog) - 1 : 0;
    this.twrLog[p] = twrLog;
  }
}

/** Rok (0-based) dla każdego punktu siatki: miesiące 1..12 → 0, 13..24 → 1, …; punkt 0 nie wchodzi do średniej (−1). */
function yearsOfGrid(grid: Int32Array): { yearOfPoint: Int32Array; years: number; pointsPerYear: Int32Array } {
  const yearOfPoint = new Int32Array(grid.length);
  let years = 0;
  for (let j = 0; j < grid.length; j++) {
    const m = grid[j]!;
    yearOfPoint[j] = m === 0 ? -1 : Math.ceil(m / 12) - 1;
    if (yearOfPoint[j]! + 1 > years) years = yearOfPoint[j]! + 1;
  }
  const pointsPerYear = new Int32Array(years);
  for (let j = 0; j < grid.length; j++) if (yearOfPoint[j]! >= 0) pointsPerYear[yearOfPoint[j]!]!++;
  return { yearOfPoint, years, pointsPerYear };
}

/** Dzielnik średniej: liczba ścieżek × punkty roku × SHARE_ONE (potęga dwójki × całkowite, dokładny w double). */
const shareDivisor = (paths: number, points: number): number => paths * points * SHARE_ONE;

/**
 * Symuluje ścieżki `pathOffset .. pathOffset + paths − 1`. Wynik ścieżki zależy wyłącznie od (ziarno, indeks),
 * więc dowolny podział na części i `mergeResults` dają wynik identyczny bajt w bajt (T7).
 */
export function runBatch(s: Scenario, o: RunOptions): RunResult {
  const kernel = new Kernel(s);
  const grid = kernel.grid;
  const G = grid.length;
  const A = s.assets.length;
  const paths = o.paths;
  const offset = o.pathOffset ?? 0;
  const wealth = new Float32Array(paths * G);
  const wealthAfterTax = new Float32Array(paths * G);
  const cpi = new Float32Array(paths * G);
  const collapsed = new Uint8Array(paths * A);
  const { yearOfPoint, years, pointsPerYear } = yearsOfGrid(grid);
  const sink = new BatchSink(s, kernel, paths, wealth, wealthAfterTax, cpi, yearOfPoint, years);
  for (let p = 0; p < paths; p++) {
    sink.path = p;
    kernel.simulate(o.seed, offset + p, sink);
    collapsed.set(kernel.collapsed, p * A);
  }
  const meanShare = new Float64Array(years * A);
  for (let y = 0; y < years; y++) {
    const d = shareDivisor(paths, pointsPerYear[y]!);
    for (let i = 0; i < A; i++) meanShare[y * A + i] = paths > 0 ? sink.shareSum[y * A + i]! / d : 0;
  }
  return {
    paths,
    grid: Int32Array.from(grid),
    wealth,
    wealthAfterTax,
    cpi,
    ruinMonth: sink.ruinMonth,
    maxDrawdown: sink.maxDrawdown,
    worst12m: sink.worst12m,
    twrLog: sink.twrLog,
    collapsed,
    meanShare,
    warnings: kernel.warnings.slice(),
  };
}

/** Łączy części w podanej kolejności (rosnące `pathOffset`). Wymaga identycznej siatki i liczby aktywów. */
export function mergeResults(parts: RunResult[]): RunResult {
  if (parts.length === 0) throw new Error('mergeResults: brak części');
  const first = parts[0]!;
  const G = first.grid.length;
  const years = first.meanShare.length === 0 ? 0 : first.meanShare.length / (first.collapsed.length / Math.max(first.paths, 1));
  const A = first.paths > 0 ? first.collapsed.length / first.paths : 0;
  let total = 0;
  for (const p of parts) {
    if (p.grid.length !== G) throw new Error('mergeResults: różne siatki');
    total += p.paths;
  }
  const out: RunResult = {
    paths: total,
    grid: Int32Array.from(first.grid),
    wealth: new Float32Array(total * G),
    wealthAfterTax: new Float32Array(total * G),
    cpi: new Float32Array(total * G),
    ruinMonth: new Int32Array(total),
    maxDrawdown: new Float32Array(total),
    worst12m: new Float32Array(total),
    twrLog: new Float32Array(total),
    collapsed: new Uint8Array(total * A),
    meanShare: new Float64Array(first.meanShare.length),
    warnings: [],
  };
  const { pointsPerYear } = yearsOfGrid(first.grid);
  const sums = new Float64Array(first.meanShare.length);
  const seen = new Set<string>();
  let at = 0;
  for (const p of parts) {
    out.wealth.set(p.wealth, at * G);
    out.wealthAfterTax.set(p.wealthAfterTax, at * G);
    out.cpi.set(p.cpi, at * G);
    out.ruinMonth.set(p.ruinMonth, at);
    out.maxDrawdown.set(p.maxDrawdown, at);
    out.worst12m.set(p.worst12m, at);
    out.twrLog.set(p.twrLog, at);
    out.collapsed.set(p.collapsed, at * A);
    for (let y = 0; y < years; y++) {
      const d = shareDivisor(p.paths, pointsPerYear[y]!);
      for (let i = 0; i < A; i++) sums[y * A + i]! += Math.round(p.meanShare[y * A + i]! * d);
    }
    for (const w of p.warnings) pushUnique(out.warnings, seen, w);
    at += p.paths;
  }
  for (let y = 0; y < years; y++) {
    const d = shareDivisor(total, pointsPerYear[y]!);
    for (let i = 0; i < A; i++) out.meanShare[y * A + i] = sums[y * A + i]! / d;
  }
  return out;
}

function pushUnique(list: Warning[], seen: Set<string>, w: Warning): void {
  const key = w.code + '\u0000' + w.message;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(w);
}
