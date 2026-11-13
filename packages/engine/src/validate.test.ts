import { describe, expect, it } from 'vitest';
import { makeScenario } from './testing/fixtures';
import { validateScenario } from './validate';
import type { RiskyAssetParams, Scenario } from './types';

function errorPaths(s: Scenario): string[] {
  const r = validateScenario(s);
  if (r.ok) return [];
  return r.errors.map((e) => e.path);
}

function riskyOf(s: Scenario): RiskyAssetParams {
  return s.assets[0] as RiskyAssetParams;
}

describe('validateScenario', () => {
  it('akceptuje scenariusz wzorcowy', () => {
    const r = validateScenario(makeScenario());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });

  it('odrzuca horizonMonths 0 i 961, przyjmuje 1 i 960', () => {
    expect(errorPaths(makeScenario({ horizonMonths: 0 }))).toContain('horizonMonths');
    expect(errorPaths(makeScenario({ horizonMonths: 961 }))).toContain('horizonMonths');
    expect(validateScenario(makeScenario({ horizonMonths: 1 })).ok).toBe(true);
    expect(validateScenario(makeScenario({ horizonMonths: 960 })).ok).toBe(true);
  });

  it('odrzuca nu < 3, przyjmuje nu = 3', () => {
    const s = makeScenario();
    expect(errorPaths({ ...s, market: { ...s.market, nu: 2.9 } })).toContain('market.nu');
    expect(validateScenario({ ...s, market: { ...s.market, nu: 3 } }).ok).toBe(true);
  });

  it('wskazuje właściwe ścieżki dla sigma, g, hazard, loss', () => {
    const s = makeScenario();
    const a = riskyOf(s);
    expect(errorPaths({ ...s, assets: [{ ...a, sigma: -0.1 }] })).toContain('assets[0].sigma');
    expect(errorPaths({ ...s, assets: [{ ...a, g: -1 }] })).toContain('assets[0].g');
    expect(errorPaths({ ...s, assets: [{ ...a, collapse: { hazard: -0.1, loss: 0.5 } }] })).toContain(
      'assets[0].collapse.hazard',
    );
    expect(errorPaths({ ...s, assets: [{ ...a, collapse: { hazard: 0.1, loss: 1.1 } }] })).toContain(
      'assets[0].collapse.loss',
    );
  });

  it('skrajne, lecz dozwolone parametry przechodzą (sigma 0, g -0.99, hazard 1)', () => {
    const s = makeScenario();
    const a = riskyOf(s);
    const r = validateScenario({
      ...s,
      assets: [{ ...a, sigma: 0, g: -0.99, collapse: { hazard: 1, loss: 1 } }],
    });
    expect(r.ok).toBe(true);
  });

  it('błąd, gdy długość correlation !== factorIds.length²', () => {
    const s = makeScenario();
    expect(errorPaths({ ...s, market: { ...s.market, correlation: [1, 0, 0] } })).toContain(
      'market.correlation',
    );
  });

  it('błąd, gdy |ρ| > 1 (także NaN)', () => {
    const s = makeScenario();
    expect(errorPaths({ ...s, market: { ...s.market, correlation: [1, 1.3, 1.3, 1] } })).toContain(
      'market.correlation',
    );
    expect(errorPaths({ ...s, market: { ...s.market, correlation: [1, NaN, NaN, 1] } })).toContain(
      'market.correlation',
    );
  });

  it('suma targetWeight płynnych = 0 daje ok z ostrzeżeniem EMPTY_PORTFOLIO', () => {
    const s = makeScenario();
    const r = validateScenario({
      ...s,
      positions: s.positions.map((p) => ({ ...p, targetWeight: 0 })),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code)).toContain('EMPTY_PORTFOLIO');
  });

  it('pusta lista pozycji też daje EMPTY_PORTFOLIO', () => {
    const r = validateScenario(makeScenario({ positions: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code)).toContain('EMPTY_PORTFOLIO');
  });

  it('withdrawal.startMonth > horizonMonths jest dozwolone', () => {
    const r = validateScenario(
      makeScenario({ withdrawal: { kind: 'fixedReal', startMonth: 500, monthly: 1000 } }),
    );
    expect(r.ok).toBe(true);
  });

  it('pozycja z nieistniejącym assetId daje błąd positions[0].assetId', () => {
    const s = makeScenario();
    const p = s.positions[0]!;
    expect(errorPaths({ ...s, positions: [{ ...p, assetId: 'nie-ma' }] })).toContain(
      'positions[0].assetId',
    );
  });
});
