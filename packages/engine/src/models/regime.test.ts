import { describe, expect, it } from 'vitest';
import { clampAlpha, inRegimeCorrelation, omega, regimeConstants, sigmaMonthlyFactor } from './regime';

const r = { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 };

describe('regimeConstants i kalibracja (spec 4.4)', () => {
  const c = regimeConstants(r);

  it('wartości kontrolne', () => {
    expect(c.pi1).toBeCloseTo(1 / 6, 12);
    expect(c.pi0).toBeCloseTo(5 / 6, 12);
    expect(c.lambda).toBeCloseTo(0.76, 12);
    expect(c.A).toBeCloseTo(62.591, 4);
    expect(c.vDelta).toBeCloseTo(0.0042535, 7);
    expect(c.pi0 * c.delta0 + c.pi1 * c.delta1).toBeCloseTo(0, 15);
    expect(c.delta0).toBeCloseTo((1 / 6) * 0.175, 12);
    expect(c.delta1).toBeCloseTo(-(5 / 6) * 0.175, 12);
    expect(omega(1, c)).toBeCloseTo(0.2662, 4);
    expect(omega(-1, c)).toBeCloseTo(omega(1, c), 15);
    expect(sigmaMonthlyFactor(1, 1, r, c) * 0.16).toBeCloseTo(0.030895, 6);
    expect(sigmaMonthlyFactor(0, 0, r, c)).toBeCloseTo(1 / Math.sqrt(12), 12);
  });

  it('b = 0 daje κ = 1 (K = 1)', () => {
    expect(sigmaMonthlyFactor(0.5, 0, r, c)).toBeCloseTo(Math.sqrt((1 - omega(0.5, c)) / 12), 12);
  });

  it('gbm: p01 = 0 → π1 = 0, V_δ = 0, σ_m/σ = 1/√12', () => {
    const g = regimeConstants({ ...r, p01: 0 });
    expect(g.pi1).toBe(0);
    expect(g.vDelta).toBe(0);
    expect(sigmaMonthlyFactor(1, 1, { ...r, p01: 0 }, g)).toBeCloseTo(1 / Math.sqrt(12), 12);
    expect(clampAlpha(5, g)).toEqual({ alpha: 5, clamped: false });
  });

  it('clampAlpha wymusza ω ≤ 0,8 i zachowuje znak', () => {
    const cl = clampAlpha(3, c);
    expect(cl.clamped).toBe(true);
    expect(omega(cl.alpha, c)).toBeCloseTo(0.8, 10);
    const ng = clampAlpha(-3, c);
    expect(ng.alpha).toBeCloseTo(-cl.alpha, 12);
    expect(clampAlpha(1, c)).toEqual({ alpha: 1, clamped: false });
  });
});

describe('inRegimeCorrelation', () => {
  it('R̃ dla ρ = 0,8, α = 1, b = 1', () => {
    const out = inRegimeCorrelation(Float64Array.of(1, 0.8, 0.8, 1), 2, [1, 1], [1, 1], r);
    expect(out.matrix[1]).toBeCloseTo(0.72744, 4);
    expect(out.matrix[2]).toBe(out.matrix[1]);
    expect(out.matrix[0]).toBeCloseTo(1, 12);
    expect(out.warnings).toEqual([]);
  });

  it('α = 0 i b = 0: R̃ = ρ', () => {
    const out = inRegimeCorrelation(Float64Array.of(1, 0.3, 0.3, 1), 2, [0, 0], [0, 0], r);
    expect(out.matrix[1]).toBeCloseTo(0.3, 12);
  });

  it('ρ = −0,9 przy α = [1, 1] → rzut Highama i CORR_PROJECTED', () => {
    const out = inRegimeCorrelation(Float64Array.of(1, -0.9, -0.9, 1), 2, [1, 1], [1, 1], r);
    expect(out.warnings.map((w) => w.code)).toEqual(['CORR_PROJECTED']);
    expect(Math.abs(out.matrix[1]!)).toBeLessThanOrEqual(1);
    expect(out.matrix[0]).toBeCloseTo(1, 12);
  });

  it('maska: pary z czynnikiem niezwrotowym przechodzą bez korekty (R-1)', () => {
    const rho = Float64Array.of(1, 0.8, 0.4, 0.8, 1, 0.2, 0.4, 0.2, 1);
    const out = inRegimeCorrelation(rho, 3, [1, 1, 1], [1, 1, 1], r, [true, true, false]);
    expect(out.matrix[1]).toBeCloseTo(0.72744, 4);
    expect(out.matrix[2]).toBeCloseTo(0.4, 12);
    expect(out.matrix[5]).toBeCloseTo(0.2, 12);
    expect(out.warnings).toEqual([]);
  });

  it('wejście nie jest modyfikowane', () => {
    const rho = Float64Array.of(1, 0.8, 0.8, 1);
    inRegimeCorrelation(rho, 2, [1, 1], [1, 1], r);
    expect(Array.from(rho)).toEqual([1, 0.8, 0.8, 1]);
  });
});
