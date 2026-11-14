import type { WrapperSettings, Wrapper } from '../../types';

/** Limity wpłat (zł/rok). Źródła i status weryfikacji: spec 6.4 (limity ◐), decisions-log. */
export const IKE_LIMIT_2026 = 28_260;
export const IKE_LIMIT_2027 = 30_099;
export const IKZE_LIMIT_2026 = 11_304;
export const IKZE_LIMIT_2027 = 12_039.6;

export const IKE_MIN_AGE = 60;
export const IKZE_MIN_AGE = 65;
const EARLY_WITHDRAWAL_RATE = 0.19;
const IKZE_PAYOUT_RATE = 0.1;
const DEFAULT_IKZE_TAX_RATE = 0.12;

/**
 * Podatek od wypłaty `proceeds` z opakowania przy koszcie nabycia `costBasis` i wieku `ageYears`
 * (art. 30b ust. 1a pkt 1 i art. 30b ust. 1 PIT w zakresie IKE/IKZE; uproszczenie: wypłata przed wiekiem
 * to 19% od zysku, bez zwrotu odliczeń IKZE).
 * IKE: po 60. roku życia 0, wcześniej 19% od zysku. IKZE: od 65. roku życia 10% od całej kwoty, wcześniej 19% od zysku.
 */
export function wrapperWithdrawalTax(wrapper: Wrapper, proceeds: number, costBasis: number, ageYears: number): number {
  if (wrapper === 'taxable') return 0;
  if (wrapper === 'IKZE' && ageYears >= IKZE_MIN_AGE) return IKZE_PAYOUT_RATE * proceeds;
  if (wrapper === 'IKE' && ageYears >= IKE_MIN_AGE) return 0;
  const gain = proceeds - costBasis;
  return gain > 0 ? EARLY_WITHDRAWAL_RATE * gain : 0;
}

/**
 * Ustawienia domyślne dla roku startu: limity 2026 i 2027 z tabeli, dla późniejszych lat limit 2027 rośnie
 * o `limitGrowth` rocznie; dla wcześniejszych używany jest limit 2026. Stawka zwrotu IKZE 12% (pierwszy próg PIT).
 */
export function defaultWrapperSettings(startYear: number, age: number, limitGrowth: number): WrapperSettings {
  let ike = IKE_LIMIT_2026;
  let ikze = IKZE_LIMIT_2026;
  if (startYear >= 2027) {
    const f = Math.pow(1 + limitGrowth, startYear - 2027);
    ike = IKE_LIMIT_2027 * f;
    ikze = IKZE_LIMIT_2027 * f;
  }
  return { ikeLimit: ike, ikzeLimit: ikze, ikzeTaxRate: DEFAULT_IKZE_TAX_RATE, age };
}

/**
 * Licznik wpłat do IKE i IKZE w roku kalendarzowym. Limit roku `y` to `limit × (1 + wzrost)^(y − rok startu)`.
 * Bez alokacji; stan ścieżki zerowany przez `reset`.
 */
export class WrapperAccounts {
  /** Część ostatniego `admit` pokryta środkami wewnętrznymi (poza limitem). */
  lastInternal = 0;
  readonly settings: WrapperSettings;
  private year = Number.NaN;
  private usedIke = 0;
  private usedIkze = 0;
  private prevIkze = 0;

  constructor(
    settings: WrapperSettings,
    private readonly startYear: number,
    private readonly defaultGrowth: number,
  ) {
    this.settings = settings;
  }

  private growth(): number {
    return this.settings.limitGrowth ?? this.defaultGrowth;
  }

  reset(): void {
    this.year = Number.NaN;
    this.usedIke = 0;
    this.usedIkze = 0;
    this.prevIkze = 0;
    this.lastInternal = 0;
  }

  /** Wołać co miesiąc z rokiem kalendarzowym; zmiana roku zeruje liczniki i zachowuje wpłaty IKZE do zwrotu. */
  newMonth(year: number): void {
    if (year === this.year) return;
    this.prevIkze = this.year === year - 1 ? this.usedIkze : 0;
    this.usedIke = 0;
    this.usedIkze = 0;
    this.year = year;
  }

  limit(wrapper: Wrapper): number {
    const base = wrapper === 'IKE' ? this.settings.ikeLimit : this.settings.ikzeLimit;
    return base * Math.pow(1 + this.growth(), Math.max(0, this.year - this.startYear));
  }

  /**
   * Ile z `amount` może wejść na konto `wrapper`: `internal` (środki przeniesione w obrębie tego samego opakowania)
   * plus pozostały limit roku. Zużywa limit; część wewnętrzna w `lastInternal`.
   */
  admit(wrapper: Wrapper, amount: number, internal: number): number {
    if (wrapper === 'taxable') {
      this.lastInternal = 0;
      return amount;
    }
    const inner = Math.min(amount, internal > 0 ? internal : 0);
    this.lastInternal = inner;
    const used = wrapper === 'IKE' ? this.usedIke : this.usedIkze;
    const room = Math.max(0, this.limit(wrapper) - used);
    const outer = Math.min(amount - inner, room);
    if (wrapper === 'IKE') this.usedIke += outer;
    else this.usedIkze += outer;
    return inner + outer;
  }

  /** Zwrot podatku za wpłaty IKZE poprzedniego roku (jednorazowo; wołać w kwietniu). */
  takeRefund(): number {
    const r = this.prevIkze * this.settings.ikzeTaxRate;
    this.prevIkze = 0;
    return r;
  }
}
