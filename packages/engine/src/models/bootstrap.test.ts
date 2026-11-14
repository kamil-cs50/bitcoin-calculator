import { describe, expect, it } from 'vitest';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import { resample, resampleRows, stationaryBootstrap } from './bootstrap';

const uni = (seed: number): (() => number) => {
  const g = Xoshiro128ss.fromSeed(seed);
  return () => g.nextUniform();
};

/** Syntetyczny szereg AR(1) o autokorelacji `phi` (ziarno stałe), n obserwacji. */
function ar1(n: number, phi: number, seed: number): number[] {
  const u = uni(seed);
  const normal = (): number => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const out: number[] = [];
  let x = 0;
  for (let i = 0; i < 200 + n; i++) {
    x = phi * x + Math.sqrt(1 - phi * phi) * normal();
    if (i >= 200) out.push(x);
  }
  return out;
}

const mean = (x: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return s / x.length;
};
const sd = (x: ArrayLike<number>): number => {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i]! - m) ** 2;
  return Math.sqrt(s / (x.length - 1));
};
function acf1(x: ArrayLike<number>): number {
  const m = mean(x);
  let num = 0;
  let den = 0;
  for (let i = 0; i < x.length; i++) {
    den += (x[i]! - m) ** 2;
    if (i + 1 < x.length) num += (x[i]! - m) * (x[i + 1]! - m);
  }
  return num / den;
}

describe('stacjonarny bootstrap blokowy (Politis i Romano 1994)', () => {
  const n = 600;
  const L = 12;
  const R = 2000;
  const data = ar1(n, 0.5, 7);

  it('zachowuje średnią próby w 4 SE', () => {
    const u = uni(11);
    const means = new Float64Array(R);
    for (let r = 0; r < R; r++) means[r] = mean(resample(data, stationaryBootstrap(n, n, L, u).indices));
    const se = sd(means) / Math.sqrt(R);
    expect(Math.abs(mean(means) - mean(data))).toBeLessThan(4 * se);
  });

  it('autokorelacja lag 1 bliższa próbie niż w bootstrapie i.i.d. (blok = 1)', () => {
    const u = uni(13);
    let sb = 0;
    let iid = 0;
    for (let r = 0; r < R; r++) {
      sb += acf1(resample(data, stationaryBootstrap(n, n, L, u).indices));
      iid += acf1(resample(data, stationaryBootstrap(n, n, 1, u).indices));
    }
    sb /= R;
    iid /= R;
    const target = acf1(data);
    expect(target).toBeGreaterThan(0.4);
    expect(Math.abs(sb - target)).toBeLessThan(Math.abs(iid - target));
    expect(Math.abs(iid)).toBeLessThan(0.05); // i.i.d. gubi zależność
    expect(sb).toBeGreaterThan(0.7 * target);
  });

  it('długości bloków mają rozkład geometryczny o średniej L', () => {
    const u = uni(17);
    const lens: number[] = [];
    // jeden długi przebieg: obcięcie okna zaniża średnią długość bloków tylko na brzegach (znikomo przy 2e6)
    const { blockStart } = stationaryBootstrap(n, 2_000_000, L, u);
    const starts: number[] = [];
    blockStart.forEach((f, i) => f === 1 && starts.push(i));
    for (let k = 0; k + 1 < starts.length; k++) lens.push(starts[k + 1]! - starts[k]!);
    const m = lens.length;
    const p = 1 / L;
    const seMean = Math.sqrt((1 - p) / (p * p) / m);
    expect(Math.abs(mean(lens) - L)).toBeLessThan(4 * seMean);
    // P(len = 1) = p, P(len > 12) = (1-p)^12, wariancja = (1-p)/p²
    const f1 = lens.filter((l) => l === 1).length / m;
    expect(Math.abs(f1 - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / m));
    const q = Math.pow(1 - p, 12);
    const fTail = lens.filter((l) => l > 12).length / m;
    expect(Math.abs(fTail - q)).toBeLessThan(4 * Math.sqrt((q * (1 - q)) / m));
    expect(sd(lens) ** 2 / ((1 - p) / (p * p))).toBeGreaterThan(0.9);
    expect(sd(lens) ** 2 / ((1 - p) / (p * p))).toBeLessThan(1.1);
  });

  it('bloki biegną cyklicznie po indeksach i indeksy mieszczą się w [0, n)', () => {
    const { indices, blockStart } = stationaryBootstrap(50, 5000, 8, uni(3));
    expect(indices.length).toBe(5000);
    expect(blockStart[0]).toBe(1);
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(0);
      expect(indices[i]).toBeLessThan(50);
      if (blockStart[i] === 0) expect(indices[i]).toBe((indices[i - 1]! + 1) % 50);
    }
  });

  it('powtarzalność ziarna i walidacja argumentów', () => {
    const a = stationaryBootstrap(100, 300, 12, uni(5)).indices;
    const b = stationaryBootstrap(100, 300, 12, uni(5)).indices;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(() => stationaryBootstrap(0, 10, 12, uni(1))).toThrow(RangeError);
    expect(() => stationaryBootstrap(10, 10, 0.5, uni(1))).toThrow(RangeError);
    expect(() => stationaryBootstrap(10, -1, 12, uni(1))).toThrow(RangeError);
  });

  it('resampleRows zachowuje wiersze (korelacje między aktywami)', () => {
    const rows = data.slice(0, 100).map((v, i) => [v, 2 * v + 1, i]);
    const { indices } = stationaryBootstrap(100, 400, 12, uni(9));
    const out = resampleRows(rows, indices);
    expect(out.length).toBe(400);
    for (const r of out) {
      expect(r[1]).toBeCloseTo(2 * r[0]! + 1, 12);
      expect(rows[r[2]!]![0]).toBe(r[0]);
    }
  });
});
