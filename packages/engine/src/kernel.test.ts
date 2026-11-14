import { describe, expect, it } from 'vitest';
import { Kernel, buildGrid } from './kernel';
import type { PathSink } from './kernel';
import { makeScenario } from './testing/fixtures';
import type { AssetParams, MarketModel, Position, Scenario } from './types';

/** Sink zapisujący całą ścieżkę. */
class Rec implements PathSink {
  j: number[] = [];
  wealth: number[] = [];
  after: number[] = [];
  cpi: number[] = [];
  ruinMonth = -2;
  maxDrawdown = NaN;
  worst12 = NaN;
  twr = NaN;
  onGrid(j: number, w: number, a: number, c: number): void {
    this.j.push(j);
    this.wealth.push(w);
    this.after.push(a);
    this.cpi.push(c);
  }
  onEnd(r: number, d: number, w12: number, t: number): void {
    this.ruinMonth = r;
    this.maxDrawdown = d;
    this.worst12 = w12;
    this.twr = t;
  }
  get last(): number {
    return this.wealth[this.wealth.length - 1]!;
  }
}

/** Rynek bez losowości inflacji: cpiLog_t = t·x0/12. */
function detMarket(base: MarketModel): MarketModel {
  return { ...base, inflation: { ...base.inflation, sigmaEta: 0, meanSe: 0 } };
}

function singleAsset(o: { g?: number; sigma?: number; ter?: number; costBps?: number; taxForm?: 'security' | 'crypto' | 'physicalGold' | 'none' } = {}): AssetParams[] {
  return [
    {
      kind: 'risky',
      id: 'globalEquity',
      currency: 'PLN',
      g: o.g ?? 0.06,
      sigma: o.sigma ?? 0,
      se: 0,
      alpha: 0,
      b: 1,
      ter: o.ter ?? 0,
      costBps: o.costBps ?? 0,
      taxForm: o.taxForm ?? 'none',
    },
  ];
}

describe('buildGrid', () => {
  it('liczba punktów wg spec 4.14', () => {
    expect(buildGrid(120).length).toBe(121);
    expect(buildGrid(480).length).toBe(161);
    expect(buildGrid(960).length).toBe(161);
  });
  it('zawiera 0 i horyzont, rośnie ściśle', () => {
    for (const h of [1, 7, 120, 121, 125, 480, 481, 700, 960]) {
      const g = buildGrid(h);
      expect(g[0]).toBe(0);
      expect(g[g.length - 1]).toBe(h);
      for (let i = 1; i < g.length; i++) expect(g[i]!).toBeGreaterThan(g[i - 1]!);
      expect(g.length).toBeLessThanOrEqual(161);
    }
  });
  it('krok: miesięczny, kwartalny, półroczny', () => {
    expect(Array.from(buildGrid(120).slice(0, 3))).toEqual([0, 1, 2]);
    expect(Array.from(buildGrid(240).slice(0, 3))).toEqual([0, 3, 6]);
    expect(Array.from(buildGrid(720).slice(0, 3))).toEqual([0, 6, 12]);
    expect(Array.from(buildGrid(125).slice(-3))).toEqual([120, 123, 125]);
  });
});

describe('buildGrid: dodatkowe miesiące (rozszerzenie spec 4.14: miesiąc celu)', () => {
  it('dołącza miesiąc spoza siatki, zachowując porządek i unikalność', () => {
    const g = Array.from(buildGrid(240, [100]));
    expect(g).toContain(100);
    expect(g.filter((x) => x === 100).length).toBe(1);
    for (let i = 1; i < g.length; i++) expect(g[i]!).toBeGreaterThan(g[i - 1]!);
    expect(g.length).toBe(buildGrid(240).length + 1);
  });
  it('miesiąc już na siatce, 0, horyzont i spoza zakresu nie zmieniają siatki', () => {
    const base = Array.from(buildGrid(240));
    expect(Array.from(buildGrid(240, [99]))).toEqual(base);
    expect(Array.from(buildGrid(240, [0, 240, 241, -3, 1.5]))).toEqual(base);
  });
  it('kernel dodaje goal.month do siatki', () => {
    const k = new Kernel(makeScenario({ horizonMonths: 240, goal: { amountReal: 1, month: 100 } }));
    expect(Array.from(k.grid)).toEqual(Array.from(buildGrid(240, [100])));
    const r = new Rec();
    k.simulate(1, 0, r);
    expect(r.j.length).toBe(k.grid.length);
  });
});

