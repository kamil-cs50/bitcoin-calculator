import { describe, expect, it } from 'vitest';
import { cholesky } from '../linalg/cholesky';
import { normalInv } from '../math/normalInv';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import { makeScenario } from '../testing/fixtures';
import type { RiskyAssetParams } from '../types';
import { MarketSimulator } from './market';
import { drawDriftShifts } from './paramUncertainty';

const SEED = 20261113;

describe('drawDriftShifts', () => {
  const se = Float64Array.from([0.02, 0.03]);
  const chol = cholesky(Float64Array.from([1, 0.7, 0.7, 1]), 2);

  function sample(scale: number, draws: number): { a: number[]; b: number[] } {
    const rng = new Xoshiro128ss();
    rng.reseed(SEED);
    const z = new Float64Array(2);
    const out = new Float64Array(2);
    const a: number[] = [];
    const b: number[] = [];
    for (let k = 0; k < draws; k++) {
      z[0] = normalInv(rng.nextUniform());
      z[1] = normalInv(rng.nextUniform());
      drawDriftShifts(z, se, chol, 2, scale, out);
      a.push(out[0]!);
      b.push(out[1]!);
    }
    return { a, b };
  }

  it('sd i korelacja zgodne z SE i ρ = 0,7 (4 SE)', () => {
    const n = 100_000;
    const { a, b } = sample(1, n);
    const mean = (x: number[]): number => x.reduce((s, v) => s + v, 0) / x.length;
    const ma = mean(a);
    const mb = mean(b);
    let va = 0, vb = 0, cab = 0;
    for (let k = 0; k < n; k++) {
      va += (a[k]! - ma) ** 2;
      vb += (b[k]! - mb) ** 2;
      cab += (a[k]! - ma) * (b[k]! - mb);
    }
    const sa = Math.sqrt(va / (n - 1));
    const sb = Math.sqrt(vb / (n - 1));
    const rho = cab / (n - 1) / (sa * sb);
    expect(Math.abs(sa - 0.02)).toBeLessThan(4 * (0.02 / Math.sqrt(2 * n)));
    expect(Math.abs(sb - 0.03)).toBeLessThan(4 * (0.03 / Math.sqrt(2 * n)));
    expect(Math.abs(rho - 0.7)).toBeLessThan(4 * ((1 - 0.49) / Math.sqrt(n)));
  });

  it('scale = 0 daje same zera', () => {
    const { a, b } = sample(0, 1000);
    expect(a.every((v) => v === 0)).toBe(true);
    expect(b.every((v) => v === 0)).toBe(true);
  });
});

describe('niepewność parametrów w MarketSimulator (T3, gbm)', () => {
  it('g = 0,065, σ = 0,16, SE = 0,02, 30 lat: mediana, średnia i wariancja ln(W_T/W_0)', () => {
    const asset: RiskyAssetParams = {
      kind: 'risky', id: 'globalEquity', currency: 'PLN', g: 0.065, sigma: 0.16, se: 0.02, alpha: 0, b: 1,
      ter: 0, costBps: 0, taxForm: 'none',
    };
    const base = makeScenario({ assets: [asset] });
    const sim = new MarketSimulator({ ...base, market: { ...base.market, uncertaintyScale: 1 } });
    const st = sim.newState();
    const n = 20_000;
    const logs: number[] = [];
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let s = 0;
      for (let t = 0; t < 360; t++) {
        sim.step(t, st);
        s += st.assetLogRet[0]!;
      }
      logs.push(s);
    }
    const m = logs.reduce((s, v) => s + v, 0) / n;
    const v = logs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1);
    const target = 30 * Math.log(1.065);
    const trueVar = 30 * 0.0256 + 900 * 0.0004;
    expect(Math.abs(m - target)).toBeLessThan(4 * Math.sqrt(trueVar / n));
    expect(Math.abs(v - trueVar)).toBeLessThan(4 * trueVar * Math.sqrt(2 / (n - 1)));
    // nieparametryczny 99,99% przedział ufności mediany (rangi dwumianowe, z = 3,891)
    const sorted = [...logs].sort((x, y) => x - y);
    const half = (3.891 * Math.sqrt(n)) / 2;
    const lo = sorted[Math.floor(n / 2 - half)]!;
    const hi = sorted[Math.ceil(n / 2 + half)]!;
    expect(target).toBeGreaterThanOrEqual(lo);
    expect(target).toBeLessThanOrEqual(hi);
  });
});
