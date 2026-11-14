import { describe, expect, it } from 'vitest';
import { makeScenario } from '../testing/fixtures';
import { fxPhi } from './fx';
import { MarketSimulator } from './market';
import type { RiskyAssetParams, Scenario } from '../types';

const SEED = 20261113;

function risky(over: Partial<RiskyAssetParams>): RiskyAssetParams {
  return {
    kind: 'risky', id: 'A', currency: 'PLN', g: 0.06, sigma: 0.16, se: 0, alpha: 0, b: 1,
    ter: 0, costBps: 0, taxForm: 'none', ...over,
  };
}

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
function variance(a: number[]): number {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
}

/** Czynniki: A, B (PLN), fx:USD, cpi; α, b ≠ 0, tryb realistic (reżim + ogony t). */
const RHO = {
  AB: 0.5, Acpi: 0.2, Bcpi: -0.1, Afx: -0.3, Bfx: 0.1, fxcpi: 0.05,
};
function scenario(fxOver: Partial<Scenario['market']['fx'][number]> = {}): Scenario {
  const base = makeScenario();
  const r = RHO;
  // kolejność: A, B, fx:USD, cpi
  const corr = [
    1, r.AB, r.Afx, r.Acpi,
    r.AB, 1, r.Bfx, r.Bcpi,
    r.Afx, r.Bfx, 1, r.fxcpi,
    r.Acpi, r.Bcpi, r.fxcpi, 1,
  ];
  return makeScenario({
    assets: [
      risky({ id: 'A', sigma: 0.16, alpha: 1, b: 1 }),
      risky({ id: 'B', sigma: 0.2, alpha: 0.5, b: 0.5, g: 0.04 }),
    ],
    market: {
      ...base.market,
      mode: 'realistic',
      nu: 5,
      regime: { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 },
      factorIds: ['A', 'B', 'fx:USD', 'cpi'],
      correlation: corr,
      fx: [{ currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: 0.3, foreignInflation: 0.02, ...fxOver }],
    },
  });
}