describe('Kernel: konstruktor', () => {
  it('rzuca dla niepoprawnego scenariusza', () => {
    expect(() => new Kernel(makeScenario({ horizonMonths: 0 }))).toThrow();
  });
  it('grid zgodny z buildGrid', () => {
    const k = new Kernel(makeScenario({ horizonMonths: 240 }));
    expect(Array.from(k.grid)).toEqual(Array.from(buildGrid(240)));
  });
});

describe('Kernel: T2 (zwrot i koszty)', () => {
  it('σ = 0: wealth końcowy = W0·(1+g)^10·(1−TER)^10', () => {
    const s = makeScenario({ assets: singleAsset({ g: 0.065, ter: 0.002 }) });
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(1, 0, r);
    const expected = 100_000 * Math.pow(1.065, 10) * Math.pow(0.998, 10);
    expect(Math.abs(r.last - expected) / expected).toBeLessThan(1e-12);
    expect(r.j.length).toBe(121);
    expect(r.wealth[0]).toBe(100_000);
    expect(r.ruinMonth).toBe(-1);
  });

  it('gbm σ = 0,16, 20 000 ścieżek: mediana końcowa w 99,99% CI wokół W0·1,065^10', () => {
    const s = makeScenario({ assets: singleAsset({ g: 0.065, sigma: 0.16 }) });
    const k = new Kernel(s);
    const n = 20_000;
    const ends = new Float64Array(n);
    const r = new Rec();
    for (let p = 0; p < n; p++) {
      r.wealth.length = 0;
      r.j.length = 0;
      r.after.length = 0;
      r.cpi.length = 0;
      k.simulate(20_261_113, p, r);
      ends[p] = r.last;
    }
    ends.sort();
    const median = (ends[n / 2 - 1]! + ends[n / 2]!) / 2;
    const target = 100_000 * Math.pow(1.065, 10);
    const sdLog = 0.16 * Math.sqrt(10);
    const se = (1.2533 * sdLog) / Math.sqrt(n);
    expect(Math.abs(Math.log(median / target))).toBeLessThan(3.89 * se);
  }, 60_000);
});

