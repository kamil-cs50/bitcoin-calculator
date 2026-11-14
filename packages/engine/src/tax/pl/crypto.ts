import { PL_CAPITAL_GAINS_RATE } from './securities';

/**
 * Koszyk kryptowalut (art. 30b ust. 1a, art. 22 ust. 14-16 PIT): bez FIFO.
 * Dochód roczny = przychody − (koszty z bieżącego roku + nadwyżka kosztów z lat poprzednich).
 * Nadwyżka przechodzi na kolejny rok bez limitu czasu. Nie łączy się z papierami.
 */
export class CryptoTaxPL {
  private proceeds = 0;
  private costs = 0;
  private _carry = 0;

  get carry(): number {
    return this._carry;
  }

  reset(): void {
    this.proceeds = 0;
    this.costs = 0;
    this._carry = 0;
  }

  onBuy(cost: number): void {
    this.costs += cost;
  }

  onSale(proceeds: number): void {
    this.proceeds += proceeds;
  }

  /** Zamyka rok; zwraca podatek (płatny w kwietniu) i aktualizuje nadwyżkę kosztów. */
  closeYear(): number {
    const income = this.proceeds - this.costs - this._carry;
    this.proceeds = 0;
    this.costs = 0;
    if (income > 0) {
      this._carry = 0;
      return PL_CAPITAL_GAINS_RATE * income;
    }
    this._carry = -income;
    return 0;
  }

  /** Podatek z zamknięcia roku teraz (bez zmiany stanu). */
  pendingTax(): number {
    return PL_CAPITAL_GAINS_RATE * Math.max(0, this.proceeds - this.costs - this._carry);
  }

  /**
   * Podatek roku bieżącego, gdyby zlikwidować pozycję o wartości rynkowej `marketValue` teraz:
   * 19% · max(0, przychody roku + wartość − koszty roku − nadwyżka z lat poprzednich) (pending i latent razem).
   */
  liquidationTax(marketValue: number): number {
    return PL_CAPITAL_GAINS_RATE * Math.max(0, this.proceeds + marketValue - this.costs - this._carry);
  }
}
