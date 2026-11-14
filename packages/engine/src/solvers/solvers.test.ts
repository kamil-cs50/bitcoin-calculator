import { describe, expect, it } from 'vitest';
import { pmt } from '../math/pmt';
import { makeScenario } from '../testing/fixtures';
import type { RiskyAssetParams, Scenario } from '../types';
import { bisectAmount } from './bisect';
import { countNoRuin, solveSafeWithdrawal, closedFormSafeWithdrawal } from './safeWithdrawal';
import { countGoalHits, solveRequiredContribution } from './requiredContribution';

const seed = 20_261_114;
const PI = 0.03;

/** Jedno aktywo, bez podatków i kosztów, inflacja stała (σ_η = 0, brak niepewności), 30 lat. */
function makeRetiree(sigma: number, horizonMonths = 360): Scenario {
  const base = makeScenario();
  const eq = base.assets[0] as RiskyAssetParams;
  return makeScenario({
    horizonMonths,
    assets: [{ ...eq, sigma, g: 1.03 * Math.exp(PI) - 1, ter: 0, costBps: 0 }],
    positions: [{ assetId: 'globalEquity', wrapper: 'taxable', value: 1_000_000, costBasis: 1_000_000, targetWeight: 1 }],
    market: { ...base.market, inflation: { ...base.market.inflation, x0: PI, mean: PI, meanSe: 0, sigmaEta: 0 }, uncertaintyScale: 0 },
    withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 0 },
    rebalance: { kind: 'annual' },
  });
}

describe('bisectAmount', () => {
  it('funkcja schodkowa floor(x)/10, target 0,35: przedział zawiera 4, szerokość ≤ relTol·4', () => {
    const r = bisectAmount((x) => Math.floor(x) / 10, 0, 10, 0.35, { relTol: 0.005, maxIter: 20, increasing: true });
    expect(r.lo).toBeLessThan(4);
    expect(r.hi).toBeGreaterThanOrEqual(4);
    expect(r.hi - r.lo).toBeLessThanOrEqual(0.005 * 4);
    expect(r.iterations).toBeLessThanOrEqual(20);
  });

  it('malejąca: f(x) = 1 − floor(x)/10, target 0,65 ⇒ granica w 4', () => {
    const r = bisectAmount((x) => 1 - Math.floor(x) / 10, 0, 10, 0.65, { relTol: 0.005, maxIter: 20, increasing: false });
    expect(r.lo).toBeLessThan(4);
    expect(r.hi).toBeGreaterThanOrEqual(4);
    expect(r.hi - r.lo).toBeLessThanOrEqual(0.005 * 4);
  });
});

describe('solveSafeWithdrawal', () => {
  it('σ = 0, realnie 3%: kwota = PMT(należna z góry) z błędem < 0,5%', () => {
    const s = makeRetiree(0);
    const expected = pmt(Math.pow(1.03, 1 / 12) - 1, 360, 1_000_000, true);
    const r = solveSafeWithdrawal(s, { targetProb: 0.9, seed, paths: 200 });
    expect(Math.abs(r.amount / expected - 1)).toBeLessThan(0.005);
    expect(r.amount).toBeLessThanOrEqual(expected * 1.0000001); // koniec konserwatywny
    expect(r.prob).toBe(1);
  }, 120_000);

  it('gbm σ = 0,16: P̂(amount) ≥ targetProb, a P̂(1,02·amount) < targetProb + 0,01 na tych samych ścieżkach', () => {
    const s = makeRetiree(0.16);
    const paths = 2000;
    const target = 0.85;
    const r = solveSafeWithdrawal(s, { targetProb: target, seed, paths });
    const at = (x: number): number => countNoRuin({ ...s, withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: x } }, seed, paths, 500) / paths;
    expect(at(r.amount)).toBeGreaterThanOrEqual(target);
    expect(at(r.amount * 1.02)).toBeLessThan(target + 0.01);
    expect(r.prob).toBeCloseTo(at(r.amount), 12);
    expect(r.ci[0]).toBeLessThanOrEqual(r.prob);
    expect(r.ci[1]).toBeGreaterThanOrEqual(r.prob);
  }, 240_000);

  it('rozwiązanie zamknięte różni się od solvera o < 1% (tax none, rebalans annual)', () => {
    const s = makeRetiree(0.16);
    const paths = 2000;
    const target = 0.85;
    const closed = closedFormSafeWithdrawal(s, { targetProb: target, seed, paths });
    const r = solveSafeWithdrawal(s, { targetProb: target, seed, paths });
    expect(Math.abs(closed / r.amount - 1)).toBeLessThan(0.01);
  }, 240_000);

  it('(T7) wynik nie zależy od podziału ścieżek na partie', () => {
    const s = makeRetiree(0.16, 120);
    const a = solveSafeWithdrawal(s, { targetProb: 0.8, seed, paths: 600, batchSize: 600 });
    const b = solveSafeWithdrawal(s, { targetProb: 0.8, seed, paths: 600, batchSize: 150 });
    expect(b).toEqual(a);
  }, 240_000);
});

