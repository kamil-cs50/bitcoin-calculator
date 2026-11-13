import { describe, expect, it } from 'vitest';
import { Xoshiro128ss } from './xoshiro128ss';
import { factorKey, fmix32, streamSeed } from './streams';

describe('Xoshiro128ss', () => {
  it('zgadza się z wartościami referencyjnymi dla stanu (1,2,3,4)', () => {
    const g = Xoshiro128ss.fromState(1, 2, 3, 4);
    expect([g.nextU32(), g.nextU32(), g.nextU32()]).toEqual([11520, 0, 5927040]);
  });

  it('jest jednostajny (chi2 < 161.3, 99 st. swobody)', () => {
    const g = Xoshiro128ss.fromSeed(12345);
    const n = 1_000_000;
    const bins = new Array<number>(100).fill(0);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(g.nextUniform() * 100);
      bins[j] = (bins[j] ?? 0) + 1;
    }
    const e = n / 100;
    let chi2 = 0;
    for (const o of bins) chi2 += ((o - e) * (o - e)) / e;
    expect(chi2).toBeLessThan(161.3);
  });

  it('daje 0 < u < 1 dla 1e6 losowań', () => {
    const g = Xoshiro128ss.fromSeed(99);
    for (let i = 0; i < 1_000_000; i++) {
      const u = g.nextUniform();
      expect(u > 0 && u < 1).toBe(true);
    }
  });

  it('fromSeed jest deterministyczny, a reseed odtwarza ciąg', () => {
    const a = Xoshiro128ss.fromSeed(7);
    const b = Xoshiro128ss.fromSeed(7);
    const xa: number[] = [];
    const xb: number[] = [];
    for (let i = 0; i < 1000; i++) {
      xa.push(a.nextU32());
      xb.push(b.nextU32());
    }
    expect(xa).toEqual(xb);
    a.reseed(7);
    expect(a.nextU32()).toBe(xa[0]);
  });
});

describe('strumienie', () => {
  const k = factorKey('asset:BTC');

  it('streamSeed rozróżnia ścieżki i ziarna', () => {
    const s10 = streamSeed(1, 0, k);
    const s11 = streamSeed(1, 1, k);
    const s20 = streamSeed(2, 0, k);
    expect(s10).not.toBe(s11);
    expect(s11).not.toBe(s20);
    expect(s10).not.toBe(s20);
    expect(streamSeed(1, 0, k)).toBe(s10);
  });

  it('factorKey to FNV-1a 32-bit (wektory referencyjne)', () => {
    expect(factorKey('')).toBe(0x811c9dc5);
    expect(factorKey('a')).toBe(0xe40c292c);
    expect(factorKey('foobar')).toBe(0xbf9cf968);
  });

  it('fmix32 to finalizator MurmurHash3 (fmix32(0)=0, fmix32(1)=0x514e28b7)', () => {
    expect(fmix32(0)).toBe(0);
    expect(fmix32(1)).toBe(0x514e28b7);
  });

  it('próbki z dwóch strumieni są nieskorelowane', () => {
    const n = 1e5;
    const a = Xoshiro128ss.fromSeed(streamSeed(1, 0, k));
    const b = Xoshiro128ss.fromSeed(streamSeed(1, 1, k));
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const x = a.nextUniform();
      const y = b.nextUniform();
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    expect(Math.abs(r)).toBeLessThan(4 / Math.sqrt(n));
  });
});
