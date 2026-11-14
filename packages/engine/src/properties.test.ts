import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runBatch } from './runner';
import { makeScenario } from './testing/fixtures';
import type { Scenario } from './types';

/** Ziarno fast-check i ziarno symulacji są częścią testu (spec 9). */
const FC = { numRuns: 30, seed: 20261113 } as const;
const SIM_SEED = 7;
const PATHS = 200;

const finalWealth = (s: Scenario): Float32Array => {
  const r = runBatch(s, { seed: SIM_SEED, paths: PATHS });
  const G = r.grid.length;
  return Float32Array.from({ length: r.paths }, (_, p) => r.wealth[p * G + G - 1]!);
};

const base = (over: Partial<Scenario> = {}): Scenario =>
  makeScenario({ horizonMonths: 120, tax: { kind: 'none' }, rebalance: { kind: 'none' }, ...over });

describe('własności (T7, CRN)', () => {
  it('większa wypłata nie zwiększa majątku końcowego na żadnej ścieżce', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1500 }),
        fc.integer({ min: 1, max: 1500 }),
        fc.integer({ min: 0, max: 60 }),
        (w1, dw, startMonth) => {
          const lo = finalWealth(base({ withdrawal: { kind: 'fixedReal', startMonth, monthly: w1 } }));
          const hi = finalWealth(base({ withdrawal: { kind: 'fixedReal', startMonth, monthly: w1 + dw } }));
          for (let p = 0; p < PATHS; p++) expect(hi[p]!).toBeLessThanOrEqual(lo[p]! * (1 + 1e-6) + 1e-3);
        },
      ),
      FC,
    );
  });

  it('większa wpłata nie zmniejsza majątku końcowego na żadnej ścieżce', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 1, max: 3000 }),
        fc.constantFrom('none', 'cpi', 'cpiPlus'),
        (c1, dc, indexation) => {
          const mk = (monthly: number): Scenario =>
            base({ contribution: { monthly, endMonth: 120, indexation, realGrowth: 0.02 } });
          const lo = finalWealth(mk(c1));
          const hi = finalWealth(mk(c1 + dc));
          for (let p = 0; p < PATHS; p++) expect(hi[p]!).toBeGreaterThanOrEqual(lo[p]! * (1 - 1e-6) - 1e-3);
        },
      ),
      FC,
    );
  });

  it('dodanie aktywa o wartości 0 i wadze 0 nie zmienia majątku', () => {
    const s0 = base({ contribution: { monthly: 500, endMonth: 120, indexation: 'none', realGrowth: 0 } });
    const extra = {
      kind: 'risky' as const, id: 'extra', currency: 'PLN' as const, g: 0.1, sigma: 0.3, se: 0, alpha: 0, b: 1,
      ter: 0, costBps: 0, taxForm: 'none' as const,
    };
    const s1: Scenario = {
      ...s0,
      assets: [...s0.assets, extra],
      positions: [...s0.positions, { assetId: 'extra', wrapper: 'taxable', value: 0, costBasis: 0, targetWeight: 0 }],
      market: { ...s0.market, factorIds: ['globalEquity', 'extra', 'cpi'], correlation: [1, 0, 0.1, 0, 1, 0, 0.1, 0, 1] },
    };
    const a = runBatch(s0, { seed: SIM_SEED, paths: PATHS });
    const b = runBatch(s1, { seed: SIM_SEED, paths: PATHS });
    expect(Array.from(b.wealth)).toEqual(Array.from(a.wealth));
  });

  it('stały procent (stawka <= 0,2) nigdy nie powoduje ruiny', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 0.2, noNaN: true }), fc.integer({ min: 0, max: 24 }), (rate, startMonth) => {
        const r = runBatch(base({ withdrawal: { kind: 'percent', startMonth, rate } }), { seed: SIM_SEED, paths: PATHS });
        for (let p = 0; p < PATHS; p++) expect(r.ruinMonth[p]).toBe(-1);
      }),
      FC,
    );
  });

  it('wynik jest skończony i nieujemny dla losowych parametrów rynku', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.5, max: 0.3, noNaN: true }),
        fc.double({ min: 0, max: 0.8, noNaN: true }),
        fc.constantFrom<'gbm' | 'realistic'>('gbm', 'realistic'),
        (g, sigma, mode) => {
          const s = base();
          const s2: Scenario = {
            ...s,
            assets: [{ ...(s.assets[0] as Scenario['assets'][0] & { kind: 'risky' }), g, sigma }],
            market: { ...s.market, mode },
          };
          const w = finalWealth(s2);
          for (let p = 0; p < PATHS; p++) {
            expect(Number.isFinite(w[p]!)).toBe(true);
            expect(w[p]!).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      FC,
    );
  });
});
