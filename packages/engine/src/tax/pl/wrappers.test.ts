import { describe, expect, it } from 'vitest';
import { Kernel } from '../../kernel';
import type { PathSink } from '../../kernel';
import { makeScenario } from '../../testing/fixtures';
import type { Position, Scenario } from '../../types';
import { validateScenario } from '../../validate';
import {
  IKE_LIMIT_2026,
  IKE_LIMIT_2027,
  IKZE_LIMIT_2026,
  IKZE_LIMIT_2027,
  WrapperAccounts,
  defaultWrapperSettings,
  wrapperWithdrawalTax,
} from './wrappers';

describe('wrapperWithdrawalTax (reguły wypłat)', () => {
  it('IKE: po 60. roku życia bez podatku, wcześniej 19% od zysku (strata = 0)', () => {
    expect(wrapperWithdrawalTax('IKE', 20_000, 10_000, 60)).toBe(0);
    expect(wrapperWithdrawalTax('IKE', 20_000, 10_000, 59.99)).toBeCloseTo(1_900, 9);
    expect(wrapperWithdrawalTax('IKE', 8_000, 10_000, 40)).toBe(0);
  });
  it('IKZE: od 65. roku życia 10% od całej kwoty, wcześniej 19% od zysku', () => {
    expect(wrapperWithdrawalTax('IKZE', 20_000, 20_000, 65)).toBeCloseTo(2_000, 9);
    expect(wrapperWithdrawalTax('IKZE', 20_000, 10_000, 64.9)).toBeCloseTo(1_900, 9);
  });
  it('zwykłe konto nie podlega regułom opakowań', () => {
    expect(wrapperWithdrawalTax('taxable', 20_000, 10_000, 30)).toBe(0);
  });
});

describe('WrapperAccounts (limity roczne)', () => {
  const cfg = { ikeLimit: 28_260, ikzeLimit: 11_304, ikzeTaxRate: 0.12, age: 40, limitGrowth: 0.1 };
  it('przyjmuje wpłaty do limitu, reszta odrzucona; limit rośnie z płacami co rok', () => {
    const w = new WrapperAccounts(cfg, 2026, 0.045);
    w.reset();
    w.newMonth(2026);
    expect(w.admit('IKE', 20_000, 0)).toBe(20_000);
    expect(w.admit('IKE', 20_000, 0)).toBeCloseTo(8_260, 9);
    expect(w.admit('IKE', 1, 0)).toBe(0);
    w.newMonth(2027);
    expect(w.admit('IKE', 100_000, 0)).toBeCloseTo(28_260 * 1.1, 9);
  });
  it('środki wewnętrzne (przeniesienie w obrębie opakowania) nie zużywają limitu', () => {
    const w = new WrapperAccounts(cfg, 2026, 0.045);
    w.reset();
    w.newMonth(2026);
    expect(w.admit('IKE', 50_000, 15_000)).toBeCloseTo(15_000 + 28_260, 9);
    expect(w.lastInternal).toBe(15_000);
  });
  it('domyślny wzrost limitu (limitGrowth nieustawione) to przekazany parametr', () => {
    const w = new WrapperAccounts({ ...cfg, limitGrowth: undefined }, 2026, 0.045);
    w.reset();
    w.newMonth(2027);
    expect(w.admit('IKZE', 1e9, 0)).toBeCloseTo(11_304 * 1.045, 9);
  });
  it('zwrot IKZE: wpłata roku × stawka, jednorazowo w następnym roku', () => {
    const w = new WrapperAccounts(cfg, 2026, 0.045);
    w.reset();
    w.newMonth(2026);
    w.admit('IKZE', 10_000, 0);
    w.newMonth(2027);
    expect(w.takeRefund()).toBeCloseTo(1_200, 9);
    expect(w.takeRefund()).toBe(0);
    w.newMonth(2028);
    expect(w.takeRefund()).toBe(0);
  });
});

describe('defaultWrapperSettings', () => {
  it('limity 2026 i 2027 z tabeli, później rosną o podany wzrost', () => {
    expect(IKE_LIMIT_2026).toBe(28_260);
    expect(IKE_LIMIT_2027).toBe(30_099);
    expect(IKZE_LIMIT_2026).toBe(11_304);
    expect(IKZE_LIMIT_2027).toBe(12_039.6);
    expect(defaultWrapperSettings(2026, 35, 0.045)).toMatchObject({ ikeLimit: 28_260, ikzeLimit: 11_304, age: 35 });
    expect(defaultWrapperSettings(2027, 35, 0.045).ikeLimit).toBe(30_099);
    expect(defaultWrapperSettings(2029, 35, 0.045).ikeLimit).toBeCloseTo(30_099 * 1.045 ** 2, 6);
    expect(defaultWrapperSettings(2026, 35, 0.045).ikzeTaxRate).toBe(0.12);
  });
});