describe('solveRequiredContribution', () => {
  const goalScenario = (goalReal: number): Scenario => {
    const base = makeRetiree(0.16, 120);
    return { ...base, withdrawal: undefined, goal: { amountReal: goalReal, month: 120 }, positions: [{ ...base.positions[0]!, value: 10_000, costBasis: 10_000 }] };
  };

  it('cel nieosiągalny przy maksymalnej wpłacie (10× cel/horyzont) ⇒ Infinity', () => {
    // wpłata tylko w miesiącu 0: łącznie 10·cel/120 < cel, więc nawet maksymalna kwota nie wystarcza
    const s: Scenario = { ...goalScenario(1_000_000), contribution: { monthly: 0, endMonth: 0, indexation: 'none', realGrowth: 0 } };
    const r = solveRequiredContribution(s, { targetProb: 0.9, seed, paths: 200 });
    expect(r.amount).toBe(Infinity);
    expect(r.prob).toBeLessThan(0.9);
  }, 120_000);

  it('cel już spełniony bez wpłat ⇒ 0', () => {
    const s = goalScenario(5_000);
    const r = solveRequiredContribution(s, { targetProb: 0.9, seed, paths: 200 });
    expect(r.amount).toBe(0);
    expect(r.prob).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it('wynik osiąga cel z P̂ ≥ target, a 0,95·wynik już nie', () => {
    const s = goalScenario(200_000);
    const paths = 1000;
    const target = 0.8;
    const r = solveRequiredContribution(s, { targetProb: target, seed, paths });
    expect(Number.isFinite(r.amount)).toBe(true);
    expect(r.amount).toBeGreaterThan(0);
    const at = (x: number): number => {
      const c = s.contribution ?? { monthly: 0, endMonth: 119, indexation: 'cpi' as const, realGrowth: 0 };
      return countGoalHits({ ...s, contribution: { ...c, monthly: x } }, seed, paths, 500) / paths;
    };
    expect(at(r.amount)).toBeGreaterThanOrEqual(target);
    expect(at(r.amount * 0.95)).toBeLessThan(target + 0.02);
    expect(r.prob).toBeCloseTo(at(r.amount), 12);
  }, 240_000);

  it('(T7) wynik nie zależy od podziału ścieżek na partie', () => {
    const s = goalScenario(200_000);
    const a = solveRequiredContribution(s, { targetProb: 0.8, seed, paths: 400, batchSize: 400 });
    const b = solveRequiredContribution(s, { targetProb: 0.8, seed, paths: 400, batchSize: 100 });
    expect(b).toEqual(a);
  }, 240_000);

  it('bez celu: błąd', () => {
    expect(() => solveRequiredContribution(makeScenario(), { targetProb: 0.9, seed, paths: 10 })).toThrow();
  });
});