describe('Kernel: kolejność zdarzeń', () => {
  it('wypłata w miesiącu 0 pomniejsza kapitał przed pierwszym zwrotem (σ = 0, 3 miesiące)', () => {
    const base = makeScenario();
    const s = makeScenario({
      horizonMonths: 3,
      assets: singleAsset({ g: 0.06 }),
      market: detMarket(base.market),
      withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 1000 },
    });
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(7, 0, r);
    const m = Math.pow(1.06, 1 / 12);
    const cpi = (t: number): number => Math.exp((t * 0.035) / 12);
    const w1 = (100_000 - 1000 * cpi(0)) * m;
    const w2 = (w1 - 1000 * cpi(1)) * m;
    const w3 = (w2 - 1000 * cpi(2)) * m;
    expect(r.wealth[1]).toBeCloseTo(w1, 8);
    expect(r.wealth[2]).toBeCloseTo(w2, 8);
    expect(r.wealth[3]).toBeCloseTo(w3, 8);
    expect(k.ledger.withdrawals).toBeCloseTo(1000 * (cpi(0) + cpi(1) + cpi(2)), 8);
    expect(r.cpi[3]).toBeCloseTo((3 * 0.035) / 12, 12);
  });

  it('onJanuary także w t = start poza styczniem: percent wypłaca od pierwszego miesiąca', () => {
    const s = makeScenario({
      startMonth: 7,
      horizonMonths: 1,
      assets: singleAsset({ g: 0 }),
      withdrawal: { kind: 'percent', startMonth: 0, rate: 0.12 },
    });
    const k = new Kernel(s);
    k.simulate(1, 0, new Rec());
    expect(k.ledger.withdrawals).toBeCloseTo(1000, 9); // 12% · 100 000 / 12
  });

  it('podatek: sprzedaż z zyskiem w 2027 → taxesPaid rośnie dopiero w kwietniu 2028', () => {
    const mk = (horizonMonths: number): Scenario =>
      makeScenario({
        startYear: 2027,
        startMonth: 1,
        horizonMonths,
        assets: singleAsset({ g: 0.06, taxForm: 'security' }),
        positions: [{ assetId: 'globalEquity', wrapper: 'taxable', value: 100_000, costBasis: 50_000, targetWeight: 1 }],
        withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 4000 },
        tax: { kind: 'pl' },
      });
    const kBefore = new Kernel(mk(15)); // ostatni miesiąc = marzec 2028
    const rb = new Rec();
    kBefore.simulate(3, 0, rb);
    expect(kBefore.ledger.taxesPaid).toBe(0);
    // zobowiązanie już naliczone: wartość po podatku wyraźnie niższa
    expect(rb.after[12]!).toBeLessThan(rb.wealth[12]! - 500);

    const kAfter = new Kernel(mk(16)); // t = 15 to kwiecień 2028
    kAfter.simulate(3, 0, new Rec());
    expect(kAfter.ledger.taxesPaid).toBeGreaterThan(500);
  });

  it('wealthAfterTax ≤ wealth zawsze; równe przy tax none', () => {
    const base = makeScenario();
    const mkPl = (tax: Scenario['tax']): Scenario =>
      makeScenario({
        horizonMonths: 96,
        assets: singleAsset({ g: 0.07, sigma: 0.2, ter: 0.002, costBps: 10, taxForm: 'security' }),
        positions: [{ assetId: 'globalEquity', wrapper: 'taxable', value: 100_000, costBasis: 60_000, targetWeight: 1 }],
        contribution: { monthly: 500, endMonth: 60, indexation: 'none', realGrowth: 0 },
        withdrawal: { kind: 'fixedReal', startMonth: 48, monthly: 2000 },
        tax,
        market: { ...base.market, mode: 'realistic' },
      });
    for (const tax of [{ kind: 'pl' }, { kind: 'flat', rate: 0.2 }, { kind: 'none' }] as Scenario['tax'][]) {
      const k = new Kernel(mkPl(tax));
      for (let p = 0; p < 30; p++) {
        const r = new Rec();
        k.simulate(11, p, r);
        for (let i = 0; i < r.wealth.length; i++) {
          if (tax.kind === 'none') expect(r.after[i]).toBe(r.wealth[i]);
          else expect(r.after[i]!).toBeLessThanOrEqual(r.wealth[i]!);
        }
      }
    }
  });
});

