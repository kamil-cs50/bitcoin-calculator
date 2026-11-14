import type { DepositParams } from '../types';

/** Lokata / konto (spec 4.8): d ← max(0, d + k(x + s − d)); odsetki miesięczne, podatek u źródła przy dopisaniu. */
export class DepositAccount {
  balance = 0;
  rate: number;
  private readonly p: DepositParams;
  constructor(p: DepositParams) {
    this.p = p;
    this.rate = p.initialRate;
  }
  reset(balance: number): void {
    this.balance = balance;
    this.rate = this.p.initialRate;
  }
  /** Dopisuje odsetki miesięczne netto wg bieżącej stopy, potem aktualizuje stopę względem inflacji x. Zwraca odsetki netto. */
  accrue(x: number, taxRate: number): number {
    const net = ((this.balance * this.rate) / 12) * (1 - taxRate);
    this.balance += net;
    this.rate = Math.max(0, this.rate + this.p.k * (x + this.p.spread - this.rate));
    return net;
  }
  deposit(a: number): void {
    this.balance += a;
  }
  withdraw(a: number): number {
    const w = Math.min(Math.max(a, 0), this.balance);
    this.balance -= w;
    return w;
  }
}
