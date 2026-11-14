import { histogram } from '@sim/engine';
import { describe, expect, it } from 'vitest';
import { phi, priceAtZ } from '../features/results/BtcCard';
import { shortFrequency } from '../lib/format';
import { logTicks, yearStep } from './FanChart';
import { displayBins, sampleMedian } from './Histogram';

describe('displayBins (histogram do wyświetlenia)', () => {
  const skewed = Array.from({ length: 2000 }, (_, i) => Math.exp(Math.log(10_000) + (i / 1999) * Math.log(500)));
  it('dodatnie wartości o dużej rozpiętości: kosze równe w skali log, liczności sumują się do n', () => {
    const b = displayBins(skewed, 48);
    expect(b.log).toBe(true);
    expect(b.counts).toHaveLength(48);
    expect(b.counts.reduce((a, c) => a + c, 0)).toBe(skewed.length);
    // stały iloraz sąsiednich krawędzi
    const r0 = b.edges[1]! / b.edges[0]!;
    const r1 = b.edges[40]! / b.edges[39]!;
    expect(r1).toBeCloseTo(r0, 6);
  });
  it('wartości ≤ 0 (wyczerpany portfel) albo mała rozpiętość: kosze liniowe jak w silniku', () => {
    const withZero = [0, ...skewed];
    const b = displayBins(withZero, 20);
    expect(b.log).toBe(false);
    expect(b.counts).toEqual(Array.from(histogram(withZero, 20).counts));
    expect(displayBins([100, 200, 300], 3).log).toBe(false);
  });
});

describe('sampleMedian', () => {
  it('nieparzysta i parzysta liczba wartości, oryginał bez zmian', () => {
    const v = [5, 1, 3];
    expect(sampleMedian(v)).toBe(3);
    expect(v).toEqual([5, 1, 3]);
    expect(sampleMedian([4, 1, 3, 2])).toBe(2.5);
    expect(sampleMedian([])).toBeNaN();
  });
});

describe('oś wachlarza', () => {
  it('podziałka 1–2–5 w granicach osi logarytmicznej', () => {
    expect(logTicks(90_000, 2_600_000)).toEqual([100_000, 200_000, 500_000, 1_000_000, 2_000_000]);
    expect(logTicks(900, 9e7)).toEqual([1000, 5000, 20_000, 100_000, 500_000, 2_000_000, 10_000_000, 50_000_000]);
    expect(logTicks(150_000, 700_000)).toEqual([200_000, 500_000]);
    expect(logTicks(0, 10)).toEqual([]);
  });
  it('krok lat na osi czasu jak w projekcie', () => {
    expect([5, 10, 20, 30].map(yearStep)).toEqual([1, 2, 5, 10]);
  });
});

describe('karta BTC: podgląd ceny przy przesuwaniu', () => {
  const q = [80_000, 1_100_000, 14_000_000] as const;
  it('na środku mediana, na krańcach policzone kwantyle 10/90%, poza nimi przycięte', () => {
    expect(priceAtZ(q, 0)).toBeCloseTo(1_100_000, 0);
    expect(priceAtZ(q, -1.2815515655446004)).toBeCloseTo(80_000, 0);
    expect(priceAtZ(q, 1.2815515655446004)).toBeCloseTo(14_000_000, -1);
    expect(priceAtZ(q, 3)).toBeCloseTo(14_000_000, -1);
  });
  it('monotonicznie rośnie; przy zerowym dolnym kwantylu (upadek) interpolacja liniowa', () => {
    const zs = [-1.2, -0.6, 0, 0.6, 1.2];
    const p = zs.map((z) => priceAtZ(q, z));
    expect(p.every((v, i) => i === 0 || v > p[i - 1]!)).toBe(true);
    expect(priceAtZ([0, 100, 400], -1.2815515655446004)).toBeCloseTo(0, 6);
  });
  it('dystrybuanta normalna', () => {
    expect(phi(0)).toBeCloseTo(0.5, 6);
    expect(phi(1.2815515655446004)).toBeCloseTo(0.9, 4);
    expect(phi(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('shortFrequency', () => {
  it('te same progi co częstość naturalna, bez „w … przyszłości”', () => {
    expect(shortFrequency(0.3)).toBe('3 na 10');
    expect(shortFrequency(0.92)).toBe('92 na 100');
    expect(shortFrequency(0.004)).toBe('mniej niż 1 na 100');
  });
});
