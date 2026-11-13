import { describe, expect, it } from 'vitest';
import { annualizedVol, autocorr, fitTwoRegime, ledoitWolfShrink, logReturns } from './stats';
import { makeRng } from './testRng';

describe('logReturns / annualizedVol', () => {
  it('logReturns liczy ln(L_t / L_{t-1})', () => {
    const r = logReturns([100, 110, 99]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 12);
    expect(r[1]).toBeCloseTo(Math.log(0.9), 12);
  });

  it('annualizedVol stałego szeregu = 0', () => {
    expect(annualizedVol(new Array<number>(60).fill(0.01))).toBeCloseTo(0, 12);
  });

  it('annualizedVol = sd · √12', () => {
    expect(annualizedVol([0.01, -0.01, 0.01, -0.01])).toBeCloseTo(Math.sqrt(12) * 0.01 * Math.sqrt(4 / 3), 10);
  });
});

describe('autocorr', () => {
  it('AR(1) φ = 0,8 (n = 20 000, ziarno): 0,8 ± 0,03', () => {
    const rng = makeRng(12345);
    const x: number[] = [];
    let prev = 0;
    for (let i = 0; i < 20_000; i++) {
      prev = 0.8 * prev + rng.normal();
      x.push(prev);
    }
    expect(Math.abs(autocorr(x, 1) - 0.8)).toBeLessThan(0.03);
  });
});

describe('ledoitWolfShrink', () => {
  it('dane o prawdziwej korelacji 0,5: macierz dodatnio określona, element w (0,3; 0,7)', () => {
    const rng = makeRng(777);
    const n = 120;
    const rows: number[][] = [];
    for (let t = 0; t < n; t++) {
      const common = rng.normal();
      rows.push([0, 1, 2].map(() => Math.sqrt(0.5) * common + Math.sqrt(0.5) * rng.normal()));
    }
    const m = ledoitWolfShrink(rows);
    expect(m).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(m[i]![i]).toBeCloseTo(1, 10);
      for (let j = 0; j < 3; j++) {
        expect(m[i]![j]).toBeCloseTo(m[j]![i]!, 12);
        if (i !== j) {
          expect(m[i]![j]!).toBeGreaterThan(0.3);
          expect(m[i]![j]!).toBeLessThan(0.7);
        }
      }
    }
    // dodatnia określoność: minory główne > 0 (macierz 3×3)
    const a = m[0]![1]!, b = m[0]![2]!, c = m[1]![2]!;
    expect(1 - a * a).toBeGreaterThan(0);
    expect(1 + 2 * a * b * c - a * a - b * b - c * c).toBeGreaterThan(0);
  });
});

describe('fitTwoRegime', () => {
  it('6 000 obserwacji z p01 = 0,04, p10 = 0,2, κ1 = 2,2: odzyskuje p01 ± 0,015 i p10 ± 0,06', () => {
    const rng = makeRng(2024);
    const n = 6000;
    const p01 = 0.04, p10 = 0.2, kappa1 = 2.2, sigma0 = 0.03;
    const x: number[] = [];
    let s = 0;
    for (let t = 0; t < n; t++) {
      const u = rng.uniform();
      s = s === 0 ? (u < p01 ? 1 : 0) : u < p10 ? 0 : 1;
      x.push(0.005 + sigma0 * (s === 1 ? kappa1 : 1) * rng.normal());
    }
    const fit = fitTwoRegime(x);
    expect(Math.abs(fit.p01 - p01)).toBeLessThan(0.015);
    expect(Math.abs(fit.p10 - p10)).toBeLessThan(0.06);
    expect(fit.kappa1).toBeGreaterThan(1.8);
    expect(fit.kappa1).toBeLessThan(2.7);
    expect(Number.isFinite(fit.logLik)).toBe(true);
    expect(fit.nu).toBeGreaterThanOrEqual(2);
  });
});
