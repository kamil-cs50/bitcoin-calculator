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
  // Guyton–Klinger: miesięczna wypłata nominalna (stała w ciągu roku) i stan ostatniej oceny reguł
  private gkInit = false;
  private gkCpiLog = 0;
  private gkTwrLog = 0;

  constructor(private readonly w: Withdrawal, private readonly horizonMonths: number) {}

  reset(): void {
    this.monthlyNominal = 0;
    this.monthlyReal = 0;
    this.gkInit = false;
    this.gkCpiLog = 0;
    this.gkTwrLog = 0;
  }

  /** Czy kernel ma wywołać `onJanuary` w miesiącu `t` poza styczniem i t = 0 (Guyton–Klinger ustala wypłatę startową). */
  needsStartCall(t: number): boolean {
    return this.w.kind === 'guytonKlinger' && t === this.w.startMonth;
  }

  /**
   * @param twrLog skumulowany log-zwrot ważony czasem (tylko Guyton–Klinger: zwrot portfela z minionego roku)
   * @param isJanuary false dla wywołania startowego poza styczniem (wtedy reguły nie są oceniane)
   */
  onJanuary(t: number, wealthAfterTax: number, cpiLog: number, twrLog = 0, isJanuary = true): void {
    const w = this.w;
    const wealth = Math.max(0, wealthAfterTax);
    if (w.kind === 'guytonKlinger') {
      this.guytonKlinger(w, t, wealth, cpiLog, twrLog, isJanuary);
      return;
    }
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

  /**
   * Guyton i Klinger 2006 (J. Financial Planning 19(3)). Wypłata startowa = initialRate · W. W każdym kolejnym
   * styczniu, wg stopy wypłat (roczna wypłata / wartość portfela):
   *  1. indeksacja inflacją, nie wyższą niż inflationCap; pomijana, gdy ostatni rok miał ujemny zwrot
   *     portfela, a stopa wypłat jest wyższa niż początkowa;
   *  2. ochrona kapitału: stopa > initialRate·(1+guardrail) -> wypłata · (1−adjustment), tylko gdy do końca
   *     horyzontu zostało więcej niż 15 lat;
   *  3. dobrobyt: stopa < initialRate·(1−guardrail) -> wypłata · (1+adjustment).
   * Reguły 2 i 3 oceniają wypłatę po kroku 1.
   */
  private guytonKlinger(w: Extract<Withdrawal, { kind: 'guytonKlinger' }>, t: number, wealth: number, cpiLog: number, twrLog: number, isJanuary: boolean): void {
    if (t < w.startMonth) return;
    if (!this.gkInit) {
      this.gkInit = true;
      this.monthlyNominal = (w.initialRate * wealth) / 12;
      this.gkCpiLog = cpiLog;
      this.gkTwrLog = twrLog;
      return;
    }
    if (!isJanuary) return;
    const initial = w.initialRate;
    const yearReturn = Math.exp(twrLog - this.gkTwrLog) - 1;
    const inflation = Math.exp(cpiLog - this.gkCpiLog) - 1;
    this.gkCpiLog = cpiLog;
    this.gkTwrLog = twrLog;
    if (wealth <= 0) return; // brak portfela: nic do oceny (ruinę zgłasza kernel)

    let annual = this.monthlyNominal * 12;
    const skipIndexation = yearReturn < 0 && annual / wealth > initial;
    if (!skipIndexation) annual *= 1 + Math.min(inflation, w.inflationCap);
    const rate = annual / wealth;
    if (rate > initial * (1 + w.guardrail)) {
      if (this.horizonMonths - t > 15 * 12) annual *= 1 - w.adjustment;
    } else if (rate < initial * (1 - w.guardrail)) {
      annual *= 1 + w.adjustment;
    }
    this.monthlyNominal = annual / 12;
  }

  amountAt(t: number, cpiLog: number): number {
    const w = this.w;
    if (t < w.startMonth) return 0;
    switch (w.kind) {
      case 'fixedReal':
        return w.monthly * Math.exp(cpiLog);
      case 'percent':
      case 'guytonKlinger':
        return this.monthlyNominal;
      case 'abw':
        return this.monthlyReal * Math.exp(cpiLog);
    }
  }
}
