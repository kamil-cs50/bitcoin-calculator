import type { EdoParams } from '../types';

const MATURITY_MONTHS = 120;

/**
 * Wypłata netto przy wykupie przedterminowym (spec 4.8 / 6.4). Reguły „opłata ≤ narosłe odsetki”
 * i „opłata pomniejsza podstawę podatku” są niepotwierdzone w liście emisyjnym; trzymane tylko tutaj.
 */
export function earlyRedemptionPayout(value: number, nominal: number, feePer100: number, taxRate: number): number {
  const interest = Math.max(0, value - nominal);
  const fee = Math.min((nominal / 100) * feePer100, interest);
  const base = Math.max(0, interest - fee);
  return value - fee - taxRate * base;
}

/** Partie EDO w tablicach o stałej pojemności (bez alokacji w gorącej ścieżce); partie uporządkowane od najstarszej. */
export class EdoHoldings {
  private readonly p: EdoParams;
  private n = 0;
  private readonly nominal: Float64Array; // nominał pierwotny (podstawa opłaty i odsetek)
  private readonly capital: Float64Array; // nominał + skapitalizowane odsetki
  private readonly rate: Float64Array; // oprocentowanie bieżącego roku
  private readonly buyMonth: Float64Array;
  private readonly periodStart: Float64Array;
  constructor(p: EdoParams, capacity: number) {
    this.p = p;
    this.nominal = new Float64Array(capacity);
    this.capital = new Float64Array(capacity);
    this.rate = new Float64Array(capacity);
    this.buyMonth = new Float64Array(capacity);
    this.periodStart = new Float64Array(capacity);
  }
  reset(): void {
    this.n = 0;
  }
  buy(nominal: number, month: number, firstYearRate: number): void {
    if (nominal <= 0) return;
    const i = this.n;
    if (i >= this.nominal.length) throw new Error('EdoHoldings: przekroczona pojemność');
    this.nominal[i] = nominal;
    this.capital[i] = nominal;
    this.rate[i] = firstYearRate;
    this.buyMonth[i] = month;
    this.periodStart[i] = month;
    this.n++;
  }
  private valueOf(i: number, month: number): number {
    return this.capital[i]! * (1 + (this.rate[i]! * (month - this.periodStart[i]!)) / 12);
  }
  onMonth(month: number, yyLag2: number, x: number, taxRate: number): number {
    let cash = 0;
    let roll = 0;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = month - this.buyMonth[i]!;
      if (age > 0 && age % 12 === 0) {
        this.capital[i] = this.capital[i]! * (1 + this.rate[i]!);
        this.periodStart[i] = month;
        this.rate[i] = Math.max(0, yyLag2) + this.p.margin;
      }
      if (age >= MATURITY_MONTHS) {
        const interest = this.capital[i]! - this.nominal[i]!;
        const net = this.capital[i]! - taxRate * Math.max(0, interest);
        if (this.p.onMaturity === 'roll') roll += net;
        else cash += net;
        continue;
      }
      if (w !== i) {
        this.nominal[w] = this.nominal[i]!;
        this.capital[w] = this.capital[i]!;
        this.rate[w] = this.rate[i]!;
        this.buyMonth[w] = this.buyMonth[i]!;
        this.periodStart[w] = this.periodStart[i]!;
      }
      w++;
    }
    this.n = w;
    if (roll > 0) this.buy(roll, month, Math.max(0, x) + this.p.margin);
    return cash;
  }
  redeemEarly(amountNet: number, month: number, taxRate: number): number {
    let got = 0;
    let w = 0;
    const fee = this.p.earlyFeePer100;
    for (let i = 0; i < this.n; i++) {
      const remaining = amountNet - got;
      if (remaining > 1e-12) {
        const v = this.valueOf(i, month);
        const full = earlyRedemptionPayout(v, this.nominal[i]!, fee, taxRate);
        if (full > 0) {
          // wypłata jest liniowa w ułamku partii (opłata i podatek skalują się proporcjonalnie)
          const f = Math.min(1, remaining / full);
          got += f * full;
          this.nominal[i] = this.nominal[i]! * (1 - f);
          this.capital[i] = this.capital[i]! * (1 - f);
          if (f >= 1) continue;
        }
      }
      if (w !== i) {
        this.nominal[w] = this.nominal[i]!;
        this.capital[w] = this.capital[i]!;
        this.rate[w] = this.rate[i]!;
        this.buyMonth[w] = this.buyMonth[i]!;
        this.periodStart[w] = this.periodStart[i]!;
      }
      w++;
    }
    this.n = w;
    return got;
  }
  value(month: number): number {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.valueOf(i, month);
    return s;
  }
  netValue(month: number, taxRate: number): number {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += earlyRedemptionPayout(this.valueOf(i, month), this.nominal[i]!, this.p.earlyFeePer100, taxRate);
    return s;
  }
}
