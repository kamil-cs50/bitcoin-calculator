/**
 * Nieruchomość na wynajem: reguły podatkowe (spec 4.8, 4.10, 6.4).
 *
 * UPROSZCZENIA NIEZWERYFIKOWANE W ISAP (spec 6.4, wiersz „Stawki i zasady podatkowe”: przepisy cytowane z pamięci):
 *  - ryczałt od najmu prywatnego 8,5% do 100 000 zł przychodu rocznie i 12,5% od nadwyżki (ustawa o zryczałtowanym podatku),
 *    liczony i pobierany tu miesięcznie narastająco od przychodu (czynsz netto z założenia), bez odliczeń i bez wyboru skali;
 *  - sprzedaż: 19% od zysku (przychód − koszt nabycia, bez nakładów i kosztów zbycia); zwolnienie (tylko przy podanym roku zakupu), gdy sprzedaż następuje
 *    po upływie 5 lat od końca roku kalendarzowego nabycia (art. 10 ust. 1 pkt 8 ustawy o PIT), czyli w roku
 *    `purchaseYear + 6` lub później;
 *  - bez ulgi mieszkaniowej, bez składki zdrowotnej, bez kosztów utrzymania poza uwzględnionymi w czynszu netto.
 */

/** Stawki ryczałtu od najmu (pl). */
export const RENTAL_RATE_LOW = 0.085;
export const RENTAL_RATE_HIGH = 0.125;
/** Próg rocznego przychodu, do którego obowiązuje stawka niższa (zł). */
export const RENTAL_THRESHOLD = 100_000;
/** Stawka podatku od zysku ze sprzedaży nieruchomości (pl). */
export const REAL_ESTATE_GAIN_RATE = 0.19;
/** Liczba pełnych lat po roku nabycia, po których sprzedaż jest zwolniona. */
export const EXEMPT_YEARS_AFTER_PURCHASE = 5;

/** Ryczałt od przychodu `revenue` z najmu, gdy dotychczasowy przychód roku wynosi `cumulativeBefore`. */
export function rentalIncomeTax(cumulativeBefore: number, revenue: number): number {
  if (!(revenue > 0)) return 0;
  const room = RENTAL_THRESHOLD - cumulativeBefore;
  const low = room > 0 ? Math.min(revenue, room) : 0;
  return RENTAL_RATE_LOW * low + RENTAL_RATE_HIGH * (revenue - low);
}

/**
 * Podatek od sprzedaży: `rate` · zysk, chyba że sprzedaż w roku `saleYear` jest zwolniona. Brak `purchaseYear`
 * traktujemy konserwatywnie jako sprzedaż bez zwolnienia (nie „zwolnioną po cichu”): zwolnienie wymaga podania roku zakupu.
 */
export function realEstateSaleTax(rate: number, gain: number, purchaseYear: number | undefined, saleYear: number): number {
  if (!(gain > 0)) return 0;
  if (purchaseYear !== undefined && saleYear > purchaseYear + EXEMPT_YEARS_AFTER_PURCHASE) return 0;
  return rate * gain;
}
