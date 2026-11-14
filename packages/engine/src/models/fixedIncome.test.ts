import { describe, it, expect } from 'vitest';
import { DepositAccount } from './deposit';
import { EdoHoldings } from './edo';
import type { DepositParams, EdoParams } from '../types';

const dep = (o: Partial<DepositParams> = {}): DepositParams => ({ kind: 'deposit', id: 'd', k: 0.5, spread: -0.01, initialRate: 0.06, ...o });
const edoP = (o: Partial<EdoParams> = {}): EdoParams => ({ kind: 'edo', id: 'e', firstYearRate: 0.0535, margin: 0.02, earlyFeePer100: 3, onMaturity: 'cash', ...o });

describe('DepositAccount', () => {
  it('odsetki netto: 10 000 przy 6% -> 40.50', () => {
    const a = new DepositAccount(dep({ k: 0 }));
    a.reset(10000);
    expect(a.accrue(0.03, 0.19)).toBeCloseTo(40.5, 10);
    expect(a.balance).toBeCloseTo(10040.5, 10);
  });
  it('stopa: d <- max(0, d + k(x + s - d))', () => {
    const a = new DepositAccount(dep({ k: 0.5, spread: 0.01, initialRate: 0.06 }));
    a.reset(1000);
    a.accrue(0.03, 0.19); // 0.06 + 0.5*(0.04-0.06) = 0.05
    expect(a.rate).toBeCloseTo(0.05, 12);
    const b = new DepositAccount(dep({ k: 1, spread: 0, initialRate: 0.02 }));
    b.reset(1000);
    b.accrue(-0.05, 0);
    expect(b.rate).toBe(0);
  });
  it('wpłata i wypłata', () => {
    const a = new DepositAccount(dep());
    a.reset(100);
    a.deposit(50);
    expect(a.withdraw(500)).toBe(150);
    expect(a.balance).toBe(0);
  });
});

describe('EdoHoldings', () => {
  const run = (h: EdoHoldings, months: number, yy: number, x = 0.03, tax = 0.19) => {
    let cash = 0;
    for (let m = 1; m <= months; m++) cash += h.onMonth(m, yy, x, tax);
    return cash;
  };
  it('120 miesięcy: wartość i gotówka netto', () => {
    const h = new EdoHoldings(edoP(), 8);
    h.buy(10000, 0, 0.0535);
    run(h, 119, 0.03);
    expect(h.value(119)).toBeGreaterThan(15000);
    const cash = h.onMonth(120, 0.03, 0.03, 0.19);
    expect(cash).toBeCloseTo(15138.03, 2);
    expect(h.value(120)).toBe(0);
  });
  it('wartość brutto: 10000·1.0535·1.05^9 = 16343.24, po wykupie roll = netto', () => {
    const h = new EdoHoldings(edoP({ onMaturity: 'roll' }), 8);
    h.buy(10000, 0, 0.0535);
    run(h, 119, 0.03);
    expect(h.value(119)).toBeCloseTo(10000 * 1.0535 * 1.05 ** 8 * (1 + (0.05 * 11) / 12), 6);
    expect(h.onMonth(120, 0.03, 0.03, 0.19)).toBe(0);
    expect(h.value(120)).toBeCloseTo(15138.03, 2);
    expect(10000 * 1.0535 * 1.05 ** 9).toBeCloseTo(16343.24, 2);
  });
  it('przedterminowo po 18 mies.', () => {
    const h = new EdoHoldings(edoP(), 8);
    h.buy(10000, 0, 0.0535);
    run(h, 18, 0.03);
    expect(h.value(18)).toBeCloseTo(10798.375, 3);
    expect(h.netValue(18, 0.19)).toBeCloseTo(10403.68, 2);
    expect(h.redeemEarly(1e9, 18, 0.19)).toBeCloseTo(10403.68, 2);
    expect(h.value(18)).toBeCloseTo(0, 9);
  });
  it('przedterminowo po 1 mies.: opłata = odsetki', () => {
    const h = new EdoHoldings(edoP(), 8);
    h.buy(10000, 0, 0.0535);
    run(h, 1, 0.03);
    expect(h.redeemEarly(1e9, 1, 0.19)).toBeCloseTo(10000, 2);
  });
  it('yy = -1% -> oprocentowanie roku = 0% + marża', () => {
    const h = new EdoHoldings(edoP(), 8);
    h.buy(10000, 0, 0.0535);
    run(h, 12, -0.01);
    expect(h.value(12)).toBeCloseTo(10535, 6);
    run2(h);
    function run2(hh: EdoHoldings) {
      for (let m = 13; m <= 24; m++) hh.onMonth(m, -0.01, 0.03, 0.19);
    }
    expect(h.value(24)).toBeCloseTo(10535 * 1.02, 6);
  });
  it("'roll': nowa partia z nominałem netto, rate = max(0,x)+margin", () => {
    const h = new EdoHoldings(edoP({ onMaturity: 'roll' }), 8);
    h.buy(10000, 0, 0.0535);
    run(h, 120, 0.03, 0.04);
    expect(h.value(120)).toBeCloseTo(15138.03, 2);
    // po roku nowa partia rośnie o 4% + 2% = 6%
    for (let m = 121; m <= 132; m++) h.onMonth(m, 0.03, 0.04, 0.19);
    expect(h.value(132)).toBeCloseTo(15138.03 * 1.06, 1);
  });
  it('redeemEarly(5000) z dwóch partii po 10 000 narusza tylko starszą', () => {
    const h = new EdoHoldings(edoP(), 8);
    h.buy(10000, 0, 0.0535);
    h.buy(10000, 6, 0.0535);
    for (let m = 1; m <= 18; m++) h.onMonth(m, 0.03, 0.03, 0.19);
    const before = h.value(18);
    const got = h.redeemEarly(5000, 18, 0.19);
    expect(got).toBeCloseTo(5000, 6);
    // młodsza partia nietknięta: wartość spadła o brutto starszej części
    const youngerOnly = 10000 + 10000 * 0.0535 * 12 / 12;
    expect(h.value(18)).toBeGreaterThan(youngerOnly);
    expect(before - h.value(18)).toBeGreaterThan(5000);
    expect(before - h.value(18)).toBeLessThan(5600);
  });
});
