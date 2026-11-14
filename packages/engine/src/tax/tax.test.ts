import { describe, expect, it } from 'vitest';
import { CryptoTaxPL } from './pl/crypto';
import { createTaxEngine } from './taxEngine';

describe('CryptoTaxPL (koszyk)', () => {
  it('przenosi nadwyżkę kosztów bez limitu czasu', () => {
    const c = new CryptoTaxPL();
    c.onBuy(10000);
    expect(c.closeYear()).toBe(0);
    expect(c.carry).toBe(10000);
    c.onSale(4000);
    c.onBuy(1000);
    expect(c.closeYear()).toBe(0);
    expect(c.carry).toBe(7000);
    c.onSale(20000);
    expect(c.closeYear()).toBeCloseTo(2470, 9);
    expect(c.carry).toBe(0);
  });
  it('podatek utajony', () => {
    const c = new CryptoTaxPL();
    c.onBuy(10000);
    c.closeYear();
    c.onSale(4000);
    c.onBuy(1000);
    c.closeYear();
    expect(c.carry).toBe(7000);
    expect(c.latentTax(30000)).toBeCloseTo(4370, 9);
    expect(c.latentTax(1000)).toBe(0);
  });
  it('reset czyści stan', () => {
    const c = new CryptoTaxPL();
    c.onBuy(5);
    c.closeYear();
    c.reset();
    expect(c.carry).toBe(0);
  });
});

describe('TaxEngine routing', () => {
  it('IKE: brak podatku', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onSale('security', 'IKE', 2000, 1000, 5, 24);
    expect(t.closeYear(2030)).toBe(0);
  });
  it('physicalGold: 7 miesięcy zwolnione, 3 miesiące 19%', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onSale('physicalGold', 'taxable', 2000, 1000, 5, 7);
    expect(t.closeYear(2030)).toBe(0);
    t.onSale('physicalGold', 'taxable', 2000, 1000, 5, 3);
    expect(t.closeYear(2031)).toBeCloseTo(190, 9);
  });
  it('strata z krypto nie obniża podatku od papierów', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onBuy('crypto', 'taxable', 10000, 1);
    t.onSale('crypto', 'taxable', 1000, 0, 2, 1);
    t.onSale('security', 'taxable', 2000, 1000, 3, 12);
    expect(t.closeYear(2030)).toBeCloseTo(190, 9);
  });
  it('krypto przez silnik: sprzedaż po latach', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onBuy('crypto', 'taxable', 10000, 1);
    expect(t.closeYear(2027)).toBe(0);
    t.onSale('crypto', 'taxable', 20000, 0, 2, 12);
    expect(t.closeYear(2028)).toBeCloseTo(0.19 * 10000, 9);
  });
  it('flat 0.15', () => {
    const t = createTaxEngine({ kind: 'flat', rate: 0.15 });
    t.onSale('security', 'taxable', 2000, 1000, 5, 12);
    expect(t.closeYear(2030)).toBeCloseTo(150, 9);
    expect(t.closeYear(2031)).toBe(0);
  });
  it('flat: strata nie daje podatku; IKE zwolnione', () => {
    const t = createTaxEngine({ kind: 'flat', rate: 0.15 });
    t.onSale('security', 'taxable', 500, 1000, 5, 12);
    t.onSale('security', 'IKE', 5000, 1000, 5, 12);
    expect(t.closeYear(2030)).toBe(0);
  });
  it('none: zawsze 0', () => {
    const t = createTaxEngine({ kind: 'none' });
    t.onSale('security', 'taxable', 2000, 1000, 5, 12);
    expect(t.closeYear(2030)).toBe(0);
    expect(t.latentTax([{ form: 'security', wrapper: 'taxable', value: 10, basis: 1 }], 2030)).toBe(0);
  });
  it('latentTax pl: papiery, krypto z koszykiem, IKE pominięte', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onBuy('crypto', 'taxable', 7000, 1);
    t.closeYear(2027);
    const lt = t.latentTax(
      [
        { form: 'security', wrapper: 'taxable', value: 3000, basis: 1000 },
        { form: 'crypto', wrapper: 'taxable', value: 30000, basis: 7000 },
        { form: 'security', wrapper: 'IKE', value: 9000, basis: 1000 },
      ],
      2028,
    );
    expect(lt).toBeCloseTo(0.19 * 2000 + 0.19 * 23000, 9);
  });
  it('reset czyści stan roczny', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onSale('security', 'taxable', 2000, 1000, 5, 12);
    t.reset();
    expect(t.closeYear(2030)).toBe(0);
  });
});

describe('pendingTax (zobowiązanie bieżącego roku bez zamykania roku)', () => {
  it('pl: papiery, nie zmienia stanu; krypto: koszty i nadwyżka', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onSale('security', 'taxable', 1000, 400, 5, 24);
    expect(t.pendingTax(2027)).toBeCloseTo(114, 9);
    expect(t.pendingTax(2027)).toBeCloseTo(114, 9);
    t.onBuy('crypto', 'taxable', 100, 5);
    t.onSale('crypto', 'taxable', 1100, 0, 6, 0);
    expect(t.pendingTax(2027)).toBeCloseTo(114 + 190, 9);
    expect(t.closeYear(2027)).toBeCloseTo(114 + 190, 9);
    expect(t.pendingTax(2028)).toBe(0);
  });
  it('pl: strata z lat poprzednich pomniejsza zobowiązanie', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onSale('security', 'taxable', 1000, 1600, 5, 24);
    t.closeYear(2027);
    t.onSale('security', 'taxable', 1500, 500, 5, 24);
    expect(t.pendingTax(2028)).toBeCloseTo(0.19 * (1000 - 600), 9); // jednorazowe odliczenie straty 600
    t.onSale('security', 'taxable', 1000, 0, 5, 24);
    expect(t.pendingTax(2028)).toBeCloseTo(0.19 * (2000 - 600), 9);
    expect(t.closeYear(2028)).toBeCloseTo(0.19 * (2000 - 600), 9);
  });
  it('flat i none', () => {
    const f = createTaxEngine({ kind: 'flat', rate: 0.2 });
    f.onSale('security', 'taxable', 1000, 400, 1, 1);
    expect(f.pendingTax(2027)).toBeCloseTo(120, 9);
    expect(f.closeYear(2027)).toBeCloseTo(120, 9);
    expect(createTaxEngine({ kind: 'none' }).pendingTax(2027)).toBe(0);
  });
});
