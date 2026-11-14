import { describe, expect, it } from 'vitest';
import { Kernel } from '../kernel';
import type { PathSink } from '../kernel';
import { makeScenario } from '../testing/fixtures';
import type { AssetParams, RealEstateParams, RiskyAssetParams, Scenario } from '../types';
import { validateScenario } from '../validate';
import { realEstateSaleTax, rentalIncomeTax } from './realEstate';

class Rec implements PathSink {
  wealth: number[] = [];
  after: number[] = [];
  cpi: number[] = [];
  last: Float64Array = new Float64Array(0);
  ruinMonth = -2;
  constructor(private readonly k: Kernel) {}
  onGrid(_j: number, w: number, a: number, c: number): void {
    this.wealth.push(w);
    this.after.push(a);
    this.cpi.push(c);
    this.last = Float64Array.from(this.k.positionValues());
  }
  onEnd(r: number): void {
    this.ruinMonth = r;
  }
  get end(): number {
    return this.wealth[this.wealth.length - 1]!;
  }
}

const flat = (o: Partial<RealEstateParams> = {}): RealEstateParams => ({
  kind: 'realEstate',
  id: 'flat',
  netRentYield: 0.035,
  realGrowth: 0.01,
  sigma: 0,
  se: 0,
  alpha: 0,
  b: 1,
  ...o,
});

/** Scenariusz: jedna nieruchomość (czynniki: nieruchomość, cpi), inflacja deterministyczna (x = 3,5%). */
function homeScenario(o: Partial<RealEstateParams>, over: Partial<Scenario> = {}, value = 1_000_000): Scenario {
  const base = makeScenario();
  return makeScenario({
    assets: [flat(o)],
    positions: [{ assetId: 'flat', wrapper: 'taxable', value, costBasis: value, targetWeight: 0 }],
    market: {
      ...base.market,
      factorIds: ['flat', 'cpi'],
      inflation: { ...base.market.inflation, sigmaEta: 0, meanSe: 0 },
    },
    horizonMonths: 12,
    ...over,
  });
}

const growthM = (o: Partial<RealEstateParams> = {}): number => Math.exp((0.035 + Math.log1p(o.realGrowth ?? 0.01)) / 12);

describe('rentalIncomeTax (ryczałt 8,5% / 12,5%)', () => {
  it('poniżej progu 8,5%', () => {
    expect(rentalIncomeTax(0, 10_000)).toBeCloseTo(850, 9);
  });
  it('powyżej progu 12,5%', () => {
    expect(rentalIncomeTax(100_000, 10_000)).toBeCloseTo(1250, 9);
  });
  it('przychód przekraczający próg w jednym kroku dzieli się na obie stawki', () => {
    expect(rentalIncomeTax(95_000, 10_000)).toBeCloseTo(5000 * 0.085 + 5000 * 0.125, 9);
  });
});

describe('realEstateSaleTax (19% od zysku, zwolnienie po 5 latach podatkowych)', () => {
  it('sprzedaż w roku zakupu + 5 jest jeszcze opodatkowana, w + 6 zwolniona', () => {
    expect(realEstateSaleTax(0.19, 200_000, 2020, 2025)).toBeCloseTo(38_000, 9);
    expect(realEstateSaleTax(0.19, 200_000, 2020, 2026)).toBe(0);
  });
  it('strata: bez podatku', () => {
    expect(realEstateSaleTax(0.19, -5_000, 2024, 2025)).toBe(0);
    expect(realEstateSaleTax(0.19, -5_000, undefined, 2025)).toBe(0);
  });
  it('brak roku zakupu: konserwatywnie bez zwolnienia (19% od zysku), nie po cichu zwolnione', () => {
    expect(realEstateSaleTax(0.19, 200_000, undefined, 2025)).toBeCloseTo(38_000, 9);
    expect(realEstateSaleTax(0.19, 200_000, undefined, 2060)).toBeCloseTo(38_000, 9);
  });
});

