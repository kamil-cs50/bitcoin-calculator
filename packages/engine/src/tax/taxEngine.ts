import type { TaxForm, TaxMode, Warning, Wrapper } from '../types';
import { CryptoTaxPL } from './pl/crypto';
import { SecuritiesTaxPL } from './pl/securities';

export interface TaxEngine {
  reset(): void;
  onBuy(form: TaxForm, wrapper: Wrapper, cost: number, month: number): void;
  onSale(form: TaxForm, wrapper: Wrapper, proceeds: number, costFifo: number, month: number, holdingMonths: number): void;
  /** Podatek do zapłaty w kwietniu roku year+1. */
  closeYear(year: number): number;
  /** Podatek za rok `year`, gdyby zamknąć go teraz (zobowiązanie z dotychczasowych sprzedaży); bez zmiany stanu. */
  pendingTax(year: number): number;
  latentTax(positions: { form: TaxForm; wrapper: Wrapper; value: number; basis: number }[], year: number): number;
  readonly warnings: Warning[];
}

const GOLD_EXEMPT_MONTHS = 7;

class NoTaxEngine implements TaxEngine {
  readonly warnings: Warning[] = [];
  reset(): void {}
  onBuy(): void {}
  onSale(): void {}
  closeYear(): number {
    return 0;
  }
  pendingTax(): number {
    return 0;
  }
  latentTax(): number {
    return 0;
  }
}

class FlatTaxEngine implements TaxEngine {
  readonly warnings: Warning[] = [];
  private due = 0;
  constructor(private readonly rate: number) {}
  reset(): void {
    this.due = 0;
    this.warnings.length = 0;
  }
  onBuy(): void {}
  onSale(form: TaxForm, wrapper: Wrapper, proceeds: number, costFifo: number): void {
    if (wrapper !== 'taxable' || form === 'none') return;
    const gain = proceeds - costFifo;
    if (gain > 0) this.due += this.rate * gain;
  }
  closeYear(): number {
    const t = this.due;
    this.due = 0;
    return t;
  }
  pendingTax(): number {
    return this.due;
  }
  latentTax(positions: { form: TaxForm; wrapper: Wrapper; value: number; basis: number }[]): number {
    let t = 0;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      if (p.wrapper !== 'taxable' || p.form === 'none') continue;
      const g = p.value - p.basis;
      if (g > 0) t += this.rate * g;
    }
    return t;
  }
}

class PlTaxEngine implements TaxEngine {
  readonly warnings: Warning[] = [];
  private readonly securities = new SecuritiesTaxPL();
  private readonly crypto = new CryptoTaxPL();

  reset(): void {
    this.securities.reset();
    this.crypto.reset();
    this.warnings.length = 0;
  }

  onBuy(form: TaxForm, wrapper: Wrapper, cost: number): void {
    if (wrapper === 'taxable' && form === 'crypto') this.crypto.onBuy(cost);
  }

  onSale(form: TaxForm, wrapper: Wrapper, proceeds: number, costFifo: number, _month: number, holdingMonths: number): void {
    if (wrapper !== 'taxable') return;
    switch (form) {
      case 'crypto':
        this.crypto.onSale(proceeds);
        break;
      case 'security':
        this.securities.onSale(proceeds, costFifo);
        break;
      case 'physicalGold':
        if (holdingMonths < GOLD_EXEMPT_MONTHS) this.securities.onSale(proceeds, costFifo);
        break;
      default:
        break;
    }
  }

  closeYear(year: number): number {
    const s = this.securities.closeYear(year);
    for (let i = 0; i < s.warnings.length; i++) this.warnings.push(s.warnings[i]!);
    return s.tax + this.crypto.closeYear();
  }

  pendingTax(year: number): number {
    return this.securities.pendingTax(year) + this.crypto.pendingTax();
  }

  latentTax(positions: { form: TaxForm; wrapper: Wrapper; value: number; basis: number }[], year: number): number {
    let secGain = 0;
    let cryptoValue = 0;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      if (p.wrapper !== 'taxable') continue;
      if (p.form === 'security') secGain += p.value - p.basis;
      else if (p.form === 'crypto') cryptoValue += p.value;
      // physicalGold: zakładamy zwolnienie po 6 miesiącach, brak podatku utajonego
    }
    return this.securities.latentTax(secGain, year) + this.crypto.latentTax(cryptoValue);
  }
}

export function createTaxEngine(mode: TaxMode): TaxEngine {
  switch (mode.kind) {
    case 'none':
      return new NoTaxEngine();
    case 'flat':
      return new FlatTaxEngine(mode.rate);
    case 'pl':
      return new PlTaxEngine();
  }
}

