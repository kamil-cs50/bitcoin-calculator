import { useLingui } from '@lingui/react/macro';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { currencyWord } from '../results/basis';

/** Najwcześniejszy dopuszczony rok zakupu i najdalszy rok sprzedaży liczony od startu symulacji. */
export const MIN_PURCHASE_YEAR = 1900;
export const MAX_SALE_YEARS_AHEAD = 80;

export interface RealEstateDraft {
  purchaseYear: number | null;
  saleYear: number | null;
  /** Cena zakupu (podstawa podatku od zysku); null = tyle co wartość dziś. */
  costBasis: number | null;
}

export type RealEstateErrors = { purchaseYear: boolean; saleYear: boolean; costBasis: boolean };

/** Walidacja lat i ceny zakupu: rok zakupu do roku startu włącznie, rok sprzedaży od startu, nie przed zakupem. */
export function realEstateErrors(d: RealEstateDraft, startYear: number): RealEstateErrors {
  const { purchaseYear: py, saleYear: sy, costBasis: cb } = d;
  return {
    purchaseYear: py !== null && (!Number.isInteger(py) || py < MIN_PURCHASE_YEAR || py > startYear),
    saleYear:
      sy !== null &&
      (!Number.isInteger(sy) || sy < startYear || sy > startYear + MAX_SALE_YEARS_AHEAD || (py !== null && sy < py)),
    costBasis: cb !== null && !(cb > 0),
  };
}

export const hasRealEstateError = (e: RealEstateErrors): boolean => e.purchaseYear || e.saleYear || e.costBasis;

export interface RealEstateFieldsProps {
  draft: RealEstateDraft;
  startYear: number;
  onChange: (patch: Partial<RealEstateDraft>) => void;
}

/**
 * Pola mieszkania: rok zakupu, cena zakupu i rok sprzedaży (opcjonalne). Rok zakupu decyduje o zwolnieniu z podatku
 * od zysku ze sprzedaży (po 5 latach); bez niego nie zakładamy zwolnienia (wartość po podatku jest wtedy ostrożniejsza).
 */
export function RealEstateFields({ draft, startYear, onChange }: RealEstateFieldsProps) {
  const { t } = useLingui();
  const err = realEstateErrors(draft, startYear);
  const maxSale = startYear + MAX_SALE_YEARS_AHEAD;
  return (
    <div className="flex flex-col gap-3">
      <MoneyInput
        label={t`Rok zakupu (opcjonalnie)`}
        value={draft.purchaseYear}
        onChange={(v) => onChange({ purchaseYear: v })}
        hint={
          draft.purchaseYear === null
            ? t`Bez roku zakupu nie zakładamy zwolnienia z podatku od zysku ze sprzedaży: liczymy go tak, jakby od zakupu minęło mniej niż 5 lat.`
            : t`Sprzedaż po upływie 5 lat od końca roku zakupu jest zwolniona z podatku od zysku.`
        }
        error={err.purchaseYear ? t`Rok zakupu: od ${MIN_PURCHASE_YEAR} do ${startYear}.` : null}
      />
      <MoneyInput
        label={t`Cena zakupu (opcjonalnie)`}
        suffix={currencyWord('PLN')}
        value={draft.costBasis}
        onChange={(v) => onChange({ costBasis: v })}
        hint={t`Od zysku względem tej ceny liczymy podatek przy sprzedaży. Puste: tyle co wartość dziś (bez zysku).`}
        error={err.costBasis ? t`Cena zakupu musi być większa od zera.` : null}
      />
      <MoneyInput
        label={t`Rok sprzedaży (opcjonalnie)`}
        value={draft.saleYear}
        onChange={(v) => onChange({ saleYear: v })}
        hint={t`Puste: nie sprzedajesz w trakcie planu. Sprzedaż następuje w pierwszym miesiącu tego roku.`}
        error={err.saleYear ? t`Rok sprzedaży: od ${startYear} do ${maxSale}, nie wcześniej niż rok zakupu.` : null}
      />
      <p className="m-0 text-sm text-muted">
        {t`Przepisy cytowane z pamięci, niezweryfikowane w ISAP: ryczałt od najmu 8,5% i 12,5% (próg 100 000 zł rocznie), 19% od zysku ze sprzedaży, zwolnienie po 5 latach. Szczegóły w Założeniach.`}
      </p>
    </div>
  );
}
