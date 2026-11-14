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

  it('person (wiek i płeć, opcjonalne): wiek 0..120 i płeć M/K', () => {
    expect(validateScenario(makeScenario({ person: { age: 60, sex: 'M' } })).ok).toBe(true);
    expect(validateScenario(makeScenario({ person: { age: 60, sex: 'K', cohortBonus: true } })).ok).toBe(true);
    expect(validateScenario(makeScenario({ person: { age: 40 } })).ok).toBe(true);
    expect(errorPaths(makeScenario({ person: { age: 121, sex: 'M' } }))).toContain('person.age');
    expect(errorPaths(makeScenario({ person: { age: -1, sex: 'M' } }))).toContain('person.age');
    expect(errorPaths(makeScenario({ person: { age: 60.5, sex: 'M' } }))).toContain('person.age');
    expect(errorPaths(makeScenario({ person: { age: 60, sex: 'X' as 'M' } }))).toContain('person.sex');
  });

  it('odrzuca nu < 3 w trybie realistic, przyjmuje nu = 3; w gbm nu nie jest wymagane', () => {
    const s = makeScenario();
    const real = { ...s.market, mode: 'realistic' as const };
    expect(errorPaths({ ...s, market: { ...real, nu: 2.9 } })).toContain('market.nu');
    expect(validateScenario({ ...s, market: { ...real, nu: 3 } }).ok).toBe(true);
    expect(validateScenario({ ...s, market: { ...s.market, nu: 1 } }).ok).toBe(true);
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

  it('ujemny targetWeight daje ostrzeżenie NEGATIVE_TARGET_WEIGHT (rebalans traktuje go jak 0)', () => {
    const s = makeScenario();
    const r = validateScenario({
      ...s,
      positions: s.positions.map((p, i) => (i === 0 ? { ...p, targetWeight: -0.2 } : p)),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code)).toContain('NEGATIVE_TARGET_WEIGHT');
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

  it('Guyton–Klinger: poprawne parametry przechodzą, błędne wskazują ścieżkę', () => {
    const gk = { kind: 'guytonKlinger' as const, startMonth: 0, initialRate: 0.05, guardrail: 0.2, adjustment: 0.1, inflationCap: 0.06 };
    expect(validateScenario(makeScenario({ withdrawal: gk })).ok).toBe(true);
    const bad = (patch: object) => errorPaths(makeScenario({ withdrawal: { ...gk, ...patch } }));
    expect(bad({ initialRate: 0 })).toContain('withdrawal.initialRate');
    expect(bad({ initialRate: 1.5 })).toContain('withdrawal.initialRate');
    expect(bad({ guardrail: 1 })).toContain('withdrawal.guardrail');
    expect(bad({ adjustment: 0 })).toContain('withdrawal.adjustment');
    expect(bad({ inflationCap: -0.01 })).toContain('withdrawal.inflationCap');
    expect(bad({ inflationCap: NaN })).toContain('withdrawal.inflationCap');
  });

  it('pozycja z nieistniejącym assetId daje błąd positions[0].assetId', () => {
    const s = makeScenario();
    const p = s.positions[0]!;
    expect(errorPaths({ ...s, positions: [{ ...p, assetId: 'nie-ma' }] })).toContain(
      'positions[0].assetId',
    );
  });

  describe('pola modelu rynku i aktywów (czytelny błąd zamiast wyjątku)', () => {
    const withAsset = (over: Partial<RiskyAssetParams>): Scenario => {
      const s = makeScenario();
      return { ...s, assets: [{ ...riskyOf(s), ...over }] };
    };
    const withMarket = (over: Partial<Scenario['market']>): Scenario => {
      const s = makeScenario();
      return { ...s, market: { ...s.market, ...over } };
    };
    const withFx = (over: Partial<Scenario['market']['fx'][number]> = {}): Scenario => {
      const s = makeScenario();
      return {
        ...s,
        market: {
          ...s.market,
          factorIds: ['globalEquity', 'fx:USD', 'cpi'],
          correlation: [1, 0, 0.1, 0, 1, 0, 0.1, 0, 1],
          fx: [{ currency: 'USD', sigma: 0.11, halfLifeYears: 4, alpha: 0, foreignInflation: 0.02, ...over }],
        },
      };
    };

    it('b poza [0,1], se < 0, ter < 0 w aktywie ryzykownym', () => {
      expect(errorPaths(withAsset({ b: 1.1 }))).toContain('assets[0].b');
      expect(errorPaths(withAsset({ b: -0.1 }))).toContain('assets[0].b');
      expect(errorPaths(withAsset({ se: -0.01 }))).toContain('assets[0].se');
      expect(errorPaths(withAsset({ ter: -0.01 }))).toContain('assets[0].ter');
      expect(validateScenario(withAsset({ b: 0 })).ok).toBe(true);
      expect(validateScenario(withAsset({ b: 1, se: 0, ter: 0 })).ok).toBe(true);
    });

    it('fx: halfLife ≤ 0, sigma < 0', () => {
      expect(errorPaths(withFx({ halfLifeYears: 0 }))).toContain('market.fx[0].halfLifeYears');
      expect(errorPaths(withFx({ sigma: -0.1 }))).toContain('market.fx[0].sigma');
      expect(validateScenario(withFx()).ok).toBe(true);
    });

    it('inflacja: phi poza (−1,1), sigmaEta < 0, meanSe < 0', () => {
      const s = makeScenario();
      const infl = s.market.inflation;
      expect(errorPaths(withMarket({ inflation: { ...infl, phi: 1 } }))).toContain('market.inflation.phi');
      expect(errorPaths(withMarket({ inflation: { ...infl, phi: -1 } }))).toContain('market.inflation.phi');
      expect(errorPaths(withMarket({ inflation: { ...infl, sigmaEta: -0.01 } }))).toContain('market.inflation.sigmaEta');
      expect(errorPaths(withMarket({ inflation: { ...infl, meanSe: -0.01 } }))).toContain('market.inflation.meanSe');
      expect(errorPaths(withMarket({ inflation: { ...infl, cpiHistory: [100, 101] } }))).toContain(
        'market.inflation.cpiHistory',
      );
    });

    it('reżim: p01/p10 poza [0,1], kappa1 < 1, delta < 0; uncertaintyScale < 0', () => {
      const s = makeScenario();
      const r = s.market.regime;
      expect(errorPaths(withMarket({ regime: { ...r, p01: 1.2 } }))).toContain('market.regime.p01');
      expect(errorPaths(withMarket({ regime: { ...r, p10: -0.1 } }))).toContain('market.regime.p10');
      expect(errorPaths(withMarket({ regime: { ...r, kappa1: 0.9 } }))).toContain('market.regime.kappa1');
      expect(errorPaths(withMarket({ regime: { ...r, delta: -0.1 } }))).toContain('market.regime.delta');
      expect(errorPaths(withMarket({ uncertaintyScale: -1 }))).toContain('market.uncertaintyScale');
      expect(validateScenario(withMarket({ regime: { p01: 0, p10: 1, kappa1: 1, delta: 0 }, uncertaintyScale: 0 })).ok).toBe(true);
    });

    it('korelacja: niesymetryczna lub przekątna ≠ 1', () => {
      expect(errorPaths(withMarket({ correlation: [1, 0.2, 0.1, 1] }))).toContain('market.correlation');
      expect(errorPaths(withMarket({ correlation: [0.9, 0.1, 0.1, 1] }))).toContain('market.correlation');
    });

    it('factorIds: aktywo ryzykowne bez czynnika, nieznany czynnik, duplikat, brak procesu fx', () => {
      const s = makeScenario();
      // aktywo bez czynnika
      expect(errorPaths(withMarket({ factorIds: ['cpi'], correlation: [1] }))).toContain('market.factorIds');
      // czynnik nie będący aktywem ryzykowanym
      expect(errorPaths(withMarket({ factorIds: ['globalEquity', 'ghost', 'cpi'], correlation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }))).toContain(
        'market.factorIds',
      );
      // duplikat
      expect(
        errorPaths(withMarket({ factorIds: ['globalEquity', 'globalEquity', 'cpi'], correlation: [1, 0, 0, 0, 1, 0, 0, 0, 1] })),
      ).toContain('market.factorIds');
      // fx:USD bez wpisu w market.fx
      expect(
        errorPaths(withMarket({ factorIds: ['globalEquity', 'fx:USD', 'cpi'], correlation: [1, 0, 0, 0, 1, 0, 0, 0, 1] })),
      ).toContain('market.factorIds');
      // wpis w market.fx bez czynnika
      expect(
        errorPaths(
          withMarket({ fx: [{ currency: 'USD', sigma: 0.1, halfLifeYears: 4, alpha: 0, foreignInflation: 0.02 }] }),
        ),
      ).toContain('market.fx');
      // aktywo w USD bez procesu kursu
      expect(errorPaths({ ...s, assets: [{ ...riskyOf(s), currency: 'USD' }] })).toContain('assets[0].currency');
      // waluta bazowa EUR bez procesu kursu
      expect(errorPaths({ ...s, baseCurrency: 'EUR' })).toContain('baseCurrency');
    });

    it('lokata i EDO: k ∉ [0,1], ujemna opłata', () => {
      const s = makeScenario();
      const dep = { kind: 'deposit' as const, id: 'dep', k: 1.5, spread: -0.005, initialRate: 0.03 };
      const edo = { kind: 'edo' as const, id: 'edo', firstYearRate: 0.0535, margin: 0.02, earlyFeePer100: -3, onMaturity: 'roll' as const };
      expect(errorPaths({ ...s, assets: [...s.assets, dep] })).toContain('assets[1].k');
      expect(errorPaths({ ...s, assets: [...s.assets, edo] })).toContain('assets[1].earlyFeePer100');
      expect(
        validateScenario({ ...s, assets: [...s.assets, { ...dep, k: 0.15 }, { ...edo, id: 'edo', earlyFeePer100: 3 }] }).ok,
      ).toBe(true);
    });

    it('duplikat id aktywa', () => {
      const s = makeScenario();
      expect(errorPaths({ ...s, assets: [riskyOf(s), riskyOf(s)] })).toContain('assets[1].id');
    });

    it('MarketSimulator nie jest tu wywoływany: żadne z powyższych nie rzuca wyjątku', () => {
      expect(() => validateScenario(withFx({ halfLifeYears: -1 }))).not.toThrow();
    });
  });
});
