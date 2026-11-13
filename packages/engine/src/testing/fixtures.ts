import type { Scenario } from '../types';

/**
 * Scenariusz wzorcowy do testów: jedno aktywo `globalEquity` (100 000 PLN, 100% wagi),
 * tryb `gbm`, podatki wyłączone, 120 miesięcy, start 2026-01.
 *
 * market.factorIds = ['globalEquity', 'cpi'] (aktywo ryzykowne, potem inflacja; brak walut obcych,
 * bo wszystko jest w PLN). market.correlation to macierz 2x2 wierszami: [1, 0.1, 0.1, 1]
 * (korelacja akcji z szokiem inflacji 0,1 - słabo dodatnia, dodatnio określona).
 * Pola z `overrides` nadpisują płytko pola najwyższego poziomu.
 */
export function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  const base: Scenario = {
    schemaVersion: 1,
    datasetVersion: 'test',
    baseCurrency: 'PLN',
    startYear: 2026,
    startMonth: 1,
    horizonMonths: 120,
    assets: [
      {
        kind: 'risky',
        id: 'globalEquity',
        currency: 'PLN',
        g: 0.06,
        sigma: 0.16,
        se: 0.02,
        alpha: 0,
        b: 1,
        ter: 0.002,
        costBps: 10,
        taxForm: 'none',
      },
    ],
    positions: [
      { assetId: 'globalEquity', wrapper: 'taxable', value: 100_000, costBasis: 100_000, targetWeight: 1 },
    ],
    market: {
      mode: 'gbm',
      nu: 10,
      regime: { p01: 0.02, p10: 0.1, kappa1: 1.8, delta: 0.1 },
      factorIds: ['globalEquity', 'cpi'],
      correlation: [1, 0.1, 0.1, 1],
      inflation: {
        x0: 0.035,
        mean: 0.035,
        meanSe: 0.01,
        phi: 0.8,
        sigmaEta: 0.01,
        cpiHistory: Array.from({ length: 13 }, (_, i) => 100 * Math.pow(1.035, i / 12)),
      },
      fx: [],
      uncertaintyScale: 0,
    },
    events: [],
    rebalance: { kind: 'none' },
    tax: { kind: 'none' },
  };
  return { ...base, ...overrides };
}
