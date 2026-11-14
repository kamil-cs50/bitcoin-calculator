import { pmt } from '../math/pmt';
import type { Withdrawal } from '../types';

/**
 * Polityka wypłat (spec 4.11). `onJanuary` ustala roczną kwotę (percent, abw);
 * `amountAt` zwraca miesięczną wypłatę nominalną (0 przed startMonth).
 * Podłoga i sufit ABW: realnie, miesięcznie.
 */
export class WithdrawalPolicy {
  private monthlyNominal = 0; // percent: stała nominalnie w ciągu roku
  private monthlyReal = 0; // abw: realnie, indeksowana CPI w ciągu roku

  constructor(private readonly w: Withdrawal, private readonly horizonMonths: number) {}

  reset(): void {
    this.monthlyNominal = 0;
    this.monthlyReal = 0;
  }

  onJanuary(t: number, wealthAfterTax: number, cpiLog: number): void {
    const w = this.w;
    const wealth = Math.max(0, wealthAfterTax);
    if (w.kind === 'percent') {
      this.monthlyNominal = (w.rate * wealth) / 12;
    } else if (w.kind === 'abw') {
      const n = Math.max(1, Math.ceil((this.horizonMonths - t) / 12));
      let m = pmt(w.expectedRealReturn, n, wealth * Math.exp(-cpiLog), true) / 12;
      if (w.floor !== undefined) m = Math.max(m, w.floor);
      if (w.cap !== undefined) m = Math.min(m, w.cap);
      this.monthlyReal = m;
    }
  }

  amountAt(t: number, cpiLog: number): number {
    const w = this.w;
    if (t < w.startMonth) return 0;
    switch (w.kind) {
      case 'fixedReal':
        return w.monthly * Math.exp(cpiLog);
      case 'percent':
        return this.monthlyNominal;
      case 'abw':
        return this.monthlyReal * Math.exp(cpiLog);
    }
  }
}
