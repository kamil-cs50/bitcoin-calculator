import { describe, expect, it } from 'vitest';
import { nbpWindows } from './fetch';
import { parseArgs, parseCsvSeries, since, toMonthly } from './io';

describe('parseCsvSeries / toMonthly / since', () => {
  it('pomija nagłówek, obsługuje ; i przecinek dziesiętny', () => {
    expect(parseCsvSeries('date;level\n2024-01;100,5\n2024-02;101,25\n')).toEqual([
      { date: '2024-01', value: 100.5 },
      { date: '2024-02', value: 101.25 },
    ]);
    expect(parseCsvSeries('date,rate\n2024-01-02,4.01\n')).toEqual([{ date: '2024-01-02', value: 4.01 }]);
  });
  it('toMonthly bierze ostatnią obserwację miesiąca, since filtruje', () => {
    const m = toMonthly(parseCsvSeries('2024-01-02,1\n2024-01-30,2\n2024-02-01,3'));
    expect(m).toEqual([
      { date: '2024-01', value: 2 },
      { date: '2024-02', value: 3 },
    ]);
    expect(since(m, '2024-02')).toHaveLength(1);
  });
  it('parseArgs: powtarzalne klucze i flagi', () => {
    const a = parseArgs(['--input', 'a=1', '--input', 'b=2', '--fetch']);
    expect(a.flags.get('input')).toEqual(['a=1', 'b=2']);
    expect(a.flags.get('fetch')).toEqual(['true']);
  });
});

describe('nbpWindows', () => {
  it('okna po najwyżej 93 dni bez dziur i nakładania', () => {
    const w = nbpWindows('2020-01-01', '2020-12-31');
    expect(w[0]![0]).toBe('2020-01-01');
    expect(w[w.length - 1]![1]).toBe('2020-12-31');
    for (const [a, b] of w) expect((Date.parse(b) - Date.parse(a)) / 86_400_000 + 1).toBeLessThanOrEqual(93);
    for (let i = 1; i < w.length; i++)
      expect(Date.parse(w[i]![0]) - Date.parse(w[i - 1]![1])).toBe(86_400_000);
  });
});
