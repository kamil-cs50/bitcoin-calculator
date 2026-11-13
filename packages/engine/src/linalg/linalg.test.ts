import { describe, expect, it } from 'vitest';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import { cholesky, NotPositiveDefiniteError } from './cholesky';
import { nearestCorrelation } from './nearestCorrelation';

/** Losowa macierz korelacji n×n: normalizacja B·Bᵀ dla B n×(n+3). */
function randomCorrelation(n: number, seed: number): Float64Array {
  const g = Xoshiro128ss.fromSeed(seed);
  const m = n + 3;
  const b = new Float64Array(n * m);
  for (let i = 0; i < b.length; i++) b[i] = g.nextUniform() - 0.5;
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < m; k++) s += b[i * m + k]! * b[j * m + k]!;
      a[i * n + j] = s;
    }
  const c = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) c[i * n + j] = a[i * n + j]! / Math.sqrt(a[i * n + i]! * a[j * n + j]!);
  return c;
}

describe('cholesky', () => {
  it('L·Lᵀ = A dla losowej macierzy korelacji 6×6', () => {
    const n = 6;
    const a = randomCorrelation(n, 7);
    const l = cholesky(a, n);
    let maxErr = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += l[i * n + k]! * l[j * n + k]!;
        maxErr = Math.max(maxErr, Math.abs(s - a[i * n + j]!));
      }
    expect(maxErr).toBeLessThan(1e-12);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(l[i * n + j]).toBe(0);
  });

  it('rzuca NotPositiveDefiniteError dla macierzy nieokreślonej dodatnio', () => {
    expect(() => cholesky(Float64Array.of(1, 2, 2, 1), 2)).toThrow(NotPositiveDefiniteError);
  });
});

describe('nearestCorrelation', () => {
  it('przykład Highama (2002)', () => {
    const r = nearestCorrelation(Float64Array.of(1, 1, 0, 1, 1, 1, 0, 1, 1), 3);
    expect(r.changed).toBe(true);
    expect(r.matrix[1]).toBeCloseTo(0.7607, 3);
    expect(r.matrix[2]).toBeCloseTo(0.1573, 3);
    expect(r.matrix[5]).toBeCloseTo(0.7607, 3);
  });

  it('wynik ma jedynki na przekątnej i przechodzi cholesky po dodaniu 1e-10', () => {
    const r = nearestCorrelation(Float64Array.of(1, 1, 0, 1, 1, 1, 0, 1, 1), 3);
    const m = Float64Array.from(r.matrix);
    for (let i = 0; i < 3; i++) {
      expect(r.matrix[i * 4]).toBeCloseTo(1, 12);
      m[i * 4] = m[i * 4]! + 1e-10;
    }
    expect(() => cholesky(m, 3)).not.toThrow();
  });

  it('macierz już poprawna: changed === false, wynik identyczny z wejściem', () => {
    const a = randomCorrelation(6, 11);
    const r = nearestCorrelation(a, 6);
    expect(r.changed).toBe(false);
    expect(Array.from(r.matrix)).toEqual(Array.from(a));
  });

  it('element 1.3 poza przekątną: wynik w [−1, 1], brak NaN', () => {
    const r = nearestCorrelation(Float64Array.of(1, 1.3, 1.3, 1), 2);
    expect(r.changed).toBe(true);
    for (const v of r.matrix) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
