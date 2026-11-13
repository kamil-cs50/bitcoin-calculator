import { describe, expect, it } from 'vitest';
import { normalInv } from '../math/normalInv';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import type { InflationParams } from '../types';
import { calibrateInflation, gSum, InflationProcess, rho12 } from './inflation';

function history(yyAnnual: number): number[] {
  return Array.from({ length: 13 }, (_, i) => 100 * Math.pow(1 + yyAnnual, (i - 12) / 12));
}

function params(over: Partial<InflationParams> = {}): InflationParams {
  const c = calibrateInflation(0.02, 0.4);
  return { x0: 0.035, mean: 0.035, meanSe: 0, phi: c.phi, sigmaEta: c.sigmaEta, cpiHistory: history(0.035), ...over };
}

describe('kalibracja inflacji r/r (spec 4.6, Z-12)', () => {
  it('G(0) = 12 i wartości kontrolne', () => {
    expect(gSum(0)).toBe(12);
    const c = calibrateInflation(0.02, 0.4);
    expect(c.phi).toBeCloseTo(0.87709, 4);
    expect(gSum(c.phi)).toBeCloseTo(91.214, 2);
    expect(c.sigmaEta).toBeCloseTo(0.01207, 5);
    expect(rho12(c.phi)).toBeCloseTo(0.4, 10);
  });

  it('odrzuca nieosiągalną autokorelację i niedodatnie odchylenie', () => {
    expect(() => calibrateInflation(0.02, 1.2)).toThrow();
    expect(() => calibrateInflation(0.02, 0)).toThrow();
    expect(() => calibrateInflation(0, 0.4)).toThrow();
  });
});

describe('InflationProcess', () => {
  it('start: yy() = 3,5% r/r z 13 poziomów, cpiLog = 0, x = x0', () => {
    const p = new InflationProcess(params());
    p.init(0.035);
    expect(p.x).toBe(0.035);
    expect(p.cpiLog).toBe(0);
    expect(Math.abs(p.yy() - 0.035)).toBeLessThan(1e-12);
  });

  it('krok: x_{t+1} = m + φ(x−m) + σ_η·ε, cpiLog += x_{t+1}/12', () => {
    const q = params({ x0: 0.05 });
    const p = new InflationProcess(q);
    p.init(0.03);
    p.step(1);
    const x1 = 0.03 + q.phi * (0.05 - 0.03) + q.sigmaEta;
    expect(p.x).toBeCloseTo(x1, 15);
    expect(p.cpiLog).toBeCloseTo(x1 / 12, 15);
  });

  it('yy(2) po 5 krokach używa poziomów sprzed 2 miesięcy', () => {
    const p = new InflationProcess(params({ x0: 0.06, mean: 0.06 }));
    p.init(0.06); // x stałe = 6% przy zerowych szokach
    for (let i = 0; i < 5; i++) p.step(0);
    // przyrosty: historia 3,5% r/r, potem 6% r/r; yy(2): okno t−14..t−2 (miesiące −9..3)
    const mH = Math.log(1.035) / 12;
    const mN = 0.06 / 12;
    const manual = Math.exp(3 * mN + 9 * mH) - 1; // 3 nowe + 9 historycznych miesięcy
    expect(p.yy(2)).toBeCloseTo(manual, 12);
    // yy(0) po 5 krokach: 5 nowych + 7 historycznych
    expect(p.yy()).toBeCloseTo(Math.exp(5 * mN + 7 * mH) - 1, 12);
  });

  it('init resetuje stan ścieżki', () => {
    const p = new InflationProcess(params());
    p.init(0.035);
    for (let i = 0; i < 30; i++) p.step(0.5);
    p.init(0.035);
    expect(p.cpiLog).toBe(0);
    expect(p.x).toBe(0.035);
    expect(Math.abs(p.yy() - 0.035)).toBeLessThan(1e-12);
  });

  it('statystyka: sd ln(1+yy) = 2 pp, autokorelacja lag 12 = 0,4, średnia x = mean (4 SE)', () => {
    const q = params();
    const nPaths = 2000;
    const nMonths = 600;
    const burn = 120;
    const m = 0.035; // E ln(1+yy) = średnia x
    const target = 0.02 * 0.02;
    const rng = Xoshiro128ss.fromSeed(20261113);
    const p = new InflationProcess(q);
    const c0: number[] = [];
    const c12: number[] = [];
    const xm: number[] = [];
    for (let i = 0; i < nPaths; i++) {
      p.init(m);
      const y: number[] = [];
      let sx = 0;
      for (let t = 0; t < nMonths; t++) {
        p.step(normalInv(rng.nextUniform()));
        if (t >= burn) {
          y.push(Math.log(1 + p.yy()) - m);
          sx += p.x;
        }
      }
      let a = 0;
      let b = 0;
      for (let t = 0; t < y.length; t++) a += y[t]! * y[t]!;
      for (let t = 12; t < y.length; t++) b += y[t]! * y[t - 12]!;
      c0.push(a / y.length);
      c12.push(b / (y.length - 12));
      xm.push(sx / y.length);
    }
    const mean = (v: number[]) => v.reduce((s, e) => s + e, 0) / v.length;
    const se = (v: number[]) => {
      const mu = mean(v);
      return Math.sqrt(v.reduce((s, e) => s + (e - mu) ** 2, 0) / (v.length - 1) / v.length);
    };
    const v0 = mean(c0);
    expect(Math.abs(v0 - target)).toBeLessThan(4 * se(c0));
    const rho = mean(c12) / v0;
    const u = c12.map((a, i) => (a - 0.4 * c0[i]!) / v0);
    expect(Math.abs(rho - 0.4)).toBeLessThan(4 * se(u));
    expect(Math.abs(mean(xm) - m)).toBeLessThan(4 * se(xm));
  });
});
