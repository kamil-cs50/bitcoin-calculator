import { makeScenario } from '../src/testing/fixtures';
import type { AssetParams, Position, RiskyAssetParams, Scenario } from '../src/types';

/**
 * Scenariusz wydajnościowy (spec 9, T10 / 4.14): 6 aktywów (2 w USD), 360 mies., tryb realistic, podatki pl,
 * wpłaty miesięczne, rebalans roczny.
 */
export function makePerfScenario(): Scenario {
  const base = makeScenario();
  const eq = base.assets[0] as RiskyAssetParams;
  const assets: AssetParams[] = [
    { ...eq, id: 'world', currency: 'USD', g: 0.065, sigma: 0.16, taxForm: 'security', ter: 0.002 },
    { ...eq, id: 'pl', currency: 'PLN', g: 0.07, sigma: 0.2, alpha: 0.3, taxForm: 'security', ter: 0.004 },
    { ...eq, id: 'btc', currency: 'PLN', g: 0.12, sigma: 0.6, alpha: 1, b: 0.5, taxForm: 'crypto', costBps: 30, ter: 0, collapse: { hazard: 0.03, loss: 0.9 }, decay: { gInf: 0.05, tauG: 8, sigmaInf: 0.4, tauSigma: 10 } },
    { ...eq, id: 'gold', currency: 'USD', g: 0.03, sigma: 0.15, taxForm: 'physicalGold', ter: 0.004 },
    { kind: 'deposit', id: 'lokata', k: 0.2, spread: -0.005, initialRate: 0.045 },
    { kind: 'edo', id: 'edo', firstYearRate: 0.065, margin: 0.015, earlyFeePer100: 2, onMaturity: 'roll' },
  ];
  const positions: Position[] = [
    { assetId: 'world', wrapper: 'taxable', value: 40_000, costBasis: 30_000, targetWeight: 0.3 },
    { assetId: 'pl', wrapper: 'IKE', value: 20_000, costBasis: 15_000, targetWeight: 0.15 },
    { assetId: 'btc', wrapper: 'taxable', value: 10_000, costBasis: 5_000, targetWeight: 0.1 },
    { assetId: 'gold', wrapper: 'taxable', value: 10_000, costBasis: 9_000, targetWeight: 0.1 },
    { assetId: 'lokata', wrapper: 'taxable', value: 10_000, costBasis: 10_000, targetWeight: 0.15 },
    { assetId: 'edo', wrapper: 'taxable', value: 10_000, costBasis: 10_000, targetWeight: 0.2 },
  ];
  // czynniki: world, pl, btc, gold, fx:USD, cpi
  const n = 6;
  const corr = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) corr[i * n + i] = 1;
  const set = (i: number, j: number, v: number): void => {
    corr[i * n + j] = v;
    corr[j * n + i] = v;
  };
  set(0, 1, 0.7);
  set(0, 2, 0.3);
  set(1, 2, 0.25);
  set(0, 3, 0.1);
  set(3, 4, -0.3);
  set(0, 4, -0.2);
  set(5, 3, 0.1);
  return makeScenario({
    horizonMonths: 360,
    assets,
    positions,
    market: {
      ...base.market,
      mode: 'realistic',
      nu: 5,
      factorIds: ['world', 'pl', 'btc', 'gold', 'fx:USD', 'cpi'],
      correlation: corr,
      fx: [{ currency: 'USD', sigma: 0.1, halfLifeYears: 4, alpha: 0.3, foreignInflation: 0.025 }],
      uncertaintyScale: 1,
    },
    contribution: { monthly: 2000, endMonth: 360, indexation: 'cpi', realGrowth: 0 },
    events: [],
    rebalance: { kind: 'annual' },
    tax: { kind: 'pl' },
  });
}
