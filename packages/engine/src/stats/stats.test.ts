import { describe, expect, it } from 'vitest';
import { FAN_LEVELS, fanChart, histogram, samplePathIndices, summarize } from './summary';
import { quantile7, quantilesSelect } from './quantiles';
import { quantileCI, wilson } from './intervals';
import { arithmeticMeanFromLogReturns, arithmeticMeanMonthly, sampleCorrelation } from './modelCheck';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import { normalInv } from '../math/normalInv';
import { buildScaleTable, meanExpHalfVar } from '../math/scaleTable';
import { regimeConstants, sigmaMonthlyFactor } from '../models/regime';
import { makeScenario } from '../testing/fixtures';
import type { RunResult } from '../types';

/** Ręcznie zbudowany RunResult: siatka {0, 12, 24}, jedno aktywo; wealth[p] = wartości w trzech punktach. */
function mk(rows: number[][], opts: { cpi?: number[][]; ruinMonth?: number[]; collapsed?: number[]; twrLog?: number[]; maxDrawdown?: number[]; worst12m?: number[] } = {}): RunResult {
  const paths = rows.length;
  const G = rows[0]!.length;
  const grid = Int32Array.from({ length: G }, (_, j) => j * 12);
  const wealth = new Float32Array(paths * G);
  const cpi = new Float32Array(paths * G).fill(1);
  rows.forEach((r, p) => r.forEach((v, j) => (wealth[p * G + j] = v)));
  opts.cpi?.forEach((r, p) => r.forEach((v, j) => (cpi[p * G + j] = v)));
  return {
    paths,
    grid,
    wealth,
    wealthAfterTax: wealth.map((v) => v * 0.9),
    cpi,
    ruinMonth: Int32Array.from(opts.ruinMonth ?? new Array(paths).fill(-1)),
    maxDrawdown: Float32Array.from(opts.maxDrawdown ?? new Array(paths).fill(0)),
    worst12m: Float32Array.from(opts.worst12m ?? new Array(paths).fill(0)),
    twrLog: Float32Array.from(opts.twrLog ?? new Array(paths).fill(0)),
    collapsed: Uint8Array.from(opts.collapsed ?? new Array(paths).fill(0)),
    meanShare: new Float64Array(2),
    warnings: [],
  };
}

