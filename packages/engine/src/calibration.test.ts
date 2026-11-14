import { describe, expect, it, vi } from 'vitest';
import { fxPhi } from './models/fx';
import { MarketSimulator } from './models/market';
import { makeScenario } from './testing/fixtures';
import { modelCheck } from './stats/modelCheck';
import type { RiskyAssetParams, Scenario } from './types';

/** Mnożnik σ_m wstrzykiwany przez mock (test „popsutego wejścia”); domyślnie 1 = kod produkcyjny. */
const broken = vi.hoisted(() => ({ factor: 1 }));
vi.mock('./models/regime', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./models/regime')>();
  return { ...orig, sigmaMonthlyFactor: (...a: Parameters<typeof orig.sigmaMonthlyFactor>) => orig.sigmaMonthlyFactor(...a) * broken.factor };
});

const SEED = 20261113;
const PATHS = 20_000;
const BLOCKS = 20;
const YEARS = 10;

function risky(over: Partial<RiskyAssetParams>): RiskyAssetParams {
  return { kind: 'risky', id: 'A', currency: 'PLN', g: 0.065, sigma: 0.16, se: 0, alpha: 1, b: 1, ter: 0, costBps: 0, taxForm: 'none', ...over };
}

/** Tryb realistic, ν = 5, bez niepewności parametrów (makeScenario ma uncertaintyScale 0). */
function build(assets: RiskyAssetParams[], corr: number[], extra: string[] = [], fx: Scenario['market']['fx'] = []): Scenario {
  const base = makeScenario();
  return makeScenario({
    assets,
    market: {
      ...base.market,
      mode: 'realistic',
      nu: 5,
      regime: { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 },
      factorIds: [...assets.map((a) => a.id), ...extra, 'cpi'],
      correlation: corr,
      fx,
    },
  });
}

/** Macierz korelacji z listy górnotrójkątnej (wierszami: (0,1),(0,2),…,(1,2),…). */
function corrMatrix(n: number, upper: number[]): number[] {
  const m = new Array<number>(n * n).fill(0);
  let u = 0;
  for (let i = 0; i < n; i++) {
    m[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) m[i * n + j] = m[j * n + i] = upper[u++]!;
  }
  return m;
}

const mean = (a: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s / a.length;
};
const variance = (a: ArrayLike<number>): number => {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - m) ** 2;
  return s / (a.length - 1);
};
const corr = (x: ArrayLike<number>, y: ArrayLike<number>): number => {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};

/** Statystyka z 20 bloków ścieżek: wartość = średnia z bloków, SE = rozrzut między blokami / √20. */
function blocked(per: (lo: number, hi: number) => number): { v: number; se: number } {
  const vals: number[] = [];
  for (let b = 0; b < BLOCKS; b++) vals.push(per((b * PATHS) / BLOCKS, ((b + 1) * PATHS) / BLOCKS));
  return { v: mean(vals), se: Math.sqrt(variance(vals) / BLOCKS) };
}
function expectWithin(label: string, got: { v: number; se: number }, want: number): void {
  expect(Math.abs(got.v - want), `${label}: ${got.v} vs ${want}, se ${got.se}`).toBeLessThanOrEqual(4 * got.se);
}

/** Roczne log-zwroty [aktywo][rok] jako tablice po ścieżkach (waluta notowania = bazowa). */
function annualReturns(sc: Scenario, years = YEARS): Float64Array[][] {
  const sim = new MarketSimulator(sc);
  const st = sim.newState();
  const nr = sim.riskyIds.length;
  const out = Array.from({ length: nr }, () => Array.from({ length: years }, () => new Float64Array(PATHS)));
  for (let p = 0; p < PATHS; p++) {
    sim.initPath(SEED, p);
    for (let t = 0; t < years * 12; t++) {
      sim.step(t, st);
      for (let i = 0; i < nr; i++) out[i]![Math.floor(t / 12)]![p]! += st.assetLogRet[i]!;
    }
  }
  return out;
}

/** Statystyka w blokach po ścieżkach, łącząc wszystkie lata (n = ścieżki × lata). */
function pooled(ret: Float64Array[][], i: number, stat: (x: Float64Array) => number): { v: number; se: number } {
  return blocked((lo, hi) => {
    const x = new Float64Array((hi - lo) * YEARS);
    ret[i]!.forEach((yr, y) => x.set(yr.subarray(lo, hi), y * (hi - lo)));
    return stat(x);
  });
}