describe('[Z-7] kowariancja i korelacje w symulacji (tryb realistic, α, b ≠ 0)', () => {
  it('bez ostrzeżenia CORR_PROJECTED dla macierzy testowej', () => {
    expect(new MarketSimulator(scenario()).warnings.filter((w) => w.code === 'CORR_PROJECTED')).toEqual([]);
  });

  it('kowariancja rocznych log-zwrotów A i B = σ_A σ_B ρ_AB (4 SE)', () => {
    const sim = new MarketSimulator(scenario());
    const st = sim.newState();
    const n = 40_000;
    const a: number[] = [];
    const b: number[] = [];
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let sa = 0;
      let sb = 0;
      for (let t = 0; t < 12; t++) {
        sim.step(t, st);
        sa += st.assetLogRet[0]!;
        sb += st.assetLogRet[1]!;
      }
      a.push(sa);
      b.push(sb);
    }
    const ma = mean(a);
    const mb = mean(b);
    const prod = a.map((x, i) => (x - ma) * (b[i]! - mb));
    const cov = mean(prod);
    const se = Math.sqrt(variance(prod) / n);
    expect(Math.abs(cov - 0.16 * 0.2 * RHO.AB)).toBeLessThan(4 * se);
    // wariancje brzegowe też zgodne z σ² (4 SE), by kowariancja nie przeszła przypadkiem
    for (const [xs, sg] of [[a, 0.16], [b, 0.2]] as const) {
      const m = mean(xs);
      const sq = xs.map((x) => (x - m) * (x - m));
      expect(Math.abs(mean(sq) - sg * sg)).toBeLessThan(4 * Math.sqrt(variance(sq) / n));
    }
  });

  /** Korelacja szoków w miesiącach o ustalonym stanie reżimu s_t (δ_s stałe w podpróbie), z błędem z 20 partii. */
  function shockCorrelations(): Record<string, { calm: [number, number]; crisis: [number, number] }> {
    const sc = scenario();
    const sim = new MarketSimulator(sc);
    const st = sim.newState();
    const phi = fxPhi(4);
    const n = 20_000;
    const T = 36;
    type Row = [number, number, number, number]; // rA, rB, innowacja q, szok inflacji x
    const calm: Row[] = [];
    const crisis: Row[] = [];
    const m = sc.market.inflation.mean;
    const phiX = sc.market.inflation.phi;
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let prevRegime = -1;
      let q = 0;
      let x = sc.market.inflation.x0;
      for (let t = 0; t < T; t++) {
        sim.step(t, st);
        const qNow = st.fxLog[0]! - st.cpiLog + (0.02 * (t + 1)) / 12;
        const row: Row = [st.assetLogRet[0]!, st.assetLogRet[1]!, qNow - phi * q, st.x - m - phiX * (x - m)];
        if (prevRegime === 0) calm.push(row);
        else if (prevRegime === 1) crisis.push(row);
        prevRegime = st.regime;
        q = qNow;
        x = st.x;
      }
    }
    const corr = (rows: Row[], i: number, j: number): [number, number] => {
      const parts = 20;
      const size = Math.floor(rows.length / parts);
      const cs: number[] = [];
      for (let k = 0; k < parts; k++) {
        const sl = rows.slice(k * size, (k + 1) * size);
        const xi = sl.map((r) => r[i]!);
        const xj = sl.map((r) => r[j]!);
        const mi = mean(xi);
        const mj = mean(xj);
        let sij = 0;
        let sii = 0;
        let sjj = 0;
        for (let u = 0; u < sl.length; u++) {
          sij += (xi[u]! - mi) * (xj[u]! - mj);
          sii += (xi[u]! - mi) ** 2;
          sjj += (xj[u]! - mj) ** 2;
        }
        cs.push(sij / Math.sqrt(sii * sjj));
      }
      return [mean(cs), Math.sqrt(variance(cs) / parts)];
    };
    return {
      'A-cpi': { calm: corr(calm, 0, 3), crisis: corr(crisis, 0, 3) },
      'B-cpi': { calm: corr(calm, 1, 3), crisis: corr(crisis, 1, 3) },
      'A-fx': { calm: corr(calm, 0, 2), crisis: corr(crisis, 0, 2) },
      'B-fx': { calm: corr(calm, 1, 2), crisis: corr(crisis, 1, 2) },
      'fx-cpi': { calm: corr(calm, 2, 3), crisis: corr(crisis, 2, 3) },
    };
  }

  it('R-1: korelacja szoków dla par z cpi/fx = wpisane ρ (bez korekty R̃), w obu reżimach (4 SE)', () => {
    const res = shockCorrelations();
    const want: Record<string, number> = {
      'A-cpi': RHO.Acpi, 'B-cpi': RHO.Bcpi, 'A-fx': RHO.Afx, 'B-fx': RHO.Bfx, 'fx-cpi': RHO.fxcpi,
    };
    for (const [pair, r] of Object.entries(res)) {
      for (const state of ['calm', 'crisis'] as const) {
        const [c, se] = r[state];
        expect(Math.abs(c - want[pair]!), `${pair} ${state}: ${c} vs ${want[pair]}, se ${se}`).toBeLessThan(4 * se);
      }
    }
  });

  it('R-2: sd stacjonarnej 12-mies. zmiany realnego kursu q w symulacji (reżim, α_q ≠ 0) ≈ σ_q (4 SE)', () => {
    const sc = scenario();
    const sim = new MarketSimulator(sc);
    const st = sim.newState();
    const n = 20_000;
    const BURN = 240; // 5 półokresów H = 4 lata
    const sigmaQ = 0.11;
    const d: number[] = [];
    const qAt = (t: number): number => st.fxLog[0]! - st.cpiLog + (0.02 * (t + 1)) / 12;
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let q0 = 0;
      for (let t = 0; t < BURN + 12; t++) {
        sim.step(t, st);
        if (t === BURN - 1) q0 = qAt(t);
      }
      d.push(qAt(BURN + 11) - q0);
    }
    const m = mean(d);
    const sq = d.map((v) => (v - m) * (v - m));
    const v = mean(sq);
    const se = Math.sqrt(variance(sq) / n);
    // eslint-disable-next-line no-console
    console.log('R-2 sim: sd =', Math.sqrt(v), 'cel σ_q =', sigmaQ, 'różnica wariancji / SE =', (v - sigmaQ * sigmaQ) / se);
    expect(Math.abs(v - sigmaQ * sigmaQ)).toBeLessThan(4 * se);
  });
});