// --- kernel ---

class Rec implements PathSink {
  wealth: number[] = [];
  after: number[] = [];
  taxes = 0;
  vals: number[][] = [];
  constructor(private readonly k: Kernel) {}
  onGrid(_j: number, w: number, a: number): void {
    this.wealth.push(w);
    this.after.push(a);
    this.vals.push(Array.from(this.k.positionValues()));
  }
  onEnd(): void {
    this.taxes = this.k.ledger.taxesPaid;
  }
}

function run(s: Scenario): { rec: Rec; k: Kernel } {
  const k = new Kernel(s);
  const rec = new Rec(k);
  k.simulate(1, 0, rec);
  return { rec, k };
}

function det(over: Partial<Scenario> & { positions: Position[] }): Scenario {
  const base = makeScenario();
  const asset = { ...base.assets[0]!, g: 0, sigma: 0, ter: 0, costBps: 0, taxForm: 'security' as const };
  return makeScenario({
    assets: [asset],
    tax: { kind: 'pl' },
    market: { ...base.market, inflation: { ...base.market.inflation, sigmaEta: 0, meanSe: 0 } },
    horizonMonths: 12,
    ...over,
  });
}

const W = { ikeLimit: 28_260, ikzeLimit: 11_304, ikzeTaxRate: 0.12, age: 40, limitGrowth: 0 };
const pos = (wrapper: Position['wrapper'], value: number, costBasis: number, targetWeight: number): Position => ({
  assetId: 'globalEquity',
  wrapper,
  value,
  costBasis,
  targetWeight,
});
const last = <T>(a: T[]): T => a[a.length - 1]!;

describe('kernel: limity wpłat do IKE', () => {
  const contribution = { monthly: 5_000, endMonth: 24, indexation: 'none' as const, realGrowth: 0 };

  it('wpłaty ponad roczny limit 28 260 zł trafiają na rachunek opodatkowany', () => {
    const { rec } = run(det({ positions: [pos('IKE', 0, 0, 1), pos('taxable', 0, 0, 0)], contribution, wrappers: W }));
    const v = last(rec.vals);
    expect(v[0]).toBeCloseTo(28_260, 6);
    expect(v[1]).toBeCloseTo(60_000 - 28_260, 6);
  });

  it('limit rośnie co roku (limitGrowth) i zeruje się w nowym roku kalendarzowym', () => {
    const { rec } = run(
      det({ horizonMonths: 24, positions: [pos('IKE', 0, 0, 1), pos('taxable', 0, 0, 0)], contribution, wrappers: { ...W, limitGrowth: 0.1 } }),
    );
    expect(last(rec.vals)[0]).toBeCloseTo(28_260 + 28_260 * 1.1, 6);
    expect(last(rec.vals)[1]).toBeCloseTo(120_000 - 28_260 - 28_260 * 1.1, 6);
  });

  it('domyślny wzrost limitu to inflacja + 1%', () => {
    const base = makeScenario();
    const { rec } = run(
      det({
        horizonMonths: 24,
        positions: [pos('IKE', 0, 0, 1), pos('taxable', 0, 0, 0)],
        contribution,
        wrappers: { ikeLimit: 28_260, ikzeLimit: 11_304, ikzeTaxRate: 0.12, age: 40 },
      }),
    );
    const g = base.market.inflation.mean + 0.01;
    expect(last(rec.vals)[0]).toBeCloseTo(28_260 * (2 + g), 6);
  });

  it('bez ustawienia wrappers zachowanie bez zmian: brak limitów i podatku opakowań', () => {
    const { rec } = run(det({ positions: [pos('IKE', 0, 0, 1), pos('taxable', 0, 0, 0)], contribution }));
    expect(last(rec.vals)[0]).toBeCloseTo(60_000, 6);
    expect(last(rec.vals)[1]).toBe(0);
  });

  it('brak konta opodatkowanego tego samego aktywa: nadwyżka ląduje w gotówce', () => {
    const { rec } = run(det({ positions: [pos('IKE', 0, 0, 1)], contribution, wrappers: W }));
    expect(last(rec.vals)[0]).toBeCloseTo(28_260, 6);
    expect(last(rec.wealth)).toBeCloseTo(60_000, 6);
  });

  it('rebalans przenoszący środki do IKE też podlega limitowi', () => {
    const { rec } = run(
      det({ rebalance: { kind: 'annual' }, positions: [pos('taxable', 100_000, 100_000, 0), pos('IKE', 0, 0, 1)], wrappers: W }),
    );
    const v = last(rec.vals);
    expect(v[1]).toBeCloseTo(28_260, 6);
    expect(v[0]).toBeCloseTo(100_000 - 28_260, 6);
  });
});

