import { describe, expect, it } from 'vitest';
import { EXPERT_STAGE, mergeResults, runBatch, STAGES } from './runner';
import { buildGrid } from './kernel';
import { makeScenario } from './testing/fixtures';
import type { AssetParams, Position, RunResult, Scenario } from './types';

/** Scenariusz z 3 aktywami (2 ryzykowne w 3 pozycjach, lokata), wpłatami, rebalansem i podatkiem pl; 7 lat (siatka miesięczna). */
function makeMulti(horizonMonths = 84): Scenario {
  const base = makeScenario();
  const eq = base.assets[0]!;
  const assets: AssetParams[] = [
    { ...(eq as Extract<AssetParams, { kind: 'risky' }>), id: 'eqA', taxForm: 'security' },
    { ...(eq as Extract<AssetParams, { kind: 'risky' }>), id: 'cryp', sigma: 0.7, g: 0.1, taxForm: 'crypto', collapse: { hazard: 0.1, loss: 0.9 } },
    { kind: 'deposit', id: 'lokata', k: 0.2, spread: -0.005, initialRate: 0.04 },
  ];
  const positions: Position[] = [
    { assetId: 'eqA', wrapper: 'taxable', value: 50_000, costBasis: 40_000, targetWeight: 0.5 },
    { assetId: 'eqA', wrapper: 'IKE', value: 10_000, costBasis: 10_000, targetWeight: 0.1 },
    { assetId: 'cryp', wrapper: 'taxable', value: 15_000, costBasis: 10_000, targetWeight: 0.2 },
    { assetId: 'lokata', wrapper: 'taxable', value: 25_000, costBasis: 25_000, targetWeight: 0.2 },
  ];
  return makeScenario({
    horizonMonths,
    assets,
    positions,
    market: { ...base.market, mode: 'realistic', nu: 5, factorIds: ['eqA', 'cryp', 'cpi'], correlation: [1, 0.4, 0.1, 0.4, 1, 0, 0.1, 0, 1], uncertaintyScale: 1 },
    contribution: { monthly: 1000, endMonth: 60, indexation: 'cpi', realGrowth: 0 },
    rebalance: { kind: 'annual' },
    tax: { kind: 'pl' },
  });
}

const bytes = (a: ArrayBufferView): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
function expectIdentical(a: RunResult, b: RunResult): void {
  expect(a.paths).toBe(b.paths);
  for (const k of ['grid', 'wealth', 'wealthAfterTax', 'cpi', 'ruinMonth', 'maxDrawdown', 'worst12m', 'twrLog', 'collapsed', 'meanShare'] as const) {
    expect(Buffer.compare(bytes(a[k]), bytes(b[k])), k).toBe(0);
  }
  expect(a.warnings).toEqual(b.warnings);
}

describe('runBatch / mergeResults', () => {
  const s = makeMulti();
  const seed = 20_261_114;

  it('stałe etapów', () => {
    expect([...STAGES]).toEqual([1000, 4000, 10000]);
    expect(EXPERT_STAGE).toBe(25000);
  });

  it('(T7) całość 1000 ścieżek jest bajt w bajt równa scaleniu 4 części po 250', () => {
    const whole = runBatch(s, { seed, paths: 1000 });
    const parts = [0, 250, 500, 750].map((pathOffset) => runBatch(s, { seed, paths: 250, pathOffset }));
    expectIdentical(whole, mergeResults(parts));
  }, 120_000);

  it('mergeResults: część z paths = 0 nie daje NaN i nie zmienia wyniku', () => {
    const empty = runBatch(s, { seed, paths: 0 });
    expect(Array.from(empty.meanShare).every((v) => Number.isFinite(v))).toBe(true);
    const full = runBatch(s, { seed, paths: 8 });
    expectIdentical(full, mergeResults([empty, full]));
    expectIdentical(full, mergeResults([full, runBatch(s, { seed, paths: 0, pathOffset: 8 })]));
    const only = mergeResults([empty]);
    expect(only.paths).toBe(0);
    expect(Array.from(only.meanShare).every((v) => v === 0)).toBe(true);
  });

  it('powtarzalność: to samo ziarno daje identyczne wyniki', () => {
    expectIdentical(runBatch(s, { seed, paths: 50 }), runBatch(s, { seed, paths: 50 }));
  });

  it('wynik ścieżki zależy tylko od (ziarno, indeks): część z offsetem = wycinek całości', () => {
    const whole = runBatch(s, { seed, paths: 40 });
    const part = runBatch(s, { seed, paths: 10, pathOffset: 25 });
    const g = whole.grid.length;
    expect(Buffer.compare(bytes(part.wealth), bytes(whole.wealth.subarray(25 * g, 35 * g)))).toBe(0);
    expect(Buffer.compare(bytes(part.twrLog), bytes(whole.twrLog.subarray(25, 35)))).toBe(0);
  });

  it('rozmiary i meanShare sumujące się do 1 w każdym roku', () => {
    const r = runBatch(s, { seed, paths: 60 });
    const G = buildGrid(s.horizonMonths).length;
    const A = s.assets.length;
    expect(r.paths).toBe(60);
    expect(r.grid.length).toBe(G);
    expect(r.wealth.length).toBe(60 * G);
    expect(r.wealthAfterTax.length).toBe(60 * G);
    expect(r.cpi.length).toBe(60 * G);
    expect(r.ruinMonth.length).toBe(60);
    expect(r.maxDrawdown.length).toBe(60);
    expect(r.worst12m.length).toBe(60);
    expect(r.twrLog.length).toBe(60);
    expect(r.collapsed.length).toBe(60 * A);
    const years = Math.ceil(s.horizonMonths / 12);
    expect(r.meanShare.length).toBe(years * A);
    for (let y = 0; y < years; y++) {
      let sum = 0;
      for (let i = 0; i < A; i++) {
        const v = r.meanShare[y * A + i]!;
        expect(v).toBeGreaterThanOrEqual(0);
        sum += v;
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('meanShare sumuje się do 1 także przy ruinie (duże wypłaty) i po scaleniu', () => {
    const ruinous = { ...s, withdrawal: { kind: 'fixedReal' as const, startMonth: 12, monthly: 20_000 } };
    const r = mergeResults([runBatch(ruinous, { seed, paths: 30 }), runBatch(ruinous, { seed, paths: 30, pathOffset: 30 })]);
    expect(Array.from(r.ruinMonth).some((m) => m >= 0)).toBe(true);
    const A = ruinous.assets.length;
    for (let y = 0; y < Math.ceil(ruinous.horizonMonths / 12); y++) {
      let sum = 0;
      for (let i = 0; i < A; i++) sum += r.meanShare[y * A + i]!;
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('pamięć: 25 000 ścieżek × 161 punktów, trzy macierze razem < 64 MB', () => {
    const n = EXPERT_STAGE;
    const g = buildGrid(960).length;
    expect(g).toBe(161);
    const bytesTotal = 3 * new Float32Array(n * g).byteLength;
    expect(bytesTotal).toBeLessThan(64 * 1024 * 1024);
  });
});