describe('Kernel: ruina i obsunięcie', () => {
  it('fixedReal większe niż portfel → ruinMonth ≥ 0, wealth = 0 do końca, shortfall > 0, brak NaN', () => {
    const s = makeScenario({
      horizonMonths: 24,
      assets: singleAsset({ g: 0.06, sigma: 0.15, costBps: 10 }),
      withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 30_000 },
    });
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(5, 2, r);
    expect(r.ruinMonth).toBeGreaterThanOrEqual(0);
    expect(r.ruinMonth).toBeLessThanOrEqual(4);
    for (let i = r.ruinMonth + 1; i < r.wealth.length; i++) {
      expect(r.wealth[i]).toBe(0);
      expect(r.after[i]).toBe(0);
    }
    expect(k.ledger.shortfall).toBeGreaterThan(0);
    for (const v of [...r.wealth, ...r.after, ...r.cpi, r.maxDrawdown, r.worst12, r.twr]) expect(Number.isFinite(v)).toBe(true);
    // każda wypłata to albo wypłacone, albo niedobór: suma = Σ żądań (30 000·CPI)
    let demanded = 0;
    for (let t = 0; t < 24; t++) demanded += 30_000 * Math.exp(r.cpi[t]!);
    // cpi na siatce jest miesięczne, a żądanie w miesiącu t używa cpiLog z początku miesiąca t
    expect(k.ledger.withdrawals + k.ledger.shortfall).toBeCloseTo(demanded, 6);
  });

  it('σ = 0 i g > 0 → maxDrawdown === 0 mimo wypłat (liczone na indeksie TWR)', () => {
    const base = makeScenario();
    const s = makeScenario({
      horizonMonths: 120,
      assets: singleAsset({ g: 0.05, ter: 0.002 }),
      market: detMarket(base.market),
      contribution: { monthly: 300, endMonth: 30, indexation: 'none', realGrowth: 0 },
      withdrawal: { kind: 'fixedReal', startMonth: 12, monthly: 500 },
    });
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(1, 0, r);
    expect(r.maxDrawdown).toBe(0);
    expect(r.worst12).toBeGreaterThan(0);
    expect(r.twr).toBeCloseTo(10 * Math.log(1.05 * 0.998), 9);
  });

  it('σ > 0: maxDrawdown ∈ (0, 1), najgorsze 12 miesięcy ujemne na niektórej ścieżce', () => {
    const s = makeScenario({ horizonMonths: 120, assets: singleAsset({ g: 0.05, sigma: 0.3 }) });
    const k = new Kernel(s);
    let anyNeg = false;
    for (let p = 0; p < 20; p++) {
      const r = new Rec();
      k.simulate(2, p, r);
      expect(r.maxDrawdown).toBeGreaterThan(0);
      expect(r.maxDrawdown).toBeLessThan(1);
      if (r.worst12 < 0) anyNeg = true;
    }
    expect(anyNeg).toBe(true);
  });
});

describe('Kernel: CRN i determinizm', () => {
  it('zmiana withdrawal.monthly nie zmienia twrLog ani CPI (polityka none, bez podatków)', () => {
    const mk = (monthly: number): Scenario =>
      makeScenario({
        horizonMonths: 120,
        assets: singleAsset({ g: 0.06, sigma: 0.16, ter: 0.002, costBps: 10 }),
        withdrawal: { kind: 'fixedReal', startMonth: 12, monthly },
      });
    const a = new Rec();
    const b = new Rec();
    new Kernel(mk(300)).simulate(9, 4, a);
    new Kernel(mk(900)).simulate(9, 4, b);
    expect(a.ruinMonth).toBe(-1);
    expect(b.ruinMonth).toBe(-1);
    expect(a.twr).toBeCloseTo(b.twr, 11);
    expect(a.maxDrawdown).toBeCloseTo(b.maxDrawdown, 11);
    expect(a.cpi).toEqual(b.cpi);
    expect(a.last).toBeGreaterThan(b.last);
  });

  it('ponowne simulate na tej samej instancji daje identyczny wynik', () => {
    const s = makeFull(180);
    const k = new Kernel(s);
    const a = new Rec();
    const b = new Rec();
    k.simulate(5, 3, a);
    k.simulate(5, 99, new Rec());
    k.simulate(5, 3, b);
    expect(b.wealth).toEqual(a.wealth);
    expect(b.after).toEqual(a.after);
    expect(b.twr).toBe(a.twr);
  });
});

