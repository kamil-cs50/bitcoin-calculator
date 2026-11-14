import { describe, expect, it } from 'vitest';
import { makeScenario } from '../testing/fixtures';
import type { FxProcessLike } from './market';
import { MarketSimulator } from './market';
import type { FxParams, RiskyAssetParams, Scenario } from '../types';

const SEED = 20261113;

function asset(over: Partial<RiskyAssetParams> = {}): RiskyAssetParams {
  return {
    kind: 'risky', id: 'globalEquity', currency: 'PLN', g: 0.065, sigma: 0.16, se: 0.02, alpha: 0, b: 1,
    ter: 0, costBps: 0, taxForm: 'none', ...over,
  };
}

function oneAsset(over: Partial<RiskyAssetParams> = {}, sc: Partial<Scenario> = {}): Scenario {
  return makeScenario({ assets: [asset(over)], ...sc });
}

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
function variance(a: number[]): number {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
}

describe('MarketSimulator: gbm', () => {
  it('suma log-zwrotów 10 lat: średnia 10·ln(1.065), wariancja 10·σ² (4 SE)', () => {
    const sim = new MarketSimulator(oneAsset());
    const st = sim.newState();
    const n = 20_000;
    const sums: number[] = [];
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let s = 0;
      for (let t = 0; t < 120; t++) {
        sim.step(t, st);
        s += st.assetLogRet[0]!;
      }
      sums.push(s);
    }
    const m = mean(sums);
    const v = variance(sums);
    const seMean = Math.sqrt(0.256 / n);
    expect(Math.abs(m - 10 * Math.log(1.065))).toBeLessThan(4 * seMean);
    const seVar = 0.256 * Math.sqrt(2 / (n - 1));
    expect(Math.abs(v - 0.256)).toBeLessThan(4 * seVar);
  });

  it('drugie aktywo nieskorelowane nie zmienia assetLogRet[0]', () => {
    const second: RiskyAssetParams = asset({ id: 'other', g: 0.03, sigma: 0.1 });
    const base = oneAsset();
    const two = makeScenario({
      assets: [asset(), second],
      market: {
        ...base.market,
        factorIds: ['globalEquity', 'other', 'cpi'],
        correlation: [1, 0, 0.1, 0, 1, 0, 0.1, 0, 1],
      },
    });
    // cpi skorelowane z aktywem 0 w obu: wersja 1-aktywowa ma korelację 0,1; w 2-aktywowej też, z aktywem 'other' 0
    const a = new MarketSimulator(base);
    const b = new MarketSimulator(two);
    const sa = a.newState();
    const sb = b.newState();
    for (let p = 0; p < 100; p++) {
      a.initPath(SEED, p);
      b.initPath(SEED, p);
      for (let t = 0; t < 24; t++) {
        a.step(t, sa);
        b.step(t, sb);
        expect(sb.assetLogRet[0]).toBeCloseTo(sa.assetLogRet[0]!, 12);
      }
    }
  });

  it('CRN: dodanie drugiego aktywa przy uncertaintyScale = 1 nie zmienia inflacji ani aktywa 0', () => {
    const base0 = oneAsset();
    const base = { ...base0, market: { ...base0.market, uncertaintyScale: 1 } };
    const two = makeScenario({
      assets: [asset(), asset({ id: 'other', g: 0.03, sigma: 0.1 })],
      market: {
        ...base.market,
        factorIds: ['globalEquity', 'other', 'cpi'],
        correlation: [1, 0, 0.1, 0, 1, 0, 0.1, 0, 1],
      },
    });
    const a = new MarketSimulator(base);
    const b = new MarketSimulator(two);
    const sa = a.newState();
    const sb = b.newState();
    for (let p = 0; p < 50; p++) {
      a.initPath(SEED, p);
      b.initPath(SEED, p);
      for (let t = 0; t < 24; t++) {
        a.step(t, sa);
        b.step(t, sb);
        expect(sb.cpiLog).toBeCloseTo(sa.cpiLog, 12);
        expect(sb.assetLogRet[0]).toBeCloseTo(sa.assetLogRet[0]!, 12);
      }
    }
  });

  it('determinizm: initPath(seed, 5) po initPath(seed, 9) = bez wcześniejszych ścieżek', () => {
    const sc = oneAsset({ collapse: { hazard: 0.3, loss: 0.5 } }, { market: { ...makeScenario().market, mode: 'realistic', nu: 5 } });
    const run = (sim: MarketSimulator): number[] => {
      const st = sim.newState();
      const out: number[] = [];
      for (let t = 0; t < 36; t++) {
        sim.step(t, st);
        out.push(st.assetLogRet[0]!, st.regime, st.cpiLog, st.collapsed[0]!);
      }
      return out;
    };
    const fresh = new MarketSimulator(sc);
    fresh.initPath(SEED, 5);
    const a = run(fresh);
    const used = new MarketSimulator(sc);
    used.initPath(SEED, 9);
    run(used);
    used.initPath(SEED, 5);
    expect(run(used)).toEqual(a);
  });
});