describe('kernel: wypłaty z IKE', () => {
  const outflow = { events: [{ month: 1, amount: -20_000, real: false }] };

  it('po 60. roku życia bez podatku', () => {
    const { rec } = run(det({ horizonMonths: 6, ...outflow, positions: [pos('IKE', 100_000, 50_000, 1)], wrappers: { ...W, age: 60 } }));
    expect(last(rec.wealth)).toBeCloseTo(80_000, 6);
    expect(rec.taxes).toBe(0);
  });

  it('przed 60. rokiem życia 19% od zysku z wypłacanej części', () => {
    const { rec } = run(det({ horizonMonths: 6, ...outflow, positions: [pos('IKE', 100_000, 50_000, 1)], wrappers: { ...W, age: 40 } }));
    // wypłata 20 000 zł niesie koszt 10 000 zł (FIFO proporcjonalnie), zysk 10 000 zł, podatek 1 900 zł
    expect(last(rec.wealth)).toBeCloseTo(100_000 - 20_000 - 1_900, 6);
    expect(rec.taxes).toBeCloseTo(1_900, 6);
  });

  it('wartość po podatku uwzględnia podatek opakowania przy likwidacji', () => {
    const young = run(det({ positions: [pos('IKE', 100_000, 50_000, 1)], wrappers: { ...W, age: 40 } }));
    expect(last(young.rec.after)).toBeCloseTo(100_000 - 0.19 * 50_000, 6);
    const old = run(det({ positions: [pos('IKE', 100_000, 50_000, 1)], wrappers: { ...W, age: 60 } }));
    expect(last(old.rec.after)).toBeCloseTo(100_000, 6);
  });
});

describe('kernel: IKZE', () => {
  it('zwrot podatku wpłata × stawka w kwietniu następnego roku (tylko od kwoty w limicie)', () => {
    const { rec } = run(
      det({
        horizonMonths: 24,
        events: [{ month: 0, amount: 20_000, real: false }],
        positions: [pos('IKZE', 0, 0, 1), pos('taxable', 0, 0, 0)],
        wrappers: W,
      }),
    );
    // kwiecień 2027 = t 15, widoczny na siatce od miesiąca 16
    expect(rec.wealth[15]).toBeCloseTo(20_000, 6);
    expect(rec.wealth[16]).toBeCloseTo(20_000 + 0.12 * 11_304, 6);
    expect(last(rec.wealth)).toBeCloseTo(20_000 + 0.12 * 11_304, 6);
    expect(last(rec.vals)[0]).toBeCloseTo(11_304, 6);
    expect(rec.taxes).toBeCloseTo(-0.12 * 11_304, 6);
  });

  it('wypłata po 65. roku życia: 10% od całej kwoty', () => {
    const { rec } = run(
      det({ horizonMonths: 6, events: [{ month: 1, amount: -20_000, real: false }], positions: [pos('IKZE', 100_000, 100_000, 1)], wrappers: { ...W, age: 65 } }),
    );
    expect(last(rec.wealth)).toBeCloseTo(100_000 - 20_000 - 2_000, 6);
  });

  it('wypłata przed 65. rokiem życia: 19% od zysku', () => {
    const { rec } = run(
      det({ horizonMonths: 6, events: [{ month: 1, amount: -20_000, real: false }], positions: [pos('IKZE', 100_000, 50_000, 1)], wrappers: { ...W, age: 50 } }),
    );
    expect(last(rec.wealth)).toBeCloseTo(100_000 - 20_000 - 1_900, 6);
  });

  it('wartość po podatku po 65. roku życia: 90% wartości', () => {
    const { rec } = run(det({ positions: [pos('IKZE', 100_000, 100_000, 1)], wrappers: { ...W, age: 65 } }));
    expect(last(rec.after)).toBeCloseTo(90_000, 6);
  });
});

describe('walidacja wrappers', () => {
  const base = det({ positions: [pos('IKE', 1, 1, 1)] });
  it('akceptuje poprawne ustawienia i brak ustawień', () => {
    expect(validateScenario({ ...base, wrappers: W }).ok).toBe(true);
    expect(validateScenario(base).ok).toBe(true);
  });
  it('odrzuca ujemne limity, stawkę poza [0, 1), wiek poza 0..120 i wzrost ≤ -1', () => {
    for (const bad of [{ ikeLimit: -1 }, { ikzeLimit: NaN }, { ikzeTaxRate: 1 }, { ikzeTaxRate: -0.1 }, { age: -1 }, { age: 121 }, { limitGrowth: -1 }]) {
      const r = validateScenario({ ...base, wrappers: { ...W, ...bad } });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]!.path.startsWith('wrappers.')).toBe(true);
    }
  });
});
