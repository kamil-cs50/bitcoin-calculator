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
  it('podatek z likwidacji (carry)', () => {
    const c = new CryptoTaxPL();
    c.onBuy(10000);
    c.closeYear();
    c.onSale(4000);
    c.onBuy(1000);
    c.closeYear();
    expect(c.carry).toBe(7000);
    expect(c.liquidationTax(30000)).toBeCloseTo(4370, 9);
    expect(c.liquidationTax(1000)).toBe(0);
  });
  it('likwidacja w roku zakupu: koszty bieżącego roku pomniejszają dochód (Important 1)', () => {
    const c = new CryptoTaxPL();
    c.onBuy(10000); // zakup w bieżącym roku, jeszcze bez closeYear
    expect(c.liquidationTax(10000)).toBeCloseTo(0, 12); // wartość = koszt: brak podatku
    expect(c.liquidationTax(15000)).toBeCloseTo(0.19 * 5000, 9);
  });
  it('likwidacja: przychody roku + wartość − koszty − carry, jedno max(0, ·)', () => {
    const c = new CryptoTaxPL();
    c.onBuy(10000);
    c.closeYear(); // carry 10000
    c.onSale(3000);
    c.onBuy(500);
    // 3000 + 9000 − 500 − 10000 = 1500
    expect(c.liquidationTax(9000)).toBeCloseTo(0.19 * 1500, 9);
    // przychód obniża podstawę dwa razy NIE: pending + latent osobno = 0 + 0, a razem 1500 > 0
    expect(c.pendingTax()).toBe(0);
    expect(c.liquidationTax(6000)).toBe(0);
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
    expect(t.liquidationTax([{ form: 'security', wrapper: 'taxable', value: 10, basis: 1 }], 2030)).toBe(0);
  });
  it('liquidationTax pl: papiery, krypto z koszykiem, IKE pominięte', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onBuy('crypto', 'taxable', 7000, 1);
    t.closeYear(2027);
    const lt = t.liquidationTax(
      [
        { form: 'security', wrapper: 'taxable', value: 3000, basis: 1000 },
        { form: 'crypto', wrapper: 'taxable', value: 30000, basis: 7000 },
        { form: 'security', wrapper: 'IKE', value: 9000, basis: 1000 },
      ],
      2028,
    );
    expect(lt).toBeCloseTo(0.19 * 2000 + 0.19 * 23000, 9);
  });
  it('liquidationTax pl: krypto kupione w tym roku, wartość = koszt: 0 (Important 1)', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onBuy('crypto', 'taxable', 10000, 1);
    const pos = [{ form: 'crypto' as const, wrapper: 'taxable' as const, value: 10000, basis: 10000 }];
    expect(t.liquidationTax(pos, 2027)).toBeCloseTo(0, 12);
    pos[0]!.value = 12000;
    expect(t.liquidationTax(pos, 2027)).toBeCloseTo(0.19 * 2000, 9);
  });
  it('liquidationTax pl: sprzedaż krypto w roku + wartość tej samej pozycji liczone razem', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onBuy('crypto', 'taxable', 10000, 1);
    t.onSale('crypto', 'taxable', 6000, 0, 2, 1);
    // 6000 + 8000 − 10000 = 4000
    const pos = [{ form: 'crypto' as const, wrapper: 'taxable' as const, value: 8000, basis: 5000 }];
    expect(t.liquidationTax(pos, 2027)).toBeCloseTo(0.19 * 4000, 9);
  });
  it('liquidationTax pl: papiery, zrealizowane + niezrealizowane z jednym przebiegiem strat (Important 2)', () => {
    const t = createTaxEngine({ kind: 'pl' });
    t.onSale('security', 'taxable', 600, 1600, 1, 12); // strata 1000 w 2027
    t.closeYear(2027);
    t.onSale('security', 'taxable', 1500, 500, 2, 12); // zrealizowany zysk 1000 w 2028
    const pos = [{ form: 'security' as const, wrapper: 'taxable' as const, value: 3000, basis: 1000 }]; // niezrealizowany 2000
    // dochód 3000, strata 1000 (jednorazowo) -> 2000; stare pending + latent: 0 + 0.19*(2000-1000)... + 0.19*(1000-1000)=190
    expect(t.pendingTax(2028)).toBeCloseTo(0, 9);
    expect(t.liquidationTax(pos, 2028)).toBeCloseTo(0.19 * 2000, 9);
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