describe('Kernel: skrajne parametry (Review Focus 3)', () => {
  const extreme = (horizonMonths: number): Scenario => {
    const base = makeScenario();
    return makeScenario({
      horizonMonths,
      assets: [
        {
          kind: 'risky',
          id: 'globalEquity',
          currency: 'PLN',
          g: -0.99,
          sigma: 0.6,
          se: 0.1,
          alpha: 1,
          b: 1,
          ter: 0.01,
          costBps: 30,
          taxForm: 'security',
          collapse: { hazard: 1, loss: 0.95 },
        },
      ],
      market: { ...base.market, mode: 'realistic', nu: 3, uncertaintyScale: 1 },
      contribution: { monthly: 1000, endMonth: 5000, indexation: 'cpi', realGrowth: 0 },
      rebalance: { kind: 'annual' },
      tax: { kind: 'pl' },
    });
  };
  for (const h of [1, 960]) {
    it(`horyzont ${h}: wyniki skończone na 200 ścieżkach`, () => {
      const k = new Kernel(extreme(h));
      const r = new Rec();
      for (let p = 0; p < 200; p++) {
        r.wealth.length = r.after.length = r.cpi.length = r.j.length = 0;
        k.simulate(13, p, r);
        for (const v of [...r.wealth, ...r.after, ...r.cpi, r.maxDrawdown, r.worst12, r.twr]) expect(Number.isFinite(v)).toBe(true);
        for (const v of Object.values(k.ledger)) expect(Number.isFinite(v)).toBe(true);
        expect(r.wealth.length).toBe(k.grid.length);
      }
    }, 60_000);
  }
  it('wypłaty zaczynające się po horyzoncie nic nie wypłacają', () => {
    const s = makeScenario({ horizonMonths: 12, withdrawal: { kind: 'fixedReal', startMonth: 500, monthly: 1000 } });
    const k = new Kernel(s);
    k.simulate(1, 0, new Rec());
    expect(k.ledger.withdrawals).toBe(0);
    expect(k.ledger.shortfall).toBe(0);
  });
  it('pusty portfel nie daje NaN', () => {
    const s = makeScenario({ positions: [], contribution: { monthly: 100, endMonth: 12, indexation: 'none', realGrowth: 0 } });
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(1, 0, r);
    expect(Number.isFinite(r.last)).toBe(true);
    expect(r.last).toBeCloseTo(100 * 13, 6); // wpłaty w miesiącach 0..12 trafiają do gotówki
  });
});

describe('Kernel: EDO jako ostatnie źródło wypłaty', () => {
  it('portfel tylko z EDO: wypłata przez wykup przedterminowy, opłata w costs', () => {
    const s = makeScenario({
      horizonMonths: 18,
      assets: [{ kind: 'edo', id: 'edo', firstYearRate: 0.06, margin: 0.015, earlyFeePer100: 3, onMaturity: 'roll' }],
      positions: [{ assetId: 'edo', wrapper: 'taxable', value: 100_000, costBasis: 100_000, targetWeight: 0 }],
      market: { ...makeScenario().market, factorIds: ['cpi'], correlation: [1] },
      withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 1000 },
      tax: { kind: 'pl' },
    });
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(1, 0, r);
    expect(r.ruinMonth).toBe(-1);
    expect(k.ledger.shortfall).toBe(0);
    expect(k.ledger.withdrawals).toBeGreaterThan(18_000);
    expect(k.ledger.costs).toBeGreaterThan(0);
    expect(k.ledger.taxesPaid).toBeGreaterThan(0);
    expect(k.ledger.marketGains).toBeGreaterThan(5000);
    expect(bilans(r, s, k)).toBeLessThan(1e-9);
  });
});