describe('MarketSimulator: reżim', () => {
  const realistic = (over: Partial<RiskyAssetParams> = {}): Scenario => {
    const base = oneAsset({ alpha: 1, b: 1, ...over });
    return {
      ...base,
      market: {
        ...base.market,
        mode: 'realistic',
        nu: 5,
        regime: { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 },
      },
    };
  };

  it('udział miesięcy kryzysu = 1/6 (4 SE)', () => {
    const sim = new MarketSimulator(realistic());
    const st = sim.newState();
    const n = 20_000;
    const shares: number[] = [];
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let c = 0;
      for (let t = 0; t < 120; t++) {
        sim.step(t, st);
        c += st.regime;
      }
      shares.push(c / 120);
    }
    const se = Math.sqrt(variance(shares) / n);
    expect(Math.abs(mean(shares) - 1 / 6)).toBeLessThan(4 * se);
  });

  it('kalibracja roczna: średnia 12μ i odchylenie σ rocznego log-zwrotu (4 SE)', () => {
    const sim = new MarketSimulator(realistic());
    const st = sim.newState();
    const n = 40_000;
    const ann: number[] = [];
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      let s = 0;
      for (let t = 0; t < 12; t++) {
        sim.step(t, st);
        s += st.assetLogRet[0]!;
      }
      ann.push(s);
    }
    const m = mean(ann);
    const mu = Math.log(1.065);
    expect(Math.abs(m - mu)).toBeLessThan(4 * Math.sqrt(variance(ann) / n));
    const sq = ann.map((v) => (v - m) * (v - m));
    const v = mean(sq);
    const seV = Math.sqrt(variance(sq) / n);
    expect(Math.abs(v - 0.16 * 0.16)).toBeLessThan(4 * seV);
  });

  it('gbm: regime zawsze 0', () => {
    const sim = new MarketSimulator(oneAsset());
    const st = sim.newState();
    sim.initPath(SEED, 0);
    for (let t = 0; t < 600; t++) {
      sim.step(t, st);
      expect(st.regime).toBe(0);
    }
  });
});

describe('MarketSimulator: zanik g i σ', () => {
  const btc = asset({
    id: 'btc', g: 0.15, sigma: 0.5, se: 0.06, alpha: 0.6, b: 1,
    decay: { gInf: 0.055, tauG: 7, sigmaInf: 0.3, tauSigma: 8 },
    collapse: { hazard: 0.01, loss: 0.95 },
  });
  const sc = makeScenario({
    assets: [btc],
    market: { ...makeScenario().market, factorIds: ['btc', 'cpi'] },
  });

  it('gAt i sigmaAt wg presetu btcBase', () => {
    const sim = new MarketSimulator(sc);
    expect(sim.gAt(0, 0)).toBeCloseTo(0.15, 14);
    expect(sim.gAt(0, 84)).toBeCloseTo(0.055 + 0.095 * Math.exp(-1), 14);
    expect(sim.sigmaAt(0, 0)).toBeCloseTo(0.5, 14);
    expect(sim.sigmaAt(0, 96)).toBeCloseTo(0.3 + 0.2 * Math.exp(-1), 14);
    expect(sim.riskyIds).toEqual(['btc']);
  });
});

describe('MarketSimulator: step stosuje zanik g(t) i σ(t)', () => {
  const decay = { gInf: 0.04, tauG: 5, sigmaInf: 0.2, tauSigma: 4 };

  it('σ = 0: suma log-zwrotów = Σ ln(1+g(t))/12 z g(t) = g∞ + (g0 − g∞)e^{−t/(12τ)}', () => {
    const sim = new MarketSimulator(oneAsset({ g: 0.12, sigma: 0, decay: { ...decay, sigmaInf: 0 } }));
    const st = sim.newState();
    sim.initPath(SEED, 0);
    let s = 0;
    let expected = 0;
    for (let t = 0; t < 84; t++) {
      sim.step(t, st);
      s += st.assetLogRet[0]!;
      expected += Math.log1p(0.04 + (0.12 - 0.04) * Math.exp(-t / 12 / 5)) / 12;
    }
    expect(s).toBeCloseTo(expected, 12);
    expect(Math.abs(s - (84 * Math.log1p(0.12)) / 12)).toBeGreaterThan(0.01); // zanik jest istotny
  });

  it('wariancja miesięcznego log-zwrotu w kroku t = σ(t)²/12 (t = 0 i t = 96, 4 SE)', () => {
    const a = asset({ g: 0.05, sigma: 0.5, decay: { ...decay, gInf: 0.05 } });
    const sim = new MarketSimulator(makeScenario({ assets: [a] }));
    const st = sim.newState();
    const n = 40_000;
    const at0: number[] = [];
    const at96: number[] = [];
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      for (let t = 0; t <= 96; t++) {
        sim.step(t, st);
        if (t === 0) at0.push(st.assetLogRet[0]!);
        if (t === 96) at96.push(st.assetLogRet[0]!);
      }
    }
    const check = (xs: number[], sigma: number): void => {
      const v = (sigma * sigma) / 12;
      expect(Math.abs(variance(xs) - v)).toBeLessThan(4 * v * Math.sqrt(2 / (n - 1)));
    };
    check(at0, 0.5);
    check(at96, 0.2 + 0.3 * Math.exp(-96 / 12 / 4));
  });
});