describe('Kernel: nieruchomość na wynajem', () => {
  it('wartość rośnie o inflację + 1% (realnie dokładnie ln(1,01)/rok), niezależnie od ścieżki inflacji', () => {
    const base = makeScenario();
    const s = homeScenario(
      { netRentYield: 0 },
      { horizonMonths: 36, market: { ...base.market, factorIds: ['flat', 'cpi'], inflation: { ...base.market.inflation, sigmaEta: 0.01, meanSe: 0 } } },
    );
    const k = new Kernel(s);
    for (const p of [0, 1, 2]) {
      const r = new Rec(k);
      k.simulate(7, p, r);
      const realLog = Math.log(r.end / 1_000_000) - r.cpi[r.cpi.length - 1]!;
      expect(realLog).toBeCloseTo((3 * Math.log1p(0.01)), 9);
    }
  });

  it('czynsz 3,5% wartości rocznie trafia co miesiąc do gotówki po ryczałcie 8,5%', () => {
    const s = homeScenario({}, { tax: { kind: 'pl' } });
    const k = new Kernel(s);
    const r = new Rec(k);
    k.simulate(1, 0, r);
    const g = growthM();
    let v = 1_000_000;
    let cash = 0;
    let gross = 0;
    for (let t = 0; t < 12; t++) {
      const rent = (v * 0.035) / 12;
      gross += rent;
      cash += rent * (1 - 0.085);
      v *= g;
    }
    expect(r.last[0]).toBeCloseTo(v, 6);
    expect(r.end).toBeCloseTo(v + cash, 6);
    expect(k.ledger.taxesPaid).toBeCloseTo(gross * 0.085, 6);
    expect(k.ledger.marketGains).toBeCloseTo(v - 1_000_000 + gross, 6);
  });

  it('powyżej 100 000 zł przychodu rocznie stawka 12,5%, próg zerowany co rok', () => {
    const s = homeScenario({}, { tax: { kind: 'pl' }, horizonMonths: 24 }, 5_000_000);
    const k = new Kernel(s);
    const r = new Rec(k);
    k.simulate(1, 0, r);
    const g = growthM();
    let v = 5_000_000;
    let tax = 0;
    let cum = 0;
    for (let t = 0; t < 24; t++) {
      if (t % 12 === 0) cum = 0;
      const rent = (v * 0.035) / 12;
      const low = Math.max(0, Math.min(rent, 100_000 - cum));
      tax += 0.085 * low + 0.125 * (rent - low);
      cum += rent;
      v *= g;
    }
    expect(k.ledger.taxesPaid).toBeCloseTo(tax, 5);
    expect(tax / (k.ledger.marketGains - (v - 5_000_000))).toBeGreaterThan(0.1); // faktycznie przekroczono próg
  });

  it('tryb bez podatków: czynsz brutto', () => {
    const k = new Kernel(homeScenario({}));
    const r = new Rec(k);
    k.simulate(1, 0, r);
    expect(k.ledger.taxesPaid).toBe(0);
    expect(r.end).toBeGreaterThan(r.last[0]! + 30_000);
  });

  it('nie bierze udziału w rebalansie ani w allocateOutflow', () => {
    const base = makeScenario();
    const eq = base.assets[0]!;
    const dep: AssetParams = { kind: 'deposit', id: 'dep', k: 0, spread: 0, initialRate: 0.02 };
    const s = makeScenario({
      assets: [eq, dep, flat({ netRentYield: 0 })],
      positions: [
        { assetId: 'globalEquity', wrapper: 'taxable', value: 100_000, costBasis: 100_000, targetWeight: 0.5 },
        { assetId: 'dep', wrapper: 'taxable', value: 100_000, costBasis: 100_000, targetWeight: 0.5 },
        { assetId: 'flat', wrapper: 'taxable', value: 1_000_000, costBasis: 1_000_000, targetWeight: 0.9 },
      ],
      market: {
        ...base.market,
        factorIds: ['globalEquity', 'flat', 'cpi'],
        correlation: [1, 0.2, 0.1, 0.2, 1, 0.1, 0.1, 0.1, 1],
        inflation: { ...base.market.inflation, sigmaEta: 0, meanSe: 0 },
      },
      horizonMonths: 36,
      rebalance: { kind: 'annual' },
      withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 3000 },
      contribution: { monthly: 2000, endMonth: 36, indexation: 'none', realGrowth: 0 },
    });
    const k = new Kernel(s);
    for (let p = 0; p < 20; p++) {
      const r = new Rec(k);
      k.simulate(11, p, r);
      expect(r.last[2]).toBeGreaterThan(0);
      // sigma = 0 i brak transakcji: wartość to dokładnie dryf (x + ln 1,01)/12 przez 36 miesięcy
      expect(Math.log(r.last[2]! / 1_000_000)).toBeCloseTo(36 * ((0.035 + Math.log1p(0.01)) / 12), 9);
    }
  });

  it('wypłata pokrywana z płynnych aktywów, nieruchomość nietknięta; brak płynnych = ruina', () => {
    const base = makeScenario();
    const dep: AssetParams = { kind: 'deposit', id: 'dep', k: 0, spread: 0, initialRate: 0 };
    const mk = (depValue: number): Scenario =>
      makeScenario({
        assets: [dep, flat({ netRentYield: 0 })],
        positions: [
          { assetId: 'dep', wrapper: 'taxable', value: depValue, costBasis: depValue, targetWeight: 1 },
          { assetId: 'flat', wrapper: 'taxable', value: 1_000_000, costBasis: 1_000_000, targetWeight: 0 },
        ],
        market: { ...base.market, factorIds: ['flat', 'cpi'], inflation: { ...base.market.inflation, sigmaEta: 0, meanSe: 0 } },
        horizonMonths: 12,
        withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 1000 },
      });
    const ok = new Kernel(mk(100_000));
    const r1 = new Rec(ok);
    ok.simulate(1, 0, r1);
    expect(r1.ruinMonth).toBe(-1);
    expect(Math.log(r1.last[1]! / 1_000_000)).toBeCloseTo(12 * ((0.035 + Math.log1p(0.01)) / 12), 9);
    expect(r1.last[0]!).toBeLessThan(100_000 - 12_000);
    const bad = new Kernel(mk(2_000));
    const r2 = new Rec(bad);
    bad.simulate(1, 0, r2);
    expect(r2.ruinMonth).toBeGreaterThanOrEqual(0); // nieruchomość nie jest częściowo sprzedawana, więc płynne środki się kończą
    expect(bad.ledger.shortfall).toBeGreaterThan(0);
  });

  it('sprzedaż w roku X: do 5 lat po zakupie 19% od zysku (płatne w kwietniu następnego roku), później bez podatku', () => {
    const run = (purchaseYear: number): { k: Kernel; r: Rec } => {
      const s = homeScenario({ netRentYield: 0, purchaseYear, saleYear: 2028 }, { tax: { kind: 'pl' }, horizonMonths: 72 }, 1_000_000);
      s.positions[0]!.costBasis = 600_000;
      const k = new Kernel(s);
      const r = new Rec(k);
      k.simulate(1, 0, r);
      return { k, r };
    };
    const early = run(2024);
    const g = growthM();
    const valueAtSale = 1_000_000 * Math.pow(g, 24); // styczeń 2028 = miesiąc 24
    expect(early.k.ledger.taxesPaid).toBeCloseTo(0.19 * (valueAtSale - 600_000), 5);
    const late = run(2020);
    expect(late.k.ledger.taxesPaid).toBe(0);
    // po sprzedaży pozycja = 0, a środki leżą w gotówce
    expect(early.r.last[0]).toBe(0);
    expect(late.r.end).toBeCloseTo(valueAtSale, 4);
    expect(early.r.end).toBeCloseTo(valueAtSale - 0.19 * (valueAtSale - 600_000), 5);
  });

  it('wartość po podatku uwzględnia podatek od sprzedaży nieruchomości, gdyby sprzedać dziś', () => {
    const s = homeScenario({ netRentYield: 0, purchaseYear: 2025 }, { tax: { kind: 'pl' }, horizonMonths: 12 }, 1_000_000);
    s.positions[0]!.costBasis = 500_000;
    const k = new Kernel(s);
    const r = new Rec(k);
    k.simulate(1, 0, r);
    expect(r.after[0]).toBeCloseTo(1_000_000 - 0.19 * 500_000, 6);
    expect(r.after[0]!).toBeLessThan(r.wealth[0]!);
  });

  it('wartość po podatku bez roku zakupu nie zakłada zwolnienia (tak jak przy zakupie sprzed roku)', () => {
    const run = (purchaseYear: number | undefined): number => {
      const s = homeScenario({ netRentYield: 0, ...(purchaseYear === undefined ? {} : { purchaseYear }) }, { tax: { kind: 'pl' }, horizonMonths: 12 }, 1_000_000);
      s.positions[0]!.costBasis = 500_000;
      const k = new Kernel(s);
      const r = new Rec(k);
      k.simulate(1, 0, r);
      return r.after[0]!;
    };
    const taxed = 1_000_000 - 0.19 * 500_000;
    expect(run(undefined)).toBeCloseTo(taxed, 6);
    expect(run(2025)).toBeCloseTo(taxed, 6);
    expect(run(2000)).toBeCloseTo(1_000_000, 6); // zwolnione po 5 latach: bez podatku
  });

  describe('baza wypłat zależnych od majątku to majątek płynny (bez niepłynnej nieruchomości)', () => {
    const withdrawalYear1 = (w: Scenario['withdrawal'], reValue: number): number => {
      const base = makeScenario();
      const dep: AssetParams = { kind: 'deposit', id: 'dep', k: 0, spread: 0, initialRate: 0 };
      const s = makeScenario({
        assets: [dep, flat({ netRentYield: 0, purchaseYear: 2000 })],
        positions: [
          { assetId: 'dep', wrapper: 'taxable', value: 100_000, costBasis: 100_000, targetWeight: 1 },
          { assetId: 'flat', wrapper: 'taxable', value: reValue, costBasis: reValue, targetWeight: 0 },
        ],
        market: { ...base.market, factorIds: ['flat', 'cpi'], inflation: { ...base.market.inflation, sigmaEta: 0, meanSe: 0 } },
        horizonMonths: 12,
        withdrawal: w,
      });
      const k = new Kernel(s);
      k.simulate(1, 0, new Rec(k));
      return k.ledger.withdrawals;
    };
    it('procent: 4% płynnych 100 000 zł, niezależnie od wartości mieszkania', () => {
      expect(withdrawalYear1({ kind: 'percent', startMonth: 0, rate: 0.04 }, 1_000_000)).toBeCloseTo(4_000, 6);
      expect(withdrawalYear1({ kind: 'percent', startMonth: 0, rate: 0.04 }, 0.01)).toBeCloseTo(4_000, 6);
    });
    it('Guyton–Klinger: stopa startowa od majątku płynnego', () => {
      const w = { kind: 'guytonKlinger', startMonth: 0, initialRate: 0.04, guardrail: 0.2, adjustment: 0.1, inflationCap: 0.06 } as const;
      expect(withdrawalYear1(w, 1_000_000)).toBeCloseTo(4_000, 6);
    });
    it('ABW: amortyzacja majątku płynnego', () => {
      const w = { kind: 'abw', startMonth: 0, expectedRealReturn: 0.02 } as const;
      expect(withdrawalYear1(w, 1_000_000)).toBeCloseTo(withdrawalYear1(w, 0.01), 6);
    });
  });

  it('T4: bilans księgi ≤ 1e-9 z nieruchomością, czynszem, sprzedażą, wypłatami i podatkiem pl', () => {
    const base = makeScenario();
    const eq = base.assets[0]!;
    const dep: AssetParams = { kind: 'deposit', id: 'dep', k: 0.5, spread: 0, initialRate: 0.03 };
    const s = makeScenario({
      assets: [{ ...(eq as RiskyAssetParams), taxForm: 'security', sigma: 0.2 }, dep, flat({ sigma: 0.1, se: 0.01, purchaseYear: 2024, saleYear: 2033 })],
      positions: [
        { assetId: 'globalEquity', wrapper: 'taxable', value: 80_000, costBasis: 60_000, targetWeight: 0.6 },
        { assetId: 'dep', wrapper: 'taxable', value: 30_000, costBasis: 30_000, targetWeight: 0.4 },
        { assetId: 'flat', wrapper: 'taxable', value: 700_000, costBasis: 450_000, targetWeight: 0 },
      ],
      market: {
        ...base.market,
        mode: 'realistic',
        nu: 5,
        factorIds: ['globalEquity', 'flat', 'cpi'],
        correlation: [1, 0.3, 0.1, 0.3, 1, 0.1, 0.1, 0.1, 1],
        uncertaintyScale: 1,
      },
      horizonMonths: 180,
      contribution: { monthly: 1500, endMonth: 120, indexation: 'cpi', realGrowth: 0 },
      withdrawal: { kind: 'fixedReal', startMonth: 60, monthly: 5000 },
      rebalance: { kind: 'annual' },
      tax: { kind: 'pl' },
    });
    const w0 = s.positions.reduce((a, p) => a + p.value, 0);
    const k = new Kernel(s);
    let worst = 0;
    let ruins = 0;
    for (let p = 0; p < 300; p++) {
      const r = new Rec(k);
      k.simulate(20_261_114, p, r);
      const l = k.ledger;
      const rhs = w0 + l.marketGains + l.contributions - l.withdrawals - l.taxesPaid - l.fees - l.costs;
      worst = Math.max(worst, Math.abs(r.end - rhs) / w0);
      if (r.ruinMonth >= 0) ruins++;
      expect(Number.isFinite(r.end)).toBe(true);
    }
    expect(worst).toBeLessThan(1e-9);
    expect(ruins).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe('validateScenario: nieruchomość', () => {
  const bad = (o: Partial<RealEstateParams>): string[] => {
    const v = validateScenario(homeScenario(o));
    return v.ok ? [] : v.errors.map((e) => e.path);
  };
  it('poprawny scenariusz przechodzi', () => {
    expect(validateScenario(homeScenario({})).ok).toBe(true);
  });
  it('odrzuca ujemny czynsz, g ≤ -1, ujemne σ, b poza 0..1', () => {
    expect(bad({ netRentYield: -0.01 })).toContain('assets[0].netRentYield');
    expect(bad({ realGrowth: -1 })).toContain('assets[0].realGrowth');
    expect(bad({ sigma: -1 })).toContain('assets[0].sigma');
    expect(bad({ b: 2 })).toContain('assets[0].b');
  });
  it('wymaga czynnika w factorIds oraz opakowania „taxable”', () => {
    const s = homeScenario({});
    const v1 = validateScenario({ ...s, market: { ...s.market, factorIds: ['cpi'], correlation: [1] } });
    expect(v1.ok).toBe(false);
    const v2 = validateScenario({ ...s, positions: [{ ...s.positions[0]!, wrapper: 'IKE' }] });
    expect(v2.ok).toBe(false);
  });
});
