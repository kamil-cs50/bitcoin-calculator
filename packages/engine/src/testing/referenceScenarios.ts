import type { AssetParams, FxParams, MarketModel, Scenario } from '../types';
import { makeScenario } from './fixtures';

/**
 * Scenariusze wzorcowe do regresji (spec T8). Parametry z zestawu 2026.11 (spec 6.2-6.4);
 * wartości przybliżone, istotna jest stabilność migawek, nie realizm danych.
 */

const equity: AssetParams = {
  kind: 'risky', id: 'globalEquity', currency: 'USD', g: 0.065, sigma: 0.16, se: 0.015, alpha: 1, b: 1,
  ter: 0.002, costBps: 10, taxForm: 'security',
};
const btc: AssetParams = {
  kind: 'risky', id: 'btc', currency: 'USD', g: 0.15, sigma: 0.5, se: 0.06, alpha: 1, b: 1, ter: 0, costBps: 30,
  taxForm: 'crypto',
  decay: { gInf: 0.055, tauG: 7, sigmaInf: 0.3, tauSigma: 8 },
  collapse: { hazard: 0.01, loss: 0.9 },
};
const edo: AssetParams = { kind: 'edo', id: 'edo', firstYearRate: 0.0575, margin: 0.015, earlyFeePer100: 2, onMaturity: 'roll' };
const deposit: AssetParams = { kind: 'deposit', id: 'deposit', k: 0.15, spread: -0.005, initialRate: 0.045 };
const bonds: AssetParams = {
  kind: 'risky', id: 'bonds', currency: 'PLN', g: 0.055, sigma: 0.06, se: 0.01, alpha: 0.3, b: 1, ter: 0.002,
  costBps: 10, taxForm: 'security',
};

const usd: FxParams = { currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: 0, foreignInflation: 0.025 };

/** Rynek: czynniki = aktywa ryzykowne (w kolejności `assets`), fx:USD, cpi. `upper` = korelacje górnotrójkątne. */
function market(riskyIds: string[], upper: number[]): MarketModel {
  const base = makeScenario().market;
  const ids = [...riskyIds, 'fx:USD', 'cpi'];
  const n = ids.length;
  const m = new Array<number>(n * n).fill(0);
  let u = 0;
  for (let i = 0; i < n; i++) {
    m[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) m[i * n + j] = m[j * n + i] = upper[u++] ?? 0;
  }
  return { ...base, mode: 'realistic', nu: 5, regime: { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 }, factorIds: ids, correlation: m, fx: [usd], uncertaintyScale: 1 };
}

const common = { datasetVersion: '2026.11', baseCurrency: 'PLN' as const, startYear: 2026, startMonth: 1 };

/** Akumulacja: 60% akcje globalne (USD), 20% EDO, 10% BTC, 10% lokata; 2 000 zł/mies. z indeksacją CPI; 25 lat; podatki PL. */
const accumulation: Scenario = makeScenario({
  ...common,
  horizonMonths: 300,
  assets: [equity, btc, edo, deposit],
  positions: [
    { assetId: 'globalEquity', wrapper: 'taxable', value: 60_000, costBasis: 50_000, targetWeight: 0.6 },
    { assetId: 'edo', wrapper: 'taxable', value: 20_000, costBasis: 20_000, targetWeight: 0.2 },
    { assetId: 'btc', wrapper: 'taxable', value: 10_000, costBasis: 8_000, targetWeight: 0.1 },
    { assetId: 'deposit', wrapper: 'taxable', value: 10_000, costBasis: 10_000, targetWeight: 0.1 },
  ],
  // czynniki: globalEquity, btc, fx:USD, cpi; pary: eq-btc .35, eq-fx -.3, eq-cpi .1, btc-fx 0, btc-cpi 0, fx-cpi 0
  market: market(['globalEquity', 'btc'], [0.35, -0.3, 0.1, 0, 0, 0]),
  contribution: { monthly: 2000, endMonth: 300, indexation: 'cpi', realGrowth: 0 },
  rebalance: { kind: 'annual' },
  tax: { kind: 'pl' },
  goal: { amountReal: 1_500_000, month: 300 },
});

/** Emerytura: wypłaty ABW od miesiąca 0, 30 lat; akcje globalne 50%, obligacje PL 30%, EDO 20%. */
const retirement: Scenario = makeScenario({
  ...common,
  horizonMonths: 360,
  assets: [equity, bonds, edo],
  positions: [
    { assetId: 'globalEquity', wrapper: 'taxable', value: 600_000, costBasis: 450_000, targetWeight: 0.5 },
    { assetId: 'bonds', wrapper: 'taxable', value: 360_000, costBasis: 340_000, targetWeight: 0.3 },
    { assetId: 'edo', wrapper: 'taxable', value: 240_000, costBasis: 240_000, targetWeight: 0.2 },
  ],
  // czynniki: globalEquity, bonds, fx:USD, cpi
  market: market(['globalEquity', 'bonds'], [0.1, -0.3, 0.1, 0, 0.1, 0]),
  withdrawal: { kind: 'abw', startMonth: 0, expectedRealReturn: 0.03 },
  rebalance: { kind: 'band', bandPp: 5 },
  tax: { kind: 'pl' },
});

/** BTC dominujący: 50% BTC (preset bazowy), 30% akcje globalne, 20% lokata; 15 lat; podatki PL. */
const btcHeavy: Scenario = makeScenario({
  ...common,
  horizonMonths: 180,
  assets: [equity, btc, deposit],
  positions: [
    { assetId: 'btc', wrapper: 'taxable', value: 50_000, costBasis: 20_000, targetWeight: 0.5 },
    { assetId: 'globalEquity', wrapper: 'taxable', value: 30_000, costBasis: 28_000, targetWeight: 0.3 },
    { assetId: 'deposit', wrapper: 'taxable', value: 20_000, costBasis: 20_000, targetWeight: 0.2 },
  ],
  // czynniki: globalEquity, btc, fx:USD, cpi
  market: market(['globalEquity', 'btc'], [0.35, -0.3, 0.1, 0, 0, 0]),
  rebalance: { kind: 'annual' },
  tax: { kind: 'pl' },
});

export const referenceScenarios: { accumulation: Scenario; retirement: Scenario; btcHeavy: Scenario } = {
  accumulation,
  retirement,
  btcHeavy,
};