/** Scenariusz do T4: 2 aktywa ryzykowne + lokata + EDO, wpłaty, wypłaty, zdarzenia, rebalans, podatki pl. */
function makeFull(horizonMonths: number, withdrawal = 3000): Scenario {
  const base = makeScenario();
  const assets: AssetParams[] = [
    { kind: 'risky', id: 'eqA', currency: 'PLN', g: 0.06, sigma: 0.16, se: 0.02, alpha: 0.5, b: 1, ter: 0.002, costBps: 10, taxForm: 'security' },
    {
      kind: 'risky',
      id: 'cryp',
      currency: 'PLN',
      g: 0.08,
      sigma: 0.55,
      se: 0.05,
      alpha: 1,
      b: 1,
      ter: 0.001,
      costBps: 30,
      taxForm: 'crypto',
      collapse: { hazard: 0.05, loss: 0.9 },
      decay: { gInf: 0.04, tauG: 5, sigmaInf: 0.35, tauSigma: 8 },
    },
    { kind: 'deposit', id: 'lokata', k: 0.2, spread: -0.005, initialRate: 0.04 },
    { kind: 'edo', id: 'edo', firstYearRate: 0.06, margin: 0.015, earlyFeePer100: 3, onMaturity: 'roll' },
  ];
  const positions: Position[] = [
    { assetId: 'eqA', wrapper: 'taxable', value: 60_000, costBasis: 40_000, targetWeight: 0.5 },
    { assetId: 'eqA', wrapper: 'IKE', value: 5_000, costBasis: 5_000, targetWeight: 0.1 },
    { assetId: 'cryp', wrapper: 'taxable', value: 15_000, costBasis: 10_000, targetWeight: 0.15 },
    { assetId: 'lokata', wrapper: 'taxable', value: 15_000, costBasis: 15_000, targetWeight: 0.15 },
    { assetId: 'edo', wrapper: 'taxable', value: 20_000, costBasis: 20_000, targetWeight: 0 },
  ];
  return makeScenario({
    horizonMonths,
    assets,
    positions,
    market: {
      ...base.market,
      mode: 'realistic',
      nu: 5,
      factorIds: ['eqA', 'cryp', 'cpi'],
      correlation: [1, 0.4, 0.1, 0.4, 1, 0, 0.1, 0, 1],
      uncertaintyScale: 1,
    },
    contribution: { monthly: 1500, endMonth: 120, indexation: 'cpi', realGrowth: 0 },
    withdrawal: { kind: 'fixedReal', startMonth: 60, monthly: withdrawal },
    events: [
      { month: 30, amount: 20_000, real: true },
      { month: 70, amount: -15_000, real: false },
    ],
    rebalance: { kind: 'annual' },
    tax: { kind: 'pl' },
  });
}

/** Względny błąd bilansu księgi: |W_end − (W_start + zyski + wpłaty − wypłaty − podatki − opłaty − koszty)| / W_start. */
function bilans(r: Rec, s: Scenario, k: Kernel): number {
  const w0 = s.positions.reduce((a, p) => a + p.value, 0);
  const l = k.ledger;
  const rhs = w0 + l.marketGains + l.contributions - l.withdrawals - l.taxesPaid - l.fees - l.costs;
  return Math.abs(r.last - rhs) / w0;
}

