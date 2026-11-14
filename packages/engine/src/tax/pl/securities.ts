import type { Warning } from '../../types';

export const PL_CAPITAL_GAINS_RATE = 0.19;

const LOSS_VALID_YEARS = 5;
const LUMP_SUM_LIMIT = 5_000_000;
const ANNUAL_SHARE = 0.5;

interface LossVintage {
  year: number;
  original: number;
  remaining: number;
  lumpUsed: boolean;
}

/**
 * Podatek od papierów wartościowych (art. 30b PIT) ze stratami wg art. 9 ust. 3 (spec R-3).
 * Dla każdego rocznika straty: w pierwszym roku z dodatnim dochodem odliczenie jednorazowe do 5 mln zł,
 * potem do 50% pierwotnej straty rocznie; ważność 5 kolejnych lat; roczniki od najstarszego.
 */
export class SecuritiesTaxPL {
  private proceeds = 0;
  private cost = 0;
  private losses: LossVintage[] = [];

  reset(): void {
    this.proceeds = 0;
    this.cost = 0;
    this.losses = [];
  }

  onSale(proceeds: number, cost: number): void {
    this.proceeds += proceeds;
    this.cost += cost;
  }

  private valid(v: LossVintage, year: number): boolean {
    return v.remaining > 1e-9 && year > v.year && year <= v.year + LOSS_VALID_YEARS;
  }

  closeYear(year: number): { tax: number; warnings: Warning[] } {
    const warnings: Warning[] = [];
    let income = this.proceeds - this.cost;
    this.proceeds = 0;
    this.cost = 0;
    this.losses = this.losses.filter((v) => year <= v.year + LOSS_VALID_YEARS);

    if (income < 0) {
      const loss = -income;
      this.losses.push({ year, original: loss, remaining: loss, lumpUsed: false });
      if (loss > LUMP_SUM_LIMIT) {
        warnings.push({
          code: 'LOSS_OVER_5M',
          message: 'Strata przekracza 5 mln zł; model upraszcza zasady odliczania (art. 9 ust. 3 PIT).',
          data: { year, loss },
        });
      }
      return { tax: 0, warnings };
    }

    if (income > 0) {
      for (const v of this.losses) {
        if (income <= 0) break;
        if (!this.valid(v, year)) continue;
        let cap: number;
        if (!v.lumpUsed) {
          cap = LUMP_SUM_LIMIT;
          v.lumpUsed = true;
        } else {
          cap = ANNUAL_SHARE * v.original;
        }
        const d = Math.min(income, v.remaining, cap);
        v.remaining -= d;
        income -= d;
      }
    }
    return { tax: PL_CAPITAL_GAINS_RATE * Math.max(0, income), warnings };
  }

  lossesAvailable(year: number): number {
    return this.losses.reduce((s, v) => s + (this.valid(v, year) ? v.remaining : 0), 0);
  }

  latentTax(unrealizedGain: number, year: number): number {
    return PL_CAPITAL_GAINS_RATE * Math.max(0, unrealizedGain - this.lossesAvailable(year));
  }
}