describe('T3: kalibracja całego modelu (realistic, ν = 5, 20 000 ścieżek × 120 mies.)', () => {
  it('jedno aktywo: średnia rocznego log-zwrotu = ln(1,065), wariancja = 0,0256', () => {
    const ret = annualReturns(build([risky({})], corrMatrix(2, [0.1])));
    expectWithin('średnia', pooled(ret, 0, mean), Math.log(1.065));
    expectWithin('wariancja', pooled(ret, 0, variance), 0.0256);
  });

  it('dwa aktywa (σ 0,16 i 0,21, α 1 i 1), ρ = 0,75: korelacja roczna = 0,75', () => {
    const sc = build([risky({ id: 'A' }), risky({ id: 'B', sigma: 0.21 })], corrMatrix(3, [0.75, 0.1, 0.1]));
    expect(new MarketSimulator(sc).warnings.filter((w) => w.code === 'CORR_PROJECTED')).toEqual([]);
    const ret = annualReturns(sc);
    const c = blocked((lo, hi) => {
      const x: number[] = [];
      const y: number[] = [];
      for (let yr = 0; yr < YEARS; yr++) for (let p = lo; p < hi; p++) { x.push(ret[0]![yr]![p]!); y.push(ret[1]![yr]![p]!); }
      return corr(x, y);
    });
    expectWithin('korelacja', c, 0.75);
    expectWithin('wariancja B', pooled(ret, 1, variance), 0.21 * 0.21);
  });

  it('akcje + obligacje (α −0,2, b 0,3, σ 0,06), ρ = 0,1: korelacja roczna 0,1, wariancja obligacji 0,0036', () => {
    const sc = build(
      [risky({ id: 'E' }), risky({ id: 'O', g: 0.04, sigma: 0.06, alpha: -0.2, b: 0.3 })],
      corrMatrix(3, [0.1, 0.05, -0.1]),
    );
    const ret = annualReturns(sc);
    const c = blocked((lo, hi) => {
      const x: number[] = [];
      const y: number[] = [];
      for (let yr = 0; yr < YEARS; yr++) for (let p = lo; p < hi; p++) { x.push(ret[0]![yr]![p]!); y.push(ret[1]![yr]![p]!); }
      return corr(x, y);
    });
    expectWithin('korelacja', c, 0.1);
    expectWithin('wariancja obligacji', pooled(ret, 1, variance), 0.0036);
    expectWithin('średnia obligacji', pooled(ret, 1, mean), Math.log(1.04));
  });

  it('BTC preset bazowy: wariancja roczna w roku 1 i 10 = średnia σ(t)² z 12 miesięcy', () => {
    const btc = risky({
      id: 'BTC', g: 0.15, sigma: 0.5, alpha: 0.6, b: 1, se: 0.06,
      decay: { gInf: 0.055, tauG: 7, sigmaInf: 0.3, tauSigma: 8 },
    });
    const sc = build([btc], corrMatrix(2, [0.1]));
    const sim = new MarketSimulator(sc);
    const ret = annualReturns(sc);
    for (const year of [1, 10]) {
      let want = 0;
      let wantMean = 0;
      for (let t = 12 * (year - 1); t < 12 * year; t++) {
        want += sim.sigmaAt(0, t) ** 2 / 12;
        wantMean += Math.log1p(sim.gAt(0, t)) / 12;
      }
      const yr = ret[0]![year - 1]!;
      expectWithin(`wariancja roku ${year}`, blocked((lo, hi) => variance(yr.subarray(lo, hi))), want);
      expectWithin(`średnia roku ${year}`, blocked((lo, hi) => mean(yr.subarray(lo, hi))), wantMean);
    }
  });

  it('upadek krypto: częstość 1 − e^(−hT) po 10 latach', () => {
    const h = 0.02;
    const sc = build([risky({ id: 'C', collapse: { hazard: h, loss: 0.95 } })], corrMatrix(2, [0]));
    const sim = new MarketSimulator(sc);
    const st = sim.newState();
    const flags = new Float64Array(PATHS);
    for (let p = 0; p < PATHS; p++) {
      sim.initPath(SEED, p);
      for (let t = 0; t < 120; t++) sim.step(t, st);
      flags[p] = st.collapsed[0]!;
    }
    expectWithin('częstość upadku', blocked((lo, hi) => mean(flags.subarray(lo, hi))), 1 - Math.exp(-h * 10));
  });

  it('udział miesięcy kryzysowych = π1 = p01/(p01+p10)', () => {
    const sc = build([risky({})], corrMatrix(2, [0.1]));
    const sim = new MarketSimulator(sc);
    const st = sim.newState();
    const share = new Float64Array(PATHS);
    for (let p = 0; p < PATHS; p++) {
      sim.initPath(SEED, p);
      let k = 0;
      for (let t = 0; t < 120; t++) {
        sim.step(t, st);
        k += st.regime;
      }
      share[p] = k / 120;
    }
    expectWithin('udział kryzysu', blocked((lo, hi) => mean(share.subarray(lo, hi))), 0.04 / 0.24);
  });

  it('aktywo USD + kurs (σ_fx 0,11, ρ −0,3) + inflacja: korelacja SZOKÓW cpi i kursu z aktywem = wpisana (R-1); sd 12-mies. zmiany q = σ_q (R-2)', () => {
    const phiQ = fxPhi(4);
    const sc = build(
      [risky({ id: 'U', currency: 'USD', alpha: 0.6 })],
      // kolejność: U, fx:USD, cpi
      corrMatrix(3, [-0.3, 0.2, 0.05]),
      ['fx:USD'],
      [{ currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: -0.5, foreignInflation: 0.02 }],
    );
    const sim = new MarketSimulator(sc);
    const st = sim.newState();
    const BURN = 240;
    const T = BURN + 12;
    const phiX = sc.market.inflation.phi;
    const m = sc.market.inflation.mean;
    const rU = new Float64Array(PATHS * T);
    const uQ = new Float64Array(PATHS * T);
    const wX = new Float64Array(PATHS * T);
    const calm = new Uint8Array(PATHS * T);
    const dq = new Float64Array(PATHS);
    for (let p = 0; p < PATHS; p++) {
      sim.initPath(SEED, p);
      let qPrev = 0;
      let xPrev = sc.market.inflation.x0;
      let fxPrev = 0;
      let prevRegime = -1;
      let qBurn = 0;
      for (let t = 0; t < T; t++) {
        sim.step(t, st);
        const qNow = st.fxLog[0]! - st.cpiLog + (0.02 * (t + 1)) / 12;
        const k = p * T + t;
        rU[k] = st.assetLogRet[0]! - (st.fxLog[0]! - fxPrev); // zwrot w walucie notowania
        uQ[k] = qNow - phiQ * qPrev;
        wX[k] = st.x - m - phiX * (xPrev - m);
        calm[k] = prevRegime === 0 ? 1 : 0;
        qPrev = qNow;
        xPrev = st.x;
        fxPrev = st.fxLog[0]!;
        prevRegime = st.regime;
        if (t === BURN - 1) qBurn = qNow;
      }
      dq[p] = qPrev - qBurn;
    }
    const shockCorr = (a: Float64Array, b: Float64Array) =>
      blocked((lo, hi) => {
        const x: number[] = [];
        const y: number[] = [];
        for (let k = lo * T; k < hi * T; k++) if (calm[k]) { x.push(a[k]!); y.push(b[k]!); }
        return corr(x, y);
      });
    expectWithin('szoki aktywo-cpi', shockCorr(rU, wX), 0.2);
    expectWithin('szoki aktywo-kurs', shockCorr(rU, uQ), -0.3);
    expectWithin('szoki kurs-cpi', shockCorr(uQ, wX), 0.05);
    // R-2: odchylenie 12-miesięcznej zmiany realnego kursu
    expectWithin('sd Δ12 q', blocked((lo, hi) => Math.sqrt(variance(dq.subarray(lo, hi)))), 0.11);
  });
});

