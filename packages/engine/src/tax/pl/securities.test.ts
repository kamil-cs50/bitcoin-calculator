import { describe, expect, it } from 'vitest';
import { PL_CAPITAL_GAINS_RATE, SecuritiesTaxPL } from './securities';

describe('SecuritiesTaxPL', () => {
  it('stawka 19%', () => {
    expect(PL_CAPITAL_GAINS_RATE).toBe(0.19);
  });

  it('zysk 1400 -> podatek 266', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(3000, 1600);
    expect(t.closeYear(2027).tax).toBeCloseTo(266, 10);
  });

  it('rok bez sprzedaży: podatek 0', () => {
    const t = new SecuritiesTaxPL();
    expect(t.closeYear(2027).tax).toBe(0);
  });

  it('strata: jednorazowe odliczenie, potem 50%, wygaśnięcie po 5 latach (T5)', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(1000, 2000);
    expect(t.closeYear(2027).tax).toBe(0);
    expect(t.lossesAvailable(2028)).toBe(1000);
    expect(t.closeYear(2028).tax).toBe(0);
    expect(t.closeYear(2029).tax).toBe(0);
    t.onSale(1400, 1000);
    expect(t.closeYear(2030).tax).toBe(0); // jednorazowe odliczenie 400
    expect(t.lossesAvailable(2031)).toBeCloseTo(600, 10);
    expect(t.closeYear(2031).tax).toBe(0);
    t.onSale(1300, 1000);
    expect(t.closeYear(2032).tax).toBe(0); // 300 <= 50% * 1000
    expect(t.lossesAvailable(2033)).toBe(0); // rocznik 2027 wygasł (2028..2032)
    t.onSale(1500, 1000);
    expect(t.closeYear(2033).tax).toBeCloseTo(95, 10);
  });

  it('T5: dochód pierwszego roku mniejszy od straty, reszta schodzi po 50% rocznie', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(0, 2000);
    t.closeYear(2027);
    t.onSale(500, 0);
    expect(t.closeYear(2028).tax).toBe(0); // lump 500, zostaje 1500
    t.onSale(2000, 0);
    expect(t.closeYear(2029).tax).toBeCloseTo(190, 10); // limit 1000 -> dochód 1000
    expect(t.lossesAvailable(2030)).toBeCloseTo(500, 10);
    t.onSale(2000, 0);
    expect(t.closeYear(2030).tax).toBeCloseTo(285, 10); // 500 reszty, dochód 1500
  });

  it('dwie straty: najstarsza zużywana pierwsza', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(0, 1000);
    t.closeYear(2027);
    t.onSale(0, 1000);
    t.closeYear(2028);
    t.onSale(600, 0);
    expect(t.closeYear(2029).tax).toBe(0);
    // rocznik 2027 zużyty o 600, 2028 nietknięty
    expect(t.lossesAvailable(2030)).toBeCloseTo(1400, 10);
    t.onSale(500, 0);
    // 2027: odliczenie jednorazowe wykorzystane, limit 50% = 500 -> bierze 400 reszty;
    // pozostałe 100 dochodu pokrywa rocznik 2028 (jego odliczenie jednorazowe)
    expect(t.closeYear(2030).tax).toBe(0);
    expect(t.lossesAvailable(2031)).toBeCloseTo(900, 10);
  });

  it('strata 6 mln -> ostrzeżenie LOSS_OVER_5M', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(0, 6_000_000);
    const r = t.closeYear(2027);
    expect(r.warnings.map((w) => w.code)).toContain('LOSS_OVER_5M');
  });

  it('latentTax(1000, 2028) przy stracie 400 = 114', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(600, 1000);
    t.closeYear(2027);
    expect(t.latentTax(1000, 2028)).toBeCloseTo(114, 10);
    expect(t.latentTax(-5, 2028)).toBe(0);
  });

  it('reset czyści stan', () => {
    const t = new SecuritiesTaxPL();
    t.onSale(0, 1000);
    t.closeYear(2027);
    t.reset();
    expect(t.lossesAvailable(2028)).toBe(0);
  });
});
