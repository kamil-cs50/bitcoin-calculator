import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort, formatPercent, naturalFrequency, roundSig } from './format';

// Intl używa twardych spacji (U+00A0 / U+202F); w testach normalizujemy do zwykłej.
const n = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('roundSig', () => {
  it('zaokrągla do n cyfr znaczących', () => {
    expect(roundSig(1234567, 2)).toBe(1200000);
    expect(roundSig(0.012345, 3)).toBe(0.0123);
    expect(roundSig(-987, 1)).toBe(-1000);
    expect(roundSig(0, 3)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('skraca miliony do 2 cyfr znaczących', () => {
    expect(n(formatMoney(1234567, 'PLN', { sigDigits: 2 }))).toBe('1,2 mln zł');
  });
  it('małe kwoty zapisuje w całości', () => {
    expect(n(formatMoney(950, 'PLN'))).toBe('950 zł');
  });
  it('grupuje tysiące', () => {
    expect(n(formatMoney(12500, 'PLN'))).toBe('12 500 zł');
  });
  it('miliardy i inne waluty', () => {
    expect(n(formatMoney(2.5e9, 'PLN', { sigDigits: 2 }))).toBe('2,5 mld zł');
    expect(n(formatMoney(1500000, 'EUR', { sigDigits: 2 }))).toBe('1,5 mln €');
    expect(n(formatMoney(950, 'USD'))).toContain('950');
  });
  it('zaokrągla fałszywą precyzję przy sigDigits', () => {
    expect(n(formatMoney(123456, 'PLN', { sigDigits: 2 }))).toBe('120 000 zł');
  });
  it('liczby ujemne', () => {
    expect(n(formatMoney(-950, 'PLN'))).toMatch(/^[-−]950 zł$/);
  });
});

describe('formatPercent', () => {
  it('formatuje po polsku', () => {
    expect(n(formatPercent(0.123, 1))).toBe('12,3%');
    expect(n(formatPercent(0.5))).toBe('50%');
  });
});

describe('naturalFrequency', () => {
  it('używa częstości naturalnych', () => {
    expect(naturalFrequency(0.83)).toBe('w 8 na 10 przyszłości');
    expect(naturalFrequency(0.995)).toBe('w ponad 99 na 100 przyszłości');
    expect(naturalFrequency(0.004)).toBe('w mniej niż 1 na 100 przyszłości');
  });
  it('skraje przechodzą na setki, brzegi są uczciwe', () => {
    expect(naturalFrequency(0.97)).toBe('w 97 na 100 przyszłości');
    expect(naturalFrequency(0.03)).toBe('w 3 na 100 przyszłości');
    expect(naturalFrequency(0)).toBe('w żadnej przyszłości');
    expect(naturalFrequency(1)).toBe('w każdej przyszłości');
  });
});

describe('formatMoneyShort', () => {
  it('skraca tysiące i miliony do 2 cyfr znaczących (projekt v3)', () => {
    expect(n(formatMoneyShort(483_210, 'PLN'))).toBe('480 tys. zł');
    expect(n(formatMoneyShort(123_456, 'PLN'))).toBe('120 tys. zł');
    expect(n(formatMoneyShort(24_400, 'PLN'))).toBe('24 tys. zł');
    expect(n(formatMoneyShort(1_234, 'PLN'))).toBe('1,2 tys. zł');
    expect(n(formatMoneyShort(2_210_000, 'PLN'))).toBe('2,2 mln zł');
  });
  it('granica zaokrąglenia przechodzi w miliony, małe kwoty bez skrótu', () => {
    expect(n(formatMoneyShort(996_000, 'PLN'))).toBe('1 mln zł');
    expect(n(formatMoneyShort(950, 'PLN'))).toBe('950 zł');
    expect(n(formatMoneyShort(0, 'PLN'))).toBe('0 zł');
  });
  it('ujemne kwoty', () => {
    expect(n(formatMoneyShort(-48_000, 'PLN'))).toBe('-48 tys. zł');
  });
});
