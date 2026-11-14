import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { probRuinWhileAlive, remainingLifeExpectancy, survivalCurve } from './mortality';

// Silnik nie zależy od @sim/data, więc test czyta plik zbioru wprost z dysku.
interface Table {
  qx: number[];
}
const raw = JSON.parse(
  readFileSync(new URL('../../../data/datasets/2026.11/lifeTables.json', import.meta.url), 'utf8'),
) as { male: Table; female: Table };
const M = raw.male.qx;
const K = raw.female.qx;

describe('tablice GUS 2025 (dane)', () => {
  it('zawierają q_x dla wieku 0-100 obu płci, wartości w [0, 1]', () => {
    expect(M).toHaveLength(101);
    expect(K).toHaveLength(101);
    for (const q of [...M, ...K]) {
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });
  it('q_0: mężczyźni 0,00333, kobiety 0,00316', () => {
    expect(M[0]).toBeCloseTo(0.00333, 5);
    expect(K[0]).toBeCloseTo(0.00316, 5);
  });
  it('dalsze trwanie życia w wieku 60 wyliczone z q_x: M 20,04, K 24,71 (±0,15)', () => {
    expect(Math.abs(remainingLifeExpectancy(M, 60) - 20.04)).toBeLessThan(0.15);
    expect(Math.abs(remainingLifeExpectancy(K, 60) - 24.71)).toBeLessThan(0.15);
  });
  it('dalsze trwanie życia w wieku 0 i 65 zgadza się z publikacją (±0,15)', () => {
    expect(Math.abs(remainingLifeExpectancy(M, 0) - 75.37)).toBeLessThan(0.15);
    expect(Math.abs(remainingLifeExpectancy(K, 0) - 82.48)).toBeLessThan(0.15);
    expect(Math.abs(remainingLifeExpectancy(M, 65) - 16.5)).toBeLessThan(0.15);
    expect(Math.abs(remainingLifeExpectancy(K, 65) - 20.47)).toBeLessThan(0.15);
  });
});

describe('survivalCurve', () => {
  it('ma długość months + 1, zaczyna się od 1 i jest nierosnąca', () => {
    const s = survivalCurve(M, 60, 480);
    expect(s).toBeInstanceOf(Float64Array);
    expect(s).toHaveLength(481);
    expect(s[0]).toBe(1);
    for (let t = 1; t < s.length; t++) expect(s[t]!).toBeLessThanOrEqual(s[t - 1]!);
    expect(s[480]!).toBeGreaterThan(0);
  });
  it('po pełnym roku równa się 1 - q_x (stała intensywność w roku)', () => {
    const s = survivalCurve(M, 60, 24);
    expect(s[12]!).toBeCloseTo(1 - M[60]!, 12);
    expect(s[24]!).toBeCloseTo((1 - M[60]!) * (1 - M[61]!), 12);
  });
  it('w środku roku interpoluje geometrycznie: S(6) = sqrt(1 - q_x)', () => {
    const s = survivalCurve(K, 70, 12);
    expect(s[6]!).toBeCloseTo(Math.sqrt(1 - K[70]!), 12);
  });
  it('całka z S odtwarza dalsze trwanie życia (±0,15 lat)', () => {
    const s = survivalCurve(M, 60, 12 * 60);
    let years = 0;
    for (let t = 0; t < 12 * 60; t++) years += ((s[t]! + s[t + 1]!) / 2) / 12;
    expect(Math.abs(years - remainingLifeExpectancy(M, 60))).toBeLessThan(0.15);
  });
  it('powyżej końca tablicy używa ostatniego q_x i pozostaje nierosnąca', () => {
    const s = survivalCurve(M, 99, 12 * 10);
    expect(s[12 * 10]!).toBeGreaterThan(0);
    for (let t = 1; t < s.length; t++) expect(s[t]!).toBeLessThanOrEqual(s[t - 1]!);
  });
  it('q = 1 zeruje przeżycie od następnego roku', () => {
    const s = survivalCurve([0.1, 1], 0, 36);
    expect(s[12]!).toBeCloseTo(0.9, 12);
    expect(s[13]!).toBe(0);
    expect(s[36]!).toBe(0);
  });
  it('extraYears (kohortowa poprawka „+2 lata”) zwiększa przeżycie, 0 nic nie zmienia', () => {
    const base = survivalCurve(M, 60, 240);
    const same = survivalCurve(M, 60, 240, 0);
    const plus = survivalCurve(M, 60, 240, 2);
    expect(Array.from(same)).toEqual(Array.from(base));
    expect(plus[240]!).toBeGreaterThan(base[240]!);
    expect(plus[12]!).toBeCloseTo(1 - M[58]!, 12); // ryzyko jak u osoby o 2 lata młodszej
  });
  it('odrzuca niepoprawne argumenty', () => {
    expect(() => survivalCurve(M, -1, 12)).toThrow(RangeError);
    expect(() => survivalCurve(M, 60, -1)).toThrow(RangeError);
    expect(() => survivalCurve([], 60, 12)).toThrow(RangeError);
  });
});

describe('probRuinWhileAlive', () => {
  const s = survivalCurve(M, 60, 240);
  it('brak ruiny (−1 na wszystkich ścieżkach) → p === 0', () => {
    const r = probRuinWhileAlive(new Int32Array(1000).fill(-1), s);
    expect(r.p).toBe(0);
    expect(r.ci[0]).toBe(0);
    expect(r.ci[1]).toBeGreaterThan(0);
  });
  it('ruina w miesiącu 0 na wszystkich ścieżkach → p === 1', () => {
    const r = probRuinWhileAlive(new Int32Array(1000), s);
    expect(r.p).toBe(1);
    expect(r.ci[1]).toBe(1);
  });
  it('p = (1/N) Σ S(t_i) po ścieżkach z ruiną', () => {
    const ruin = Int32Array.from([-1, 120, 240, -1]);
    const r = probRuinWhileAlive(ruin, s);
    expect(r.p).toBeCloseTo((s[120]! + s[240]!) / 4, 14);
  });
  it('jest mniejsze od zwykłego odsetka ruin i ma przedział zawierający p', () => {
    const n = 2000;
    const ruin = new Int32Array(n).fill(-1);
    for (let i = 0; i < 600; i++) ruin[i] = 100 + (i % 140);
    const r = probRuinWhileAlive(ruin, s);
    expect(r.p).toBeLessThan(600 / n);
    expect(r.ci[0]).toBeLessThanOrEqual(r.p);
    expect(r.ci[1]).toBeGreaterThanOrEqual(r.p);
  });
  it('ruina po końcu krzywej przeżycia używa ostatniej wartości; pusta próba → 0', () => {
    expect(probRuinWhileAlive(Int32Array.from([9999]), s).p).toBeCloseTo(s[240]!, 14);
    expect(probRuinWhileAlive(new Int32Array(0), s).p).toBe(0);
  });
});
