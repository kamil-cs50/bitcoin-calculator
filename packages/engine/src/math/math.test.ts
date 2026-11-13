import { describe, expect, it } from 'vitest';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import { normalInv } from './normalInv';
import { chi2Quantile, gammaP } from './gamma';
import { buildScaleTable, meanExpHalfVar } from './scaleTable';

const mean = (a: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s / a.length;
};

/** Dystrybuanta normalna przez gammaP: erf(x/√2) = P(1/2, x²/2). */
const phi = (x: number): number => {
  const p = 0.5 * gammaP(0.5, (x * x) / 2);
  return x >= 0 ? 0.5 + p : 0.5 - p;
};

describe('normalInv', () => {
  it('zgadza się z wartościami referencyjnymi', () => {
    expect(normalInv(0.5)).toBe(0);
    expect(normalInv(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(normalInv(0.001)).toBeCloseTo(-3.090232306167813, 12);
  });

  it('jest antysymetryczna i działa w ogonach', () => {
    expect(normalInv(0.999)).toBeCloseTo(-normalInv(0.001), 12);
    expect(normalInv(1e-10)).toBeCloseTo(-6.361340902404056, 9);
  });

  it('próbka z generatora ma momenty N(0,1) w 4 SE i przechodzi KS', () => {
    const n = 1_000_000;
    const g = Xoshiro128ss.fromSeed(2024);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = normalInv(g.nextUniform());
    const m = mean(x);
    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (let i = 0; i < n; i++) {
      const d = x[i]! - m;
      m2 += d * d;
      m3 += d * d * d;
      m4 += d * d * d * d;
    }
    m2 /= n;
    m3 /= n;
    m4 /= n;
    expect(Math.abs(m)).toBeLessThan(4 / Math.sqrt(n));
    expect(Math.abs(m2 - 1)).toBeLessThan(4 * Math.sqrt(2 / n));
    expect(Math.abs(m3 / m2 ** 1.5)).toBeLessThan(4 * Math.sqrt(6 / n));
    expect(Math.abs(m4 / (m2 * m2) - 3)).toBeLessThan(4 * Math.sqrt(24 / n));
    x.sort();
    let dmax = 0;
    for (let i = 0; i < n; i++) {
      const f = phi(x[i]!);
      dmax = Math.max(dmax, Math.abs(f - i / n), Math.abs((i + 1) / n - f));
    }
    expect(dmax).toBeLessThan(2.23 / Math.sqrt(n));
  });
});

describe('gammaP i chi2Quantile', () => {
  it('gammaP: wartości znane', () => {
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(gammaP(0.5, 2)).toBeCloseTo(0.9544997361036416, 10); // erf(√2)
    expect(gammaP(3, 0)).toBe(0);
  });

  it('kwantyle chi2 (tablice)', () => {
    expect(chi2Quantile(0.5, 5)).toBeCloseTo(4.35146, 5);
    expect(chi2Quantile(0.95, 5)).toBeCloseTo(11.070498, 5);
    expect(chi2Quantile(0.05, 5)).toBeCloseTo(1.145476, 5);
  });
});

describe('buildScaleTable', () => {
  it('ma K = 1024, jednostkową średnią kwadratów i ograniczone maksimum', () => {
    const s = buildScaleTable(5);
    expect(s.length).toBe(1024);
    expect(mean(s.map((v) => v * v))).toBeCloseTo(1, 12);
    expect(Math.max(...s)).toBeGreaterThan(4);
    expect(Math.max(...s)).toBeLessThan(8);
  });

  it('nu < 3 jest odrzucone, nu = Infinity daje same jedynki', () => {
    expect(() => buildScaleTable(2.5)).toThrow();
    const s = buildScaleTable(Infinity, 16);
    expect(Array.from(s)).toEqual(new Array(16).fill(1));
  });

  it('meanExpHalfVar(0.05, nu=Inf) = exp(0.00125); grube ogony podnoszą średnią', () => {
    expect(meanExpHalfVar(0.05, buildScaleTable(Infinity))).toBeCloseTo(Math.exp(0.00125), 12);
    expect(meanExpHalfVar(0.05, buildScaleTable(5))).toBeGreaterThan(Math.exp(0.00125));
  });
});
