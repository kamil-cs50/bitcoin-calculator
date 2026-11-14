import { describe, expect, it } from 'vitest';
import { Kernel } from '../kernel';
import type { PathSink } from '../kernel';
import { makeScenario } from '../testing/fixtures';
import type { Withdrawal } from '../types';
import { WithdrawalPolicy } from './withdrawals';

type GK = Extract<Withdrawal, { kind: 'guytonKlinger' }>;
const GK_DEFAULT: GK = { kind: 'guytonKlinger', startMonth: 0, initialRate: 0.05, guardrail: 0.2, adjustment: 0.1, inflationCap: 0.06 };
const lnr = (r: number) => Math.log(1 + r);

/**
 * Polityka po wypłacie startowej: W₀ = 1 000 000, stopa 5% -> roczna wypłata 50 000 (miesięcznie 4 166,67),
 * pasmo ochronne stopy: [4%, 6%]. Horyzont 360 mies., więc w t = 12 zostaje 29 lat.
 */
function started(w: GK = GK_DEFAULT, horizon = 360): WithdrawalPolicy {
  const p = new WithdrawalPolicy(w, horizon);
  p.onJanuary(0, 1_000_000, 0, 0, true);
  return p;
}
const annual = (p: WithdrawalPolicy, t: number, cpiLog: number) => p.amountAt(t, cpiLog) * 12;

describe('Guyton–Klinger: wypłata startowa', () => {
  it('initialRate · W, stała nominalnie w ciągu roku, zero przed startMonth', () => {
    const p = new WithdrawalPolicy({ ...GK_DEFAULT, startMonth: 24 }, 360);
    p.onJanuary(0, 1_000_000, 0, 0, true); // przed startem: nic nie ustala
    expect(p.amountAt(0, 0)).toBe(0);
    p.onJanuary(24, 800_000, 0, 0, true);
    expect(p.amountAt(23, 0)).toBe(0);
    for (let t = 24; t < 36; t++) expect(p.amountAt(t, t * 0.01)).toBeCloseTo(0.05 * 800_000 / 12, 9);
  });
  it('wywołanie startowe poza styczniem (isJanuary = false) też ustala wypłatę; kolejne takie wywołanie niczego nie ocenia', () => {
    const p = new WithdrawalPolicy({ ...GK_DEFAULT, startMonth: 5 }, 360);
    expect(p.needsStartCall(5)).toBe(true);
    expect(p.needsStartCall(6)).toBe(false);
    p.onJanuary(5, 1_000_000, 0, 0, false);
    expect(annual(p, 5, 0)).toBeCloseTo(50_000, 6);
    p.onJanuary(6, 100_000, lnr(0.2), lnr(-0.5), false);
    expect(annual(p, 6, 0)).toBeCloseTo(50_000, 6);
  });
  it('percent i abw nie wymagają wywołania startowego', () => {
    expect(new WithdrawalPolicy({ kind: 'percent', startMonth: 5, rate: 0.04 }, 360).needsStartCall(5)).toBe(false);
  });
});