describe('quantile7', () => {
  it('wartości wzorcowe typu 7', () => {
    expect(quantile7([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile7([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 12);
    expect(quantile7([5], 0.9)).toBe(5);
    expect(quantile7([1, 2, 3], 0)).toBe(1);
    expect(quantile7([1, 2, 3], 1)).toBe(3);
  });
});

describe('wilson / quantileCI', () => {
  it('Wilson 90/100', () => {
    const [lo, hi] = wilson(90, 100);
    expect(lo).toBeCloseTo(0.8256, 4);
    expect(hi).toBeCloseTo(0.9448, 4);
  });
  it('brzegi', () => {
    expect(wilson(0, 100)[0]).toBe(0);
    expect(wilson(100, 100)[1]).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
  it('quantileCI(1000, 0.5)', () => {
    expect(quantileCI(1000, 0.5)).toEqual([469, 531]);
  });
  it('indeksy mieszczą się w [0, n-1]', () => {
    const [lo, hi] = quantileCI(10, 0.01);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(9);
  });
  it('pokrycie: prawdziwa mediana N(0,1) w przedziale w 93-97% z 2000 powtórzeń (n = 500)', () => {
    const rng = Xoshiro128ss.fromSeed(20_261_113);
    const n = 500;
    const [lo, hi] = quantileCI(n, 0.5);
    let covered = 0;
    const reps = 2000;
    for (let r = 0; r < reps; r++) {
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = normalInv(rng.nextUniform());
      x.sort();
      if (x[lo]! <= 0 && 0 <= x[hi]!) covered++;
    }
    const c = covered / reps;
    expect(c).toBeGreaterThan(0.93);
    expect(c).toBeLessThan(0.97);
  });
});

describe('fanChart', () => {
  it('real: wartość = wealth / cpi, poziomy rosnące w każdym miesiącu, ruina jako 0', () => {
    const rng = Xoshiro128ss.fromSeed(7);
    const rows: number[][] = [];
    const cpi: number[][] = [];
    for (let p = 0; p < 40; p++) {
      rows.push([100, 100 + 50 * rng.nextUniform(), 100 + 100 * rng.nextUniform()]);
      cpi.push([1, 1.03, 1.0609]);
    }
    rows[0] = [100, 0, 0]; // ruina
    rows[1] = [100, 0, 0];
    const r = mk(rows, { cpi });
    const f = fanChart(r, { real: true, afterTax: false });
    expect([...f.months]).toEqual([0, 12, 24]);
    expect(f.levels).toEqual(FAN_LEVELS);
    expect(f.values.length).toBe(FAN_LEVELS.length * 3);
    for (let j = 0; j < 3; j++) for (let l = 1; l < FAN_LEVELS.length; l++) expect(f.values[l * 3 + j]!).toBeGreaterThanOrEqual(f.values[(l - 1) * 3 + j]!);
    // 2 z 40 ścieżek = 0 -> kwantyl 5% (pozycja 0,05·39 = 1,95) leży między 0 a najniższą dodatnią, 0-wartość wliczona
    const real24 = rows.map((row) => row[2]! / 1.0609).sort((a, b) => a - b);
    expect(f.values[0 * 3 + 2]!).toBeCloseTo(quantile7(real24, 0.05), 3);
    expect(real24[0]).toBe(0);
    expect(f.values[3 * 3 + 2]!).toBeCloseTo(quantile7(real24, 0.5), 3);
  });
  it('nominalnie i po podatku', () => {
    const r = mk([[100, 200, 300], [100, 100, 100], [100, 50, 10]]);
    const nom = fanChart(r, { real: false, afterTax: false });
    expect(nom.values[3 * 3 + 1]).toBeCloseTo(100, 4);
    const at = fanChart(r, { real: false, afterTax: true });
    expect(at.values[3 * 3 + 1]).toBeCloseTo(90, 4);
  });
});

describe('summarize', () => {
  const s = makeScenario({ horizonMonths: 24, goal: { amountReal: 100, month: 24 } });
  const finals = [0, 0, 80, 90, 100, 110, 120, 130, 140, 150];

  it('ruina obniża medianę (porównanie z wersją bez ruiny)', () => {
    const ruin = mk(finals.map((v) => [100, v, v]), { ruinMonth: [5, 7, -1, -1, -1, -1, -1, -1, -1, -1] });
    const noRuin = mk(finals.map((v) => [100, v === 0 ? 150 : v, v === 0 ? 150 : v]));
    const a = summarize(ruin, s, { month: 24, real: false, afterTax: false });
    const b = summarize(noRuin, s, { month: 24, real: false, afterTax: false });
    expect(a.median).toBe(quantile7(finals, 0.5)); // 105
    expect(a.median).toBeLessThan(b.median);
    expect(a.probRuin.p).toBeCloseTo(0.2, 12);
    expect(a.probRuin.ci[0]).toBeLessThan(0.2);
    expect(a.probRuin.ci[1]).toBeGreaterThan(0.2);
    expect(b.probRuin.p).toBe(0);
  });

  it('średnia, p10, p90, przedział mediany', () => {
    const r = mk(finals.map((v) => [100, v, v]));
    const o = summarize(r, s, { month: 24, real: false, afterTax: false });
    expect(o.mean).toBeCloseTo(92, 4);
    expect(o.p10).toBeCloseTo(quantile7(finals, 0.1), 4);
    expect(o.p90).toBeCloseTo(quantile7(finals, 0.9), 4);
    const [lo, hi] = quantileCI(10, 0.5);
    expect(o.medianCI).toEqual([finals[lo]!, finals[hi]!]);
  });

  it('cvar5 = średnia z najniższych 5% wartości końcowych', () => {
    const vals = Array.from({ length: 100 }, (_, i) => 1000 - i * 7); // malejąco, nieposortowane
    const r = mk(vals.map((v) => [100, v, v]));
    const o = summarize(r, s, { month: 24, real: false, afterTax: false });
    const sorted = [...vals].sort((a, b) => a - b);
    const expected = (sorted[0]! + sorted[1]! + sorted[2]! + sorted[3]! + sorted[4]!) / 5;
    expect(o.cvar5).toBeCloseTo(expected, 4);
  });

  it('prawdopodobieństwo celu (realnie, w miesiącu celu), straty realnej', () => {
    const cpi = finals.map(() => [1, 1, 1.0609]);
    const r = mk(finals.map((v) => [100, v, v]), { cpi });
    const o = summarize(r, s, { month: 24, real: true, afterTax: false });
    // real = v / 1,0609 >= 100  <=>  v >= 106,09  -> 110..150 = 5 ścieżek
    expect(o.probGoal!.p).toBeCloseTo(0.5, 12);
    expect(o.probGoal!.ci[0]).toBeLessThan(0.5);
    // strata realna: v / 1,0609 < 100 -> v <= 106,09: 0, 0, 80, 90, 100 = 5 ścieżek
    expect(o.probRealLoss.p).toBeCloseTo(0.5, 12);
    const noGoal = summarize(r, makeScenario({ horizonMonths: 24 }), { month: 24, real: true, afterTax: false });
    expect(noGoal.probGoal).toBeUndefined();
  });

  it('obsunięcia, najgorsze 12 mies., realny CAGR, upadki', () => {
    const n = 11;
    const rows = Array.from({ length: n }, () => [100, 100, 100]);
    const dd = Array.from({ length: n }, (_, i) => i / 10); // 0..1
    const w12 = Array.from({ length: n }, (_, i) => -i / 20);
    const twr = Array.from({ length: n }, () => Math.log(1.1) * 2); // 2 lata, nominalnie 10% rocznie
    const cpi = rows.map(() => [1, 1.03, 1.0609]); // 3% inflacji -> realnie 1,1/1,03 − 1
    const r = mk(rows, { maxDrawdown: dd, worst12m: w12, twrLog: twr, cpi, collapsed: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const sc = makeScenario({ horizonMonths: 24 });
    const o = summarize(r, sc, { month: 24, real: true, afterTax: false });
    expect(o.maxDrawdown.p50).toBeCloseTo(0.5, 6);
    expect(o.maxDrawdown.p90).toBeCloseTo(0.9, 6);
    expect(o.worst12m.p10).toBeCloseTo(quantile7([...w12].sort((a, b) => a - b), 0.1), 6);
    const cagr = 1.1 / 1.03 - 1;
    expect(o.realCagr.p10).toBeCloseTo(cagr, 5);
    expect(o.realCagr.p50).toBeCloseTo(cagr, 5);
    expect(o.realCagr.p90).toBeCloseTo(cagr, 5);
    expect(o.probCollapse).toEqual({ globalEquity: 2 / 11 });
  });

  it('miesiąc spoza siatki: najbliższy punkt siatki nie większy niż month', () => {
    const r = mk([[100, 110, 120], [100, 120, 140]]);
    const o = summarize(r, s, { month: 13, real: false, afterTax: false });
    expect(o.median).toBeCloseTo(115, 4);
  });
});

describe('histogram', () => {
  it('zlicza wszystkie wartości, max trafia do ostatniego kosza', () => {
    const h = histogram([0, 1, 2, 3, 4, 10], 5);
    expect(h.edges.length).toBe(6);
    expect(h.edges[0]).toBe(0);
    expect(h.edges[5]).toBe(10);
    expect([...h.counts]).toEqual([2, 2, 1, 0, 1]);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(6);
  });
  it('stała wartość', () => {
    const h = histogram([3, 3, 3], 4);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('samplePathIndices', () => {
  it('zwraca ścieżki najbliższe kwantylom wartości końcowej', () => {
    const finals = [50, 10, 30, 20, 40, 60, 70, 80, 90, 100, 5];
    const r = mk(finals.map((v) => [100, v, v]));
    const idx = samplePathIndices(r, [0, 0.5, 1]);
    expect(idx.map((i) => finals[i])).toEqual([5, 50, 100]);
  });
});

describe('modelCheck (R-6)', () => {
  const regime = { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 };
  it('bez reżimów (p01 = 0, alpha = 0) zgadza się z e^mu * meanExpHalfVar', () => {
    const nu = 5;
    const mu = 0.005;
    const sigma = 0.16;
    const g = arithmeticMeanMonthly({ mu, sigma, alpha: 0, b: 1, nu, regime: { ...regime, p01: 0 } });
    const c = regimeConstants({ ...regime, p01: 0 });
    const sm = sigma * sigmaMonthlyFactor(0, 1, { ...regime, p01: 0 }, c);
    expect(g).toBeCloseTo(Math.exp(mu) * meanExpHalfVar(sm, buildScaleTable(nu)), 12);
  });
  it('z reżimami: zgodność z symulacją iid miesięcznych zwrotów w granicach 4·SE', () => {
    const nu = 5;
    const mu = 0.004;
    const sigma = 0.2;
    const alpha = 0.6;
    const b = 1;
    const exact = arithmeticMeanMonthly({ mu, sigma, alpha, b, nu, regime });
    const c = regimeConstants(regime);
    const sm = sigma * sigmaMonthlyFactor(alpha, b, regime, c);
    const table = buildScaleTable(nu);
    const rng = Xoshiro128ss.fromSeed(424_242);
    const N = 400_000;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const crisis = rng.nextUniform() < c.pi1;
      const delta = crisis ? c.delta1 : c.delta0;
      const kap = crisis ? 1 + b * (regime.kappa1 - 1) : 1;
      const sk = table[Math.min(1023, Math.floor(rng.nextUniform() * 1024))]!;
      x[i] = mu + alpha * sigma * delta + sm * kap * sk * normalInv(rng.nextUniform());
    }
    let mean = 0;
    for (let i = 0; i < N; i++) mean += Math.exp(x[i]!);
    mean /= N;
    let v = 0;
    for (let i = 0; i < N; i++) v += (Math.exp(x[i]!) - mean) ** 2;
    const se = Math.sqrt(v / (N - 1) / N);
    expect(Math.abs(mean - exact)).toBeLessThan(4 * se);
  });
  it('arithmeticMeanFromLogReturns i sampleCorrelation', () => {
    expect(arithmeticMeanFromLogReturns([0, Math.log(2)])).toBeCloseTo(1.5, 12);
    expect(sampleCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(sampleCorrelation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });
});

describe('summarize: P(cel) dokładnie w miesiącu celu (poza siatką kwartalną)', () => {
  it('probGoal liczone w miesiącu celu', async () => {
    const { runBatch } = await import('../runner');
    const s0 = makeScenario({ horizonMonths: 240, tax: { kind: 'none' } });
    const r0 = runBatch({ ...s0, goal: { amountReal: 1, month: 100 } }, { seed: 5, paths: 300 });
    const j = Array.from(r0.grid).indexOf(100);
    expect(j).toBeGreaterThan(0);
    const G = r0.grid.length;
    const real: number[] = [];
    for (let p = 0; p < r0.paths; p++) real.push(r0.wealth[p * G + j]! / r0.cpi[p * G + j]!);
    real.sort((a, b) => a - b);
    const amount = real[150]!;
    const s = { ...s0, goal: { amountReal: amount, month: 100 } };
    const r = runBatch(s, { seed: 5, paths: 300 });
    const sm = summarize(r, s, { month: 240, real: true, afterTax: false });
    let hit = 0;
    for (let p = 0; p < r.paths; p++) if (r.wealthAfterTax[p * G + j]! / r.cpi[p * G + j]! >= amount) hit++;
    expect(sm.probGoal!.p).toBeCloseTo(hit / 300, 12);
  });
});

describe('quantilesSelect (wybór zamiast sortowania)', () => {
  it('daje dokładnie te same wartości co quantile7 na posortowanej próbie (z powtórzeniami i zerami)', () => {
    const rng = Xoshiro128ss.fromSeed(11);
    const ps = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0, 1];
    for (const n of [1, 2, 3, 7, 40, 1001, 10_000]) {
      const a = new Float64Array(n).map(() => Math.floor(rng.nextUniform() * 50) * (rng.nextUniform() < 0.1 ? 0 : 1));
      const sorted = Float64Array.from(a).sort();
      const got = quantilesSelect(Float64Array.from(a), ps);
      ps.forEach((p, i) => expect(got[i]).toBe(quantile7(sorted, p)));
    }
  });
  it('pusta próba daje NaN', () => {
    expect(quantilesSelect(new Float64Array(0), [0.5])[0]).toBeNaN();
  });
});