describe('modelCheck (panel „Kontrola modelu”)', () => {
  function reference(): Scenario {
    return build(
      [risky({ id: 'A' }), risky({ id: 'B', currency: 'USD', sigma: 0.2, g: 0.05, alpha: 0.6, b: 0.8 })],
      corrMatrix(4, [0.5, -0.3, 0.2, 0.1, -0.1, 0.05]),
      ['fx:USD'],
      [{ currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: -0.5, foreignInflation: 0.02 }],
    );
  }

  it('scenariusz wzorcowy: wszystkie wiersze ok', () => {
    const rows = modelCheck(reference(), { seed: SEED, paths: PATHS });
    const metrics = new Set(rows.map((r) => r.metric));
    for (const k of ['meanLog', 'vol', 'corr', 'inflationSd', 'crisisShare']) expect(metrics.has(k as never)).toBe(true);
    for (const r of rows) expect(r.ok, `${r.id} ${r.metric}: ${r.simulated} vs ${r.input}, se ${r.se}`).toBe(true);
    // R-1: wiersze z korelacją roczną par z cpi/fx są pokazane
    expect(rows.some((r) => r.id === 'A~cpi (roczna)')).toBe(true);
  });

  it('celowo popsute σ_m (×1,41 przez mock): co najmniej jeden wiersz ok === false', () => {
    broken.factor = 1.41;
    try {
      const rows = modelCheck(reference(), { seed: SEED, paths: 4000 });
      expect(rows.some((r) => !r.ok)).toBe(true);
      expect(rows.some((r) => r.metric === 'vol' && !r.ok)).toBe(true);
    } finally {
      broken.factor = 1;
    }
  });
});