describe('Guyton–Klinger: indeksacja inflacją', () => {
  it('wypłata rośnie o inflację z roku (3%), gdy stopa mieści się w paśmie', () => {
    const p = started();
    p.onJanuary(12, 1_000_000, lnr(0.03), lnr(0.1), true); // 51 500 / 1 000 000 = 5,15%
    expect(annual(p, 12, lnr(0.03))).toBeCloseTo(51_500, 6);
  });
  it('indeksacja nie wyższa niż 6%: inflacja 10% daje +6%', () => {
    const p = started();
    p.onJanuary(12, 1_000_000, lnr(0.1), 0, true); // 53 000 / 1 000 000 = 5,3%
    expect(annual(p, 12, 0)).toBeCloseTo(53_000, 6);
  });
  it('limit indeksacji jest parametrem', () => {
    const p = started({ ...GK_DEFAULT, inflationCap: 0.02 });
    p.onJanuary(12, 1_000_000, lnr(0.1), 0, true);
    expect(annual(p, 12, 0)).toBeCloseTo(51_000, 6);
  });
  it('po roku z ujemnym zwrotem i stopą > początkowej: brak indeksacji', () => {
    const p = started();
    // zwrot −5%, W = 980 000: stopa 50 000/980 000 = 5,10% > 5%, w paśmie -> wypłata bez zmian
    p.onJanuary(12, 980_000, lnr(0.03), lnr(-0.05), true);
    expect(annual(p, 12, 0)).toBeCloseTo(50_000, 6);
  });
  it('po roku z ujemnym zwrotem, ale stopa ≤ początkowej: indeksacja działa', () => {
    const p = started();
    // zwrot −1%, ale W = 1 050 000 (np. wpłaty): stopa 4,76% < 5% -> +3%, 51 500 / 1 050 000 = 4,90% (w paśmie)
    p.onJanuary(12, 1_050_000, lnr(0.03), lnr(-0.01), true);
    expect(annual(p, 12, 0)).toBeCloseTo(51_500, 6);
  });
  it('po roku z dodatnim zwrotem indeksacja działa mimo stopy > początkowej', () => {
    const p = started();
    p.onJanuary(12, 950_000, lnr(0.03), lnr(0.02), true); // 51 500 / 950 000 = 5,42%
    expect(annual(p, 12, 0)).toBeCloseTo(51_500, 6);
  });
  it('inflacja liczona od ostatniej oceny, nie od początku symulacji', () => {
    const p = started();
    p.onJanuary(12, 1_000_000, lnr(0.03), 0, true); // 51 500
    p.onJanuary(24, 1_000_000, lnr(0.03) + lnr(0.02), 0, true); // +2% -> 52 530
    expect(annual(p, 24, 0)).toBeCloseTo(52_530, 6);
  });
});

describe('Guyton–Klinger: reguła ochrony kapitału', () => {
  it('stopa > 120% początkowej (po indeksacji) tnie wypłatę o 10%', () => {
    const p = started();
    // zwrot dodatni -> indeksacja 3%: 51 500 / 800 000 = 6,4375% > 6% -> 51 500 · 0,9 = 46 350
    p.onJanuary(12, 800_000, lnr(0.03), lnr(0.05), true);
    expect(annual(p, 12, 0)).toBeCloseTo(46_350, 6);
  });
  it('po ujemnym zwrocie: brak indeksacji, ale cięcie nadal działa (50 000 / 780 000 = 6,41%)', () => {
    const p = started();
    p.onJanuary(12, 780_000, lnr(0.03), lnr(-0.2), true);
    expect(annual(p, 12, 0)).toBeCloseTo(45_000, 6);
  });
  it('stopa tuż pod granicą (5,99%) nie tnie', () => {
    const p = started();
    p.onJanuary(12, 50_000 / 0.0599, 0, 0, true);
    expect(annual(p, 12, 0)).toBeCloseTo(50_000, 6);
  });
  it('nie w ostatnich 15 latach: 15 lat do końca -> brak cięcia, 16 lat -> cięcie', () => {
    const none = started(GK_DEFAULT, 12 + 180); // w t = 12 zostaje dokładnie 15 lat
    none.onJanuary(12, 780_000, 0, lnr(-0.2), true);
    expect(annual(none, 12, 0)).toBeCloseTo(50_000, 6);
    const cut = started(GK_DEFAULT, 12 + 192); // 16 lat
    cut.onJanuary(12, 780_000, 0, lnr(-0.2), true);
    expect(annual(cut, 12, 0)).toBeCloseTo(45_000, 6);
  });
  it('cięcie jest jednorazowe w roku: kolejny rok ocenia nową kwotę', () => {
    const p = started();
    p.onJanuary(12, 780_000, 0, lnr(-0.2), true); // 45 000, stopa 5,77%
    p.onJanuary(24, 780_000, 0, 0, true); // brak inflacji; 45 000 / 780 000 = 5,77% -> bez zmian
    expect(annual(p, 24, 0)).toBeCloseTo(45_000, 6);
  });
});

describe('Guyton–Klinger: reguła dobrobytu', () => {
  it('stopa < 80% początkowej podnosi wypłatę o 10%', () => {
    const p = started();
    // indeksacja 3%: 51 500 / 1 400 000 = 3,68% < 4% -> 51 500 · 1,1 = 56 650
    p.onJanuary(12, 1_400_000, lnr(0.03), lnr(0.3), true);
    expect(annual(p, 12, 0)).toBeCloseTo(56_650, 6);
  });
  it('stopa tuż nad granicą (4,01%) nie podnosi', () => {
    const p = started();
    p.onJanuary(12, 50_000 / 0.0401, 0, 0, true);
    expect(annual(p, 12, 0)).toBeCloseTo(50_000, 6);
  });
  it('działa także w ostatnich 15 latach', () => {
    const p = started(GK_DEFAULT, 12 + 120);
    p.onJanuary(12, 1_400_000, 0, 0.1, true); // 50 000 / 1 400 000 = 3,57%
    expect(annual(p, 12, 0)).toBeCloseTo(55_000, 6);
  });
});

