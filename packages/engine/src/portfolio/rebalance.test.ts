import { describe, expect, it } from 'vitest';
import {
  allocateInflow,
  allocateOutflow,
  rebalanceTrades,
  transactionCost,
} from './rebalance';

const f = (...a: number[]) => Float64Array.from(a);
const L = (...a: number[]) => Uint8Array.from(a);
const arr = (x: Float64Array) => Array.from(x);

describe('rebalanceTrades', () => {
  it('annual: w styczniu wyrównuje do celu, poza styczniem nic', () => {
    const out = new Float64Array(2);
    expect(rebalanceTrades(f(70, 30), f(0.5, 0.5), L(1, 1), { kind: 'annual' }, true, out)).toBe(true);
    expect(arr(out)).toEqual([-20, 20]);
    out.fill(7);
    expect(rebalanceTrades(f(70, 30), f(0.5, 0.5), L(1, 1), { kind: 'annual' }, false, out)).toBe(false);
    expect(arr(out)).toEqual([0, 0]);
  });

  it('band 5 pp: wewnątrz pasma brak, poza pasmem pełny rebalans', () => {
    const out = new Float64Array(2);
    const p = { kind: 'band', bandPp: 5 } as const;
    expect(rebalanceTrades(f(54, 46), f(0.5, 0.5), L(1, 1), p, false, out)).toBe(false);
    expect(rebalanceTrades(f(55, 45), f(0.5, 0.5), L(1, 1), p, false, out)).toBe(false);
    expect(rebalanceTrades(f(56, 44), f(0.5, 0.5), L(1, 1), p, false, out)).toBe(true);
    expect(out[0]).toBeCloseTo(-6, 12);
    expect(out[1]).toBeCloseTo(6, 12);
  });

  it('none i flows: zawsze false', () => {
    const out = f(9, 9);
    expect(rebalanceTrades(f(70, 30), f(0.5, 0.5), L(1, 1), { kind: 'flows' }, true, out)).toBe(false);
    expect(rebalanceTrades(f(70, 30), f(0.5, 0.5), L(1, 1), { kind: 'none' }, true, out)).toBe(false);
    expect(arr(out)).toEqual([0, 0]);
  });

  it('aktywo niepłynne nie bierze udziału', () => {
    const out = new Float64Array(3);
    // płynne: 0 i 1 (70/30 przy celu 50/50), niepłynne: 2 (duża wartość, cel 0.9)
    expect(rebalanceTrades(f(70, 30, 500), f(0.5, 0.5, 0.9), L(1, 1, 0), { kind: 'annual' }, true, out)).toBe(true);
    expect(arr(out)).toEqual([-20, 20, 0]);
  });

  it('suma celów płynnych = 0: brak transakcji, brak NaN', () => {
    const out = f(1, 1);
    for (const p of [{ kind: 'annual' }, { kind: 'band', bandPp: 1 }] as const) {
      expect(rebalanceTrades(f(70, 30), f(0, 0), L(1, 1), p, true, out)).toBe(false);
      expect(arr(out)).toEqual([0, 0]);
    }
  });

  it('pusty portfel (same zera wartości): brak transakcji, brak NaN', () => {
    const out = f(1, 1);
    expect(rebalanceTrades(f(0, 0), f(0.5, 0.5), L(1, 1), { kind: 'annual' }, true, out)).toBe(false);
    expect(arr(out)).toEqual([0, 0]);
    expect(rebalanceTrades(new Float64Array(0), new Float64Array(0), new Uint8Array(0), { kind: 'annual' }, true, new Float64Array(0))).toBe(false);
  });

  it('jedno aktywo 100%: brak transakcji', () => {
    const out = f(1);
    expect(rebalanceTrades(f(123.45), f(1), L(1), { kind: 'annual' }, true, out)).toBe(false);
    expect(rebalanceTrades(f(123.45), f(1), L(1), { kind: 'band', bandPp: 0 }, true, out)).toBe(false);
    expect(arr(out)).toEqual([0]);
  });

  it('ujemny targetWeight traktowany jak 0 (aktywo do wyzerowania)', () => {
    const out = new Float64Array(3);
    expect(rebalanceTrades(f(50, 30, 20), f(0.5, 0.5, -0.3), L(1, 1, 1), { kind: 'annual' }, true, out)).toBe(true);
    expect(arr(out)).toEqual([0, 20, -20]);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

describe('allocateInflow', () => {
  it('flows: całość do aktywa niedowartościowanego', () => {
    const out = new Float64Array(2);
    allocateInflow(f(60, 40), f(0.5, 0.5), L(1, 1), 10, { kind: 'flows' }, out);
    expect(arr(out)).toEqual([0, 10]);
  });

  it('flows: dzieli proporcjonalnie do luk, suma = amount', () => {
    const out = new Float64Array(3);
    allocateInflow(f(10, 20, 70), f(0.3, 0.3, 0.4), L(1, 1, 1), 30, { kind: 'flows' }, out);
    expect(out[0]! + out[1]! + out[2]!).toBeCloseTo(30, 12);
    expect(out[2]).toBe(0);
    expect(out[0]! / out[1]!).toBeCloseTo((0.3 * 130 - 10) / (0.3 * 130 - 20), 12);
  });

  it('none/annual/band: proporcjonalnie do celów', () => {
    const out = new Float64Array(2);
    for (const p of [{ kind: 'none' }, { kind: 'annual' }, { kind: 'band', bandPp: 5 }] as const) {
      allocateInflow(f(60, 40), f(0.75, 0.25), L(1, 1), 100, p, out);
      expect(arr(out)).toEqual([75, 25]);
    }
  });

  it('niepłynne nie dostaje; zerowe cele lub ujemna kwota: same zera', () => {
    const out = new Float64Array(3);
    allocateInflow(f(1, 1, 1), f(0.5, 0.5, 0.9), L(1, 1, 0), 10, { kind: 'none' }, out);
    expect(arr(out)).toEqual([5, 5, 0]);
    allocateInflow(f(1, 1, 1), f(0, 0, 0), L(1, 1, 1), 10, { kind: 'flows' }, out);
    expect(arr(out)).toEqual([0, 0, 0]);
    allocateInflow(f(1, 1, 1), f(1, 1, 1), L(1, 1, 1), -5, { kind: 'none' }, out);
    expect(arr(out)).toEqual([0, 0, 0]);
  });

  it('flows przy pustym portfelu dzieli wg celów', () => {
    const out = new Float64Array(2);
    allocateInflow(f(0, 0), f(0.5, 0.5), L(1, 1), 10, { kind: 'flows' }, out);
    expect(arr(out)).toEqual([5, 5]);
  });
});

describe('allocateOutflow', () => {
  it('najpierw gotówka', () => {
    const out = new Float64Array(3);
    const short = allocateOutflow(f(50, 100, 100), f(0.2, 0.4, 0.4), L(1, 1, 1), 0, 30, out);
    expect(short).toBe(0);
    expect(arr(out)).toEqual([-30, 0, 0]);
  });

  it('potem aktywa przeważone', () => {
    const out = new Float64Array(3);
    // gotówka 10, aktywa 1: 150 (cel .5), 2: 50 (cel .5); wypłata 60 → 10 z gotówki, 50 z przeważonego
    const short = allocateOutflow(f(10, 150, 50), f(0, 0.5, 0.5), L(1, 1, 1), 0, 60, out);
    expect(short).toBe(0);
    expect(out[0]).toBe(-10);
    expect(out[1]).toBeCloseTo(-50, 12);
    expect(out[2]).toBeCloseTo(0, 12);
  });

  it('niedobór gdy kwota > suma płynnych; niepłynne nietknięte', () => {
    const out = new Float64Array(3);
    const short = allocateOutflow(f(10, 20, 999), f(0.2, 0.8, 0), L(1, 1, 0), 0, 100, out);
    expect(short).toBeCloseTo(70, 12);
    expect(arr(out)).toEqual([-10, -20, 0]);
  });

  it('bez gotówki (cashIndex −1), zerowe cele: proporcjonalnie do wartości', () => {
    const out = new Float64Array(2);
    const short = allocateOutflow(f(60, 40), f(0, 0), L(1, 1), -1, 10, out);
    expect(short).toBe(0);
    expect(out[0]).toBeCloseTo(-6, 12);
    expect(out[1]).toBeCloseTo(-4, 12);
  });

  it('kwota ≤ 0 lub pusty portfel: nic, brak NaN', () => {
    const out = f(5, 5);
    expect(allocateOutflow(f(10, 10), f(1, 1), L(1, 1), 0, 0, out)).toBe(0);
    expect(arr(out)).toEqual([0, 0]);
    expect(allocateOutflow(f(0, 0), f(1, 1), L(1, 1), 0, 10, out)).toBe(10);
    expect(arr(out)).toEqual([0, 0]);
  });
});

describe('transactionCost', () => {
  it('koszt od modułu wartości transakcji', () => {
    expect(transactionCost(-10_000, 20)).toBe(20);
    expect(transactionCost(10_000, 20)).toBe(20);
    expect(transactionCost(0, 20)).toBe(0);
  });
});
