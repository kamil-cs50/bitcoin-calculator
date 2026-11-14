import { describe, expect, it } from 'vitest';
import { normalInv } from '../math/normalInv';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import type { FxParams } from '../types';
import { effectiveVol, fxMonthlySigma, fxPhi, FxProcess } from './fx';
import { regimeConstants } from './regime';

const P: FxParams = { currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: 0, foreignInflation: 0.025 };

describe('fxPhi i effectiveVol', () => {
  it('φ_q = 2^(−1/(12H))', () => {
    expect(fxPhi(4)).toBeCloseTo(0.985663, 6);
    expect(fxPhi(4) ** 48).toBeCloseTo(0.5, 12);
  });
  it('zmienność efektywna w PLN', () => {
    expect(effectiveVol(0.16, 0.11, -0.3)).toBeCloseTo(Math.sqrt(0.0256 + 0.0121 - 2 * 0.3 * 0.16 * 0.11), 12);
  });
});

describe('FxProcess', () => {
  it('zerowe szoki: logRate po t miesiącach = cpi − π^F·t/12, q = 0', () => {
    const f = new FxProcess(P, 0.03);
    f.init();
    let cpi = 0;
    for (let t = 0; t < 60; t++) {
      cpi += 0.003;
      f.step(0, 0, cpi, t);
      expect(f.q).toBe(0);
      expect(f.logRate).toBeCloseTo(cpi - (P.foreignInflation * (t + 1)) / 12, 14);
    }
  });

  it('stacjonarna wariancja q i autokorelacja lag 48 = 0,5 (2000 ścieżek × 1200 mies.)', () => {
    const sm = 0.11 / Math.sqrt(12);
    const phi = fxPhi(4);
    const N = 2000;
    const T = 1200;
    const rng = Xoshiro128ss.fromSeed(20261113);
    const f = new FxProcess(P, sm);
    let s2 = 0;
    let sLag = 0;
    for (let i = 0; i < N; i++) {
      f.init();
      let qLag = 0;
      for (let t = 0; t < T; t++) {
        if (t === T - 48) qLag = f.q;
        f.step(normalInv(rng.nextUniform()), 0, 0, t);
      }
      s2 += f.q * f.q;
      sLag += f.q * qLag;
    }
    const v = (sm * sm) / (1 - phi * phi);
    const varHat = s2 / N;
    expect(Math.abs(varHat - v)).toBeLessThan(4 * v * Math.sqrt(2 / N));
    const rho = 0.5;
    expect(Math.abs(sLag / s2 - rho)).toBeLessThan((4 * (1 - rho * rho)) / Math.sqrt(N));
  });

  it('przesunięcie reżimowe dodaje się do q', () => {
    const f = new FxProcess(P, 0.03);
    f.init();
    f.step(0, 0.07, 0, 0);
    expect(f.q).toBeCloseTo(0.07, 14);
  });
});

describe('fxMonthlySigma (R-2)', () => {
  it('gbm bez reżimu: sd stacjonarnej 12-mies. zmiany ln q = σ', () => {
    const r = { p01: 0, p10: 0.2, kappa1: 1, delta: 0 };
    const c = regimeConstants(r);
    const phi = fxPhi(4);
    const sm = fxMonthlySigma(P, 0, r, c);
    const v = (sm * sm) / (1 - phi * phi);
    expect(Math.sqrt(2 * v * (1 - phi ** 12))).toBeCloseTo(0.11, 12);
  });
});

describe('T3: zmienność efektywna aktywa w USD przeliczonego na PLN (gbm, 12 mies.)', () => {
  it('sd rocznego log-zwrotu w PLN = effectiveVol z σ_fx12 i ρ12 liczonymi analitycznie', () => {
    const rho = -0.3;
    const sigA = 0.16;
    const sa = sigA / Math.sqrt(12);
    const sm = fxMonthlySigma(P, 0, { p01: 0, p10: 0.2, kappa1: 1, delta: 0 }, regimeConstants({ p01: 0, p10: 0.2, kappa1: 1, delta: 0 }));
    const phi = fxPhi(4);
    const varQ = (sm * sm * (1 - phi ** 24)) / (1 - phi * phi);
    const sigFx12 = Math.sqrt(varQ);
    const cov = rho * sa * sm * ((1 - phi ** 12) / (1 - phi));
    const rho12 = cov / (sigA * sigFx12);
    const expected = effectiveVol(sigA, sigFx12, rho12);

    const N = 50000;
    const rng = Xoshiro128ss.fromSeed(31337);
    const f = new FxProcess(P, sm);
    const w = Math.sqrt(1 - rho * rho);
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < N; i++) {
      f.init();
      let ra = 0;
      for (let t = 0; t < 12; t++) {
        const z1 = normalInv(rng.nextUniform());
        const z2 = normalInv(rng.nextUniform());
        ra += sa * z1;
        f.step(rho * z1 + w * z2, 0, 0, t);
      }
      const r = ra + (f.logRate + (P.foreignInflation * 12) / 12); // bez deterministycznego −π^F
      sum += r;
      sum2 += r * r;
    }
    const mean = sum / N;
    const sd = Math.sqrt(sum2 / N - mean * mean);
    expect(Math.abs(sd - expected)).toBeLessThan(4 * (expected / Math.sqrt(2 * N)));
  });
});
