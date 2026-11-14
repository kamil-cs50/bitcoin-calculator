import { describe, expect, it } from 'vitest';
import { makeScenario } from '../testing/fixtures';
import type { RiskyAssetParams, Scenario } from '../types';
import { validateScenario } from '../validate';
import { MarketSimulator } from './market';

const DAY_MONTH = 30.44;
const GENESIS = Date.UTC(2009, 0, 3);
const SEED = 20261113;

function btc(over: Partial<RiskyAssetParams> = {}): RiskyAssetParams {
  return {
    kind: 'risky', id: 'btc', currency: 'PLN', g: 0.15, sigma: 0.5, se: 0, alpha: 0, b: 1, ter: 0, costBps: 0, taxForm: 'crypto',
    decay: { gInf: 0.055, tauG: 7, sigmaInf: 0.3, tauSigma: 8 },
    collapse: { hazard: 0.01, loss: 0.95 },
    ...over,
  };
}
function scen(over: Partial<RiskyAssetParams> = {}): Scenario {
  const base = makeScenario();
  return makeScenario({ assets: [btc(over)], positions: [], market: { ...base.market, factorIds: ['btc', 'cpi'], uncertaintyScale: 0 } });
}
const PL = { a: 1, b: 2.5, genesis: '2009-01-03' as const };
const d0 = (Date.UTC(2026, 0, 1) - GENESIS) / 86_400_000; // startYear 2026, startMonth 1

describe('nakładka potęgowa BTC', () => {
  it('gAt odpowiada przyrostowi b·ln((d+30,44)/d) na miesiąc', () => {
    const sim = new MarketSimulator(scen({ powerLaw: PL }));
    for (const t of [0, 1, 12, 100]) {
      const d = d0 + t * DAY_MONTH;
      const inc = PL.b * Math.log((d + DAY_MONTH) / d);
      expect(Math.log1p(sim.gAt(0, t)) / 12).toBeCloseTo(inc, 12);
    }
  });

  it('log-zwrot kroku ma dryf z nakładki, a σ i upadek bez zmian', () => {
    const on = new MarketSimulator(scen({ powerLaw: PL }));
    const off = new MarketSimulator(scen());
    const so = on.newState();
    const sf = off.newState();
    on.initPath(SEED, 3);
    off.initPath(SEED, 3);
    for (const t of [0, 5, 40]) {
      on.step(t, so);
      off.step(t, sf);
      const d = d0 + t * DAY_MONTH;
      const inc = PL.b * Math.log((d + DAY_MONTH) / d);
      const decayDrift = Math.log1p(off.gAt(0, t)) / 12;
      // te same strumienie: różnica = różnica dryfów (zmienność i upadek identyczne)
      expect(so.assetLogRet[0]! - sf.assetLogRet[0]!).toBeCloseTo(inc - decayDrift, 12);
      expect(so.collapsed[0]).toBe(sf.collapsed[0]);
    }
    expect(on.sigmaAt(0, 24)).toBe(off.sigmaAt(0, 24));
  });

  it('po upadku dryf jest wyłączony także przy nakładce', () => {
    const collapse = { hazard: 1e9, loss: 0.95 };
    const on = new MarketSimulator(scen({ powerLaw: PL, collapse }));
    const ref = new MarketSimulator(scen({ collapse }));
    const so = on.newState();
    const sr = ref.newState();
    on.initPath(SEED, 0);
    ref.initPath(SEED, 0);
    on.step(0, so);
    ref.step(0, sr);
    expect(so.collapsed[0]).toBe(1);
    on.step(1, so);
    ref.step(1, sr);
    expect(so.assetLogRet[0]).toBeCloseTo(sr.assetLogRet[0]!, 12);
  });

  it('domyślny scenariusz i aktywa z fixtures nie mają powerLaw', () => {
    for (const a of makeScenario().assets) expect((a as { powerLaw?: unknown }).powerLaw).toBeUndefined();
  });

  it('walidacja: a i b muszą być skończone, genesis stały', () => {
    const v = validateScenario(scen({ powerLaw: PL }));
    expect(v.ok, JSON.stringify(v)).toBe(true);
    expect(validateScenario(scen({ powerLaw: { ...PL, b: NaN } })).ok).toBe(false);
    expect(validateScenario(scen({ powerLaw: { ...PL, a: Infinity } })).ok).toBe(false);
    expect(validateScenario(scen({ powerLaw: { ...PL, genesis: '2010-01-01' as never } })).ok).toBe(false);
  });
});