describe('Kernel: T4 zgodność księgi', () => {
  const runMany = (s: Scenario, n: number): { worst: number; ruins: number } => {
    const k = new Kernel(s);
    let worst = 0;
    let ruins = 0;
    for (let p = 0; p < n; p++) {
      const r = new Rec();
      k.simulate(20_261_114, p, r);
      worst = Math.max(worst, bilans(r, s, k));
      if (r.ruinMonth >= 0) ruins++;
      expect(Number.isFinite(r.last)).toBe(true);
    }
    return { worst, ruins };
  };

  it('wpłaty, wypłaty fixedReal, rebalans annual, podatki pl, 2 aktywa + lokata + EDO, 500 ścieżek', () => {
    const { worst } = runMany(makeFull(180), 500);
    expect(worst).toBeLessThan(1e-9);
  }, 60_000);

  it('ten sam scenariusz z dużymi wypłatami (ruina i wykup EDO)', () => {
    const { worst, ruins } = runMany(makeFull(240, 9000), 300);
    expect(ruins).toBeGreaterThan(0);
    expect(worst).toBeLessThan(1e-9);
  }, 60_000);

  it('rebalans band i flows, podatek flat, wypłata percent i abw', () => {
    for (const [rebalance, tax, withdrawal] of [
      [{ kind: 'band', bandPp: 3 }, { kind: 'flat', rate: 0.19 }, { kind: 'percent', startMonth: 24, rate: 0.04 }],
      [{ kind: 'flows' }, { kind: 'none' }, { kind: 'abw', startMonth: 24, expectedRealReturn: 0.03 }],
    ] as [Scenario['rebalance'], Scenario['tax'], NonNullable<Scenario['withdrawal']>][]) {
      const s = { ...makeFull(180), rebalance, tax, withdrawal };
      const { worst } = runMany(s, 150);
      expect(worst).toBeLessThan(1e-9);
    }
  }, 60_000);

  it('ledger zawiera koszty, opłaty i podatki > 0 w scenariuszu pełnym', () => {
    const s = makeFull(180);
    const k = new Kernel(s);
    k.simulate(1, 1, new Rec());
    const l = k.ledger;
    expect(l.fees).toBeGreaterThan(0);
    expect(l.costs).toBeGreaterThan(0);
    expect(l.contributions).toBeGreaterThan(100_000);
    expect(l.withdrawals).toBeGreaterThan(0);
    expect(k.collapsed.length).toBe(s.assets.length);
  });
});

describe('Kernel: wykup EDO do gotówki', () => {
  it('onMaturity "cash" bez lokaty: gotówka bezprocentowa, bilans zgodny, EDO znika po 10 latach', () => {
    const full = makeFull(150, 0);
    const s: Scenario = {
      ...full,
      assets: full.assets.map((a) => (a.kind === 'edo' ? { ...a, onMaturity: 'cash' as const } : a)).filter((a) => a.kind !== 'deposit'),
      positions: full.positions.filter((p) => p.assetId !== 'lokata'),
      withdrawal: undefined,
    };
    const k = new Kernel(s);
    const r = new Rec();
    k.simulate(3, 0, r);
    expect(bilans(r, s, k)).toBeLessThan(1e-9);
    expect(k.ledger.taxesPaid).toBeGreaterThan(0);
  });
});

describe('Kernel: podatek utajony krypto i papierów (poprawki fazy 3)', () => {
  const crypto = (value: number, costBasis: number, tax: Scenario['tax'] = { kind: 'pl' }): Scenario =>
    makeScenario({
      horizonMonths: 3,
      assets: singleAsset({ g: 0, taxForm: 'crypto' }),
      positions: [{ assetId: 'globalEquity', wrapper: 'taxable', value, costBasis, targetWeight: 1 }],
      tax,
    });

  it('krypto: pozycja początkowa kupiona po koszcie nie ma podatku utajonego w t = 0', () => {
    const r = new Rec();
    new Kernel(crypto(10_000, 10_000)).simulate(1, 0, r);
    expect(r.wealth[0]).toBe(10_000);
    expect(r.after[0]!).toBeCloseTo(10_000, 6);
  });

  it('krypto: podatek utajony od zysku ponad koszt początkowy', () => {
    const r = new Rec();
    new Kernel(crypto(10_000, 4_000)).simulate(1, 0, r);
    expect(r.after[0]!).toBeCloseTo(10_000 - 0.19 * 6_000, 6);
  });

  it('krypto: koszt wyższy od wartości daje carry, brak podatku', () => {
    const r = new Rec();
    new Kernel(crypto(10_000, 15_000)).simulate(1, 0, r);
    expect(r.after[0]!).toBeCloseTo(10_000, 6);
  });
});
