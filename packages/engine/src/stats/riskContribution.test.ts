import { describe, expect, it } from 'vitest';
import { annualLogCovariance, assetRiskShares, riskContributions } from './riskContribution';
import { makeScenario } from '../testing/fixtures';
import type { RiskyAssetParams, Scenario } from '../types';

describe('riskContributions', () => {
  it('dwa nieskorelowane aktywa 0,9/0,1, σ 0,16/0,50: wkład = w²σ²/Σ i suma = 1', () => {
    const cov = [0.16 * 0.16, 0, 0, 0.5 * 0.5];
    const c = riskContributions([0.9, 0.1], cov);
    const a = 0.81 * 0.0256;
    const b = 0.01 * 0.25;
    expect(c[0]).toBeCloseTo(a / (a + b), 12);
    expect(c[1]).toBeCloseTo(b / (a + b), 12);
    expect(c[0]! + c[1]!).toBeCloseTo(1, 12);
  });

  it('suma wkładów = 1 także przy korelacji (trzy aktywa)', () => {
    const cov = [0.04, 0.01, 0.005, 0.01, 0.09, 0.02, 0.005, 0.02, 0.25];
    const c = riskContributions([0.5, 0.3, 0.2], cov);
    expect(c.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
  });

  it('zerowa wariancja portfela daje same zera', () => {
    expect(riskContributions([1, 0], [0, 0, 0, 0])).toEqual([0, 0]);
  });
});

function twoAssets(): Scenario {
  const eq = makeScenario().assets[0] as RiskyAssetParams;
  const btc: RiskyAssetParams = { ...eq, id: 'btcBase', sigma: 0.5, g: 0.1 };
  return makeScenario({
    assets: [eq, btc],
    positions: [
      { assetId: 'globalEquity', wrapper: 'taxable', value: 90_000, costBasis: 90_000, targetWeight: 0.9 },
      { assetId: 'btcBase', wrapper: 'taxable', value: 10_000, costBasis: 10_000, targetWeight: 0.1 },
    ],
    market: { ...makeScenario().market, factorIds: ['globalEquity', 'btcBase', 'cpi'], correlation: [1, 0, 0.1, 0, 1, 0.1, 0.1, 0.1, 1] },
  });
}

describe('annualLogCovariance / assetRiskShares', () => {
  it('kowariancja roczna: wariancje zbliżone do σ² (4·SE), brak korelacji', () => {
    const { ids, cov } = annualLogCovariance(twoAssets(), { seed: 7, paths: 2000 });
    expect(ids).toEqual(['globalEquity', 'btcBase']);
    const n = 2000;
    for (const [i, sg] of [[0, 0.16], [1, 0.5]] as const) {
      const se = sg * sg * Math.sqrt(2 / n); // SE wariancji (normalny, bez grubych ogonów: zapas)
      expect(Math.abs(cov[i * 2 + i]! - sg * sg)).toBeLessThan(4 * se * 2);
    }
    const rho = cov[1]! / Math.sqrt(cov[0]! * cov[3]!);
    expect(Math.abs(rho)).toBeLessThan(4 / Math.sqrt(n));
    expect(cov[1]).toBe(cov[2]);
  });

  it('udziały: BTC to 10% wartości i ok. 10,7% ryzyka', () => {
    const rows = assetRiskShares(twoAssets(), { seed: 7, paths: 2000 });
    const btc = rows.find((r) => r.assetId === 'btcBase')!;
    expect(btc.valueShare).toBeCloseTo(0.1, 12);
    expect(btc.riskShare).toBeGreaterThan(0.09);
    expect(btc.riskShare).toBeLessThan(0.125);
    expect(rows.reduce((s, r) => s + r.riskShare, 0)).toBeCloseTo(1, 10);
  });
});