describe('Guyton–Klinger: reset i wartość ≤ 0', () => {
  it('reset zapomina stan, wypłata startowa ustalana od nowa', () => {
    const p = started();
    p.onJanuary(12, 780_000, 0, lnr(-0.2), true);
    p.reset();
    expect(p.amountAt(0, 0)).toBe(0);
    p.onJanuary(0, 500_000, 0, 0, true);
    expect(annual(p, 0, 0)).toBeCloseTo(25_000, 6);
  });
  it('portfel ≤ 0 w styczniu nie zmienia wypłaty (bez NaN)', () => {
    const p = started();
    p.onJanuary(12, -5, lnr(0.03), lnr(-0.9), true);
    expect(annual(p, 12, 0)).toBeCloseTo(50_000, 6);
  });
});

/** Rejestrator siatki wartości (po podatku) w kernelu. */
class Rec implements PathSink {
  j: number[] = [];
  wealth: number[] = [];
  onGrid(j: number, w: number): void {
    this.j.push(j);
    this.wealth.push(w);
  }
  onEnd(): void {}
}

function deterministic(over: Parameters<typeof makeScenario>[0]) {
  const s = makeScenario(over);
  const market = { ...s.market, inflation: { ...s.market.inflation, sigmaEta: 0, meanSe: 0 } };
  return { ...s, market, assets: [{ ...s.assets[0]!, g: 0, sigma: 0, se: 0, ter: 0, costBps: 0 }] as typeof s.assets };
}

describe('Guyton–Klinger w kernelu', () => {
  it('start poza styczniem: wypłata od startMonth z initialRate · W', () => {
    const s = deterministic({ startMonth: 1, horizonMonths: 6, withdrawal: { ...GK_DEFAULT, startMonth: 5 } });
    const k = new Kernel(s);
    k.simulate(1, 0, new Rec());
    expect(k.ledger.withdrawals).toBeCloseTo((0.05 * 100_000) / 12, 9); // tylko t = 5
  });

  it('ścieżka wieloletnia policzona ręcznie: indeksacja, indeksacja, cięcie (g = 0, inflacja 3,5%)', () => {
    // W₀ = 100 000, stopa 5% -> A₀ = 5 000. g = 0, bez kosztów, CPI: cpiLog_t = 0,035·t/12.
    // k = e^0,035 − 1 = 3,5619%. t = 12: W = 95 000, A₁ = A₀(1+k), stopa 5,45% (w paśmie).
    // t = 24: W = 95 000 − A₁, A₂ = A₁(1+k), stopa 5,97% (w paśmie).
    // t = 36: W = W₂ − A₂, A₂(1+k)/W > 6% -> A₃ = 0,9·A₂(1+k) (zostaje > 15 lat: horyzont 300).
    const k = Math.exp(0.035) - 1;
    const A0 = 5_000;
    const A1 = A0 * (1 + k);
    const A2 = A1 * (1 + k);
    const W36 = 100_000 - A0 - A1 - A2;
    expect((A2 * (1 + k)) / W36).toBeGreaterThan(0.06); // sprawdzenie założeń ręcznego rachunku
    expect(A1 / (100_000 - A0)).toBeLessThan(0.06);
    expect(A2 / (100_000 - A0 - A1)).toBeLessThan(0.06);
    const A3 = 0.9 * A2 * (1 + k);

    const s = deterministic({ horizonMonths: 300, withdrawal: GK_DEFAULT });
    const kernel = new Kernel(s);
    const rec = new Rec();
    kernel.simulate(1, 0, rec);
    const at = (month: number) => rec.wealth[Array.from(kernel.grid).indexOf(month)]!;
    expect(at(12)).toBeCloseTo(100_000 - A0, 4);
    expect(at(24)).toBeCloseTo(100_000 - A0 - A1, 4);
    expect(at(36)).toBeCloseTo(W36, 4);
    expect(at(48)).toBeCloseTo(W36 - A3, 4);
  });
});
