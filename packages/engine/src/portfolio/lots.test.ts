import { describe, expect, it } from 'vitest';
import { LotQueue } from './lots';

function trzyPartie(): LotQueue {
  const q = new LotQueue(16);
  q.buy(10, 1000, 0);
  q.buy(10, 1200, 1);
  q.buy(10, 1500, 2);
  return q;
}

describe('LotQueue (FIFO)', () => {
  it('sprzedaż 15 szt. z trzech partii zwraca koszt FIFO 1600', () => {
    const q = trzyPartie();
    expect(q.sell(15)).toBeCloseTo(1600, 10);
    expect(q.units).toBeCloseTo(15, 10);
    expect(q.basis).toBeCloseTo(2100, 10);
    expect(q.oldestMonth()).toBe(1);
    expect(q.sell(15)).toBeCloseTo(2100, 10);
    expect(q.units).toBeCloseTo(0, 10);
    expect(q.oldestMonth()).toBe(-1);
  });

  it('sprzedaż z pustej kolejki rzuca błąd', () => {
    const q = new LotQueue(4);
    expect(() => q.sell(1)).toThrow();
  });

  it('sprzedaż większa niż stan rzuca błąd', () => {
    const q = trzyPartie();
    expect(() => q.sell(31)).toThrow();
  });

  it('sprzedaż ułamkowa', () => {
    const q = new LotQueue(4);
    q.buy(1, 100, 0);
    expect(q.sell(0.5)).toBeCloseTo(50, 12);
    expect(q.units).toBeCloseTo(0.5, 12);
    expect(q.basis).toBeCloseTo(50, 12);
  });

  it('przepełnienie capacity rzuca błąd', () => {
    const q = new LotQueue(2);
    q.buy(1, 1, 0);
    q.buy(1, 1, 1);
    expect(() => q.buy(1, 1, 2)).toThrow();
  });

  it('bufor pierścieniowy: zawijanie po sprzedaży', () => {
    const q = new LotQueue(2);
    q.buy(1, 10, 0);
    q.buy(1, 20, 1);
    expect(q.sell(1)).toBeCloseTo(10, 12);
    q.buy(1, 30, 2);
    expect(q.sell(2)).toBeCloseTo(50, 12);
    expect(q.oldestMonth()).toBe(-1);
  });

  it('reset zeruje stan', () => {
    const q = trzyPartie();
    q.reset();
    expect(q.units).toBe(0);
    expect(q.basis).toBe(0);
    expect(q.oldestMonth()).toBe(-1);
    q.buy(1, 5, 7);
    expect(q.oldestMonth()).toBe(7);
  });
});
