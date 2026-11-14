import { describe, expect, it } from 'vitest';
import { evaluateT9, modelRealCagr, parseShillerCsv, quantile7, rollingCagr } from './backtest';

describe('parseShillerCsv', () => {
  const csv = [
    ',,,,,,,,,,',
    '"Stock Market Data Used in ""Irrational Exuberance"" Princeton",,,,,,,,,,',
    ',,,,Consumer,,,,,Real,',
    ',S&P,,,Price,,Long,,,Total,',
    ',Comp.,Dividend,Earnings,Index,Date,Interest,Real,Real,Return,Real',
    'Date,P,D,E,CPI,Fraction,Rate GS10,Price,Dividend,Price,Earnings',
    '1871.01,4.44,0.26,0.4,12.46,1871.04,5.32,112.1,6.5,100,10.1',
    '1871.02,4.5,0.26,0.4,12.84,1871.12,5.32,110.3,6.4,101,9.8',
    '1871.1,4.7,0.26,0.4,12.9,1871.79,5.33,118,6.5,110,10',
    '1871.11,4.8,0.26,0.4,12.9,1871.87,5.33,119,6.5,NA,10',
    ',Sept price is Sept 4th close,,,,,,,,,',
  ].join('\n');

  it('czyta datę (1871.1 = październik) i kolumnę Real Total Return Price, pomija NA i opisy', () => {
    const rows = parseShillerCsv(csv);
    expect(rows).toEqual([
      { date: '1871-01', realTr: 100 },
      { date: '1871-02', realTr: 101 },
      { date: '1871-10', realTr: 110 },
    ]);
  });

  it('bez nagłówka z kolumną realnego total return zgłasza błąd', () => {
    expect(() => parseShillerCsv('a,b\n1,2')).toThrow(/Real Total Return Price/);
  });
});

describe('okna historyczne', () => {
  it('stały wzrost 0,5%/mies. daje stałe CAGR (1,005^12 − 1) w każdym oknie', () => {
    const idx = Array.from({ length: 200 }, (_, i) => 100 * Math.pow(1.005, i));
    const c = rollingCagr(idx, 120);
    expect(c.length).toBe(200 - 120);
    for (const v of c) expect(v).toBeCloseTo(Math.pow(1.005, 12) - 1, 12);
  });

  it('za krótki szereg daje pustą listę', () => {
    expect(rollingCagr([1, 2, 3], 120)).toEqual([]);
  });

  it('quantile7 jak w R (typ 7)', () => {
    expect(quantile7([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile7([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 12);
    expect(quantile7([5, 1, 3], 0)).toBe(1);
    expect(quantile7([5, 1, 3], 1)).toBe(5);
  });
});

describe('kryterium T9', () => {
  it('historyczny p5 i p95 muszą leżeć między p1 a p99 modelu', () => {
    const model = { p1: -0.05, p99: 0.2 };
    expect(evaluateT9({ p5: -0.02, p95: 0.15 }, model).pass).toBe(true);
    expect(evaluateT9({ p5: -0.06, p95: 0.15 }, model).pass).toBe(false);
    expect(evaluateT9({ p5: -0.02, p95: 0.21 }, model).pass).toBe(false);
  });
});

describe('modelRealCagr', () => {
  const base = {
    asset: { g: 0.06, sigma: 0.16, se: 0.02, alpha: 1, b: 1 },
    market: { nu: 5, regime: { p01: 0.04, p10: 0.2, kappa1: 2.2, delta: 0.175 } },
    inflation: 0.03,
  };

  it('przy σ = 0, bez reżimów i bez niepewności daje dokładnie (1+g)/(1+π) − 1', () => {
    const r = modelRealCagr({ ...base, asset: { ...base.asset, sigma: 0 }, market: { ...base.market, regime: { p01: 0, p10: 1, kappa1: 1, delta: 0 } }, uncertaintyScale: 0 }, [10], 5, 1);
    for (const v of r.get(10)!) expect(v).toBeCloseTo(1.06 / 1.03 - 1, 10);
  });

  it('mediana realnego CAGR z modelu ≈ (1+g)/(1+π) − 1 w 4 SE; ten sam seed daje ten sam wynik', () => {
    const N = 4000;
    const r = modelRealCagr({ ...base, uncertaintyScale: 0 }, [10, 20], N, 42);
    const med = quantile7(Array.from(r.get(20)!), 0.5);
    // log-zwrot 20-letni ma sd ≈ σ√20 ≈ 0,72 (CAGR: ≈ σ/√20 ≈ 0,036); SE mediany ≈ 1,25·sd/√N
    const se = (1.2533 * 0.16) / Math.sqrt(20) / Math.sqrt(N);
    expect(Math.abs(Math.log1p(med) - (Math.log(1.06) - Math.log(1.03)))).toBeLessThan(4 * se * 1.3);
    expect(r.get(10)!.length).toBe(N);
    const r2 = modelRealCagr({ ...base, uncertaintyScale: 0 }, [10, 20], 50, 42);
    expect(Array.from(r2.get(20)!)).toEqual(Array.from(modelRealCagr({ ...base, uncertaintyScale: 0 }, [20], 50, 42).get(20)!));
  });
});
