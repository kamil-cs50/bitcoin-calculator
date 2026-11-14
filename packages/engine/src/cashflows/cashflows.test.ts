import { describe, expect, it } from 'vitest';
import { pmt } from '../math/pmt';
import { contributionAt, eventAmount } from './contributions';
import { WithdrawalPolicy } from './withdrawals';

describe('pmt', () => {
  it('renta płatna z góry', () => {
    expect(pmt(0.03, 30, 1_000_000, true)).toBeCloseTo(49533.26, 1);
  });
  it('płatna z dołu', () => {
    expect(pmt(0.03, 30, 1_000_000, false)).toBeCloseTo(51019.26, 1);
  });
  it('r = 0', () => {
    expect(pmt(0, 20, 100, true)).toBe(5);
  });
});

describe('contributionAt', () => {
  const ln11 = Math.log(1.1);
  it('indeksacja none', () => {
    const c = { monthly: 1000, endMonth: 24, indexation: 'none' as const, realGrowth: 0 };
    expect(contributionAt(c, 5, ln11)).toBe(1000);
  });
  it('indeksacja cpi, po endMonth zero', () => {
    const c = { monthly: 1000, endMonth: 24, indexation: 'cpi' as const, realGrowth: 0 };
    expect(contributionAt(c, 5, ln11)).toBeCloseTo(1100, 9);
    expect(contributionAt(c, 24, ln11)).toBeCloseTo(1100, 9);
    expect(contributionAt(c, 25, ln11)).toBe(0);
  });
  it('cpiPlus: realny wzrost co 12 miesięcy', () => {
    const c = { monthly: 1000, endMonth: 120, indexation: 'cpiPlus' as const, realGrowth: 0.02 };
    expect(contributionAt(c, 11, 0)).toBeCloseTo(1000, 9);
    expect(contributionAt(c, 12, ln11)).toBeCloseTo(1000 * 1.1 * 1.02, 9);
    expect(contributionAt(c, 24, 0)).toBeCloseTo(1000 * 1.02 ** 2, 9);
  });
});

describe('WithdrawalPolicy', () => {
  it('fixedReal', () => {
    const p = new WithdrawalPolicy({ kind: 'fixedReal', startMonth: 12, monthly: 4000 }, 360);
    expect(p.amountAt(11, Math.log(1.1))).toBe(0);
    expect(p.amountAt(12, Math.log(1.1))).toBeCloseTo(4400, 9);
  });
  it('percent: ustalane w styczniu, niezależnie od CPI', () => {
    const p = new WithdrawalPolicy({ kind: 'percent', startMonth: 0, rate: 0.04 }, 360);
    p.onJanuary(0, 1_200_000, 0);
    for (let t = 0; t < 12; t++) expect(p.amountAt(t, t * 0.01)).toBeCloseTo(4000, 9);
    p.reset();
    expect(p.amountAt(0, 0)).toBe(0);
  });
  it('percent: przed startMonth zero', () => {
    const p = new WithdrawalPolicy({ kind: 'percent', startMonth: 24, rate: 0.04 }, 360);
    p.onJanuary(0, 1_200_000, 0);
    expect(p.amountAt(12, 0)).toBe(0);
    p.onJanuary(24, 1_200_000, 0);
    expect(p.amountAt(24, 0)).toBeCloseTo(4000, 9);
  });
  it('abw: rata z PMT, indeksowana CPI w ciągu roku', () => {
    const p = new WithdrawalPolicy({ kind: 'abw', startMonth: 0, expectedRealReturn: 0.03 }, 360);
    p.onJanuary(0, 1_000_000, 0);
    expect(p.amountAt(0, 0)).toBeCloseTo(49533.26 / 12, 1);
    expect(p.amountAt(5, Math.log(1.02))).toBeCloseTo((49533.26 / 12) * 1.02, 1);
  });
  it('abw: wartość nominalna przeliczana na realną (CPI przy styczniu)', () => {
    const p = new WithdrawalPolicy({ kind: 'abw', startMonth: 0, expectedRealReturn: 0.03 }, 360);
    p.onJanuary(0, 1_100_000, Math.log(1.1));
    expect(p.amountAt(0, Math.log(1.1))).toBeCloseTo((49533.26 / 12) * 1.1, 1);
  });
  it('abw: pozostałe lata maleją', () => {
    const p = new WithdrawalPolicy({ kind: 'abw', startMonth: 0, expectedRealReturn: 0.03 }, 360);
    p.onJanuary(348, 100_000, 0); // 1 rok do końca → cała kwota
    expect(p.amountAt(348, 0) * 12).toBeCloseTo(100_000, 6);
  });
  it('abw: podłoga i sufit (realnie, miesięcznie)', () => {
    const lo = new WithdrawalPolicy({ kind: 'abw', startMonth: 0, expectedRealReturn: 0.03, floor: 3000, cap: 5000 }, 360);
    lo.onJanuary(0, 600_000, 0); // 2477/mies. → podłoga
    expect(lo.amountAt(0, Math.log(1.2))).toBeCloseTo(3000 * 1.2, 9);
    const hi = new WithdrawalPolicy({ kind: 'abw', startMonth: 0, expectedRealReturn: 0.03, floor: 3000, cap: 5000 }, 360);
    hi.onJanuary(0, 2_000_000, 0); // 8255/mies. → sufit
    expect(hi.amountAt(0, 0)).toBeCloseTo(5000, 9);
  });
  it('abw: wartość ≤ 0 daje 0', () => {
    const p = new WithdrawalPolicy({ kind: 'abw', startMonth: 0, expectedRealReturn: 0.03 }, 360);
    p.onJanuary(0, -5, 0);
    expect(p.amountAt(0, 0)).toBe(0);
  });
});

describe('eventAmount', () => {
  it('realna', () => {
    expect(eventAmount({ month: 3, amount: -50_000, real: true }, Math.log(1.2))).toBeCloseTo(-60_000, 6);
  });
  it('nominalna', () => {
    expect(eventAmount({ month: 3, amount: -50_000, real: false }, Math.log(1.2))).toBe(-50_000);
  });
});