describe('MarketSimulator: upadek', () => {
  it('częstość upadku = 1 − e^{−0,3} po 360 miesiącach (4 SE)', () => {
    const sim = new MarketSimulator(oneAsset({ collapse: { hazard: 0.01, loss: 0.95 } }));
    const st = sim.newState();
    const n = 20_000;
    let hit = 0;
    for (let p = 0; p < n; p++) {
      sim.initPath(SEED, p);
      for (let t = 0; t < 360; t++) sim.step(t, st);
      hit += st.collapsed[0]!;
    }
    const pExp = 1 - Math.exp(-0.3);
    const se = Math.sqrt((pExp * (1 - pExp)) / n);
    expect(Math.abs(hit / n - pExp)).toBeLessThan(4 * se);
  });

  it('miesiąc upadku zawiera ln(0,05), potem dryf = 0 (σ = 0, dokładnie)', () => {
    const sim = new MarketSimulator(oneAsset({ sigma: 0, g: 0.1, collapse: { hazard: 3, loss: 0.95 } }));
    const st = sim.newState();
    const mu = Math.log(1.1) / 12;
    let sawCollapse = 0;
    for (let p = 0; p < 50; p++) {
      sim.initPath(SEED, p);
      let was = 0;
      for (let t = 0; t < 120; t++) {
        sim.step(t, st);
        const r = st.assetLogRet[0]!;
        if (was === 0 && st.collapsed[0] === 1) {
          expect(r).toBeCloseTo(mu + Math.log(0.05), 12);
          sawCollapse++;
        } else if (was === 1) {
          expect(r).toBe(0);
          expect(st.collapsed[0]).toBe(1);
        } else {
          expect(r).toBeCloseTo(mu, 12);
        }
        was = st.collapsed[0]!;
      }
    }
    expect(sawCollapse).toBeGreaterThan(40);
  });
});

describe('MarketSimulator: waluty i inflacja (wtrącone procesy)', () => {
  it('przekazuje szok, przesunięcie reżimowe i ΔlogRate do zwrotu w PLN', () => {
    const calls: { shock: number; regimeShift: number; cpi: number; t: number }[] = [];
    class RecFx implements FxProcessLike {
      q = 0;
      logRate = 0;
      init(): void {
        this.q = 0;
        this.logRate = 0;
      }
      step(shock: number, regimeShift: number, cpiLogDomestic: number, t: number): void {
        calls.push({ shock, regimeShift, cpi: cpiLogDomestic, t });
        this.logRate += 0.01;
      }
    }
    const fx: FxParams = { currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: 0, foreignInflation: 0.02 };
    const base = oneAsset({ currency: 'USD', sigma: 0, g: 0 });
    const sc: Scenario = {
      ...base,
      market: { ...base.market, factorIds: ['globalEquity', 'fx:USD', 'cpi'], correlation: [1, 0, 0.1, 0, 1, 0, 0.1, 0, 1], fx: [fx] },
    };
    const sim = new MarketSimulator(sc, {
      inflation: (p) => ({ x: p.x0, cpiLog: 0, init() {}, step() {}, yy: () => 0.035 }),
      fx: () => new RecFx(),
    });
    const st = sim.newState();
    sim.initPath(SEED, 0);
    sim.step(0, st);
    sim.step(1, st);
    expect(calls.map((c) => c.t)).toEqual([0, 1]);
    expect(st.assetLogRet[0]).toBeCloseTo(0.01, 12); // σ = 0, g = 0: tylko ΔlogRate
    expect(st.fxLog[0]).toBeCloseTo(0.02, 12);
    expect(st.yy).toBe(0.035);
    expect(Number.isFinite(calls[0]!.shock)).toBe(true);
  });

  it('korelacja ρ = 1 między aktywami nie daje NaN', () => {
    const base = oneAsset();
    const sc = makeScenario({
      assets: [asset(), asset({ id: 'dup' })],
      market: { ...base.market, factorIds: ['globalEquity', 'dup', 'cpi'], correlation: [1, 1, 0, 1, 1, 0, 0, 0, 1] },
    });
    const sim = new MarketSimulator(sc);
    const st = sim.newState();
    sim.initPath(SEED, 1);
    for (let t = 0; t < 12; t++) {
      sim.step(t, st);
      expect(Number.isFinite(st.assetLogRet[0]! + st.assetLogRet[1]!)).toBe(true);
    }
  });
});
