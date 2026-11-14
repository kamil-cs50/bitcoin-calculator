import { Trans, useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import type { Position, Wrapper } from '@sim/engine';
import { Button } from '../../components/ui/Button';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Field } from '../../components/ui/Field';
import { currencyWord } from '../results/basis';

export interface AssetTileProps {
  name: string;
  position: Position;
  onValue: (v: number) => void;
  onWrapper: (w: Wrapper) => void;
  onRemove: () => void;
  /** Dodatkowe pola pozycji (np. lata mieszkania) pod polem konta. */
  children?: ReactNode;
}

/** Kafel jednej pozycji: nazwa, wartość do edycji, konto (zwykłe / IKE / IKZE), usunięcie. */
export function AssetTile({ name, position, onValue, onWrapper, onRemove, children }: AssetTileProps) {
  const { t } = useLingui();
  // Wersja robocza pola: puste pole nie może cofnąć się do poprzedniej wartości ze store.
  const [draft, setDraft] = useState<number | null>(position.value);
  const accounts: { value: Wrapper; label: string }[] = [
    { value: 'taxable', label: t`Zwykłe` },
    { value: 'IKE', label: 'IKE' },
    { value: 'IKZE', label: 'IKZE' },
  ];
  return (
    <div role="group" aria-label={name} className="glass flex flex-col gap-[18px] rounded-[26px] p-[22px]">
      <h3 className="m-0 text-[22px] leading-tight font-light tracking-[-0.02em]">{name}</h3>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <MoneyInput
            display
            label={t`Wartość`}
            suffix={currencyWord('PLN')}
            value={draft}
            error={draft === null ? t`Wpisz kwotę.` : null}
            onChange={(v) => {
              setDraft(v);
              if (v !== null && v >= 0) onValue(v);
            }}
          />
        </div>
        <Button
          variant="danger"
          onClick={onRemove}
          aria-label={t`Usuń ${name}`}
          className="!min-h-[34px] !min-w-0 shrink-0 !px-3.5 !py-0 !font-mono !text-[10.5px] tracking-[0.05em] uppercase"
        >
          <Trans>Usuń</Trans>
        </Button>
      </div>
      <Field label={t`Konto`}>
        {(p) => (
          // Natywny select zostaje dla klawiatury i czytników ekranu (sr-only); pastylki obok to wygodny dotyk/mysz
          <div className="relative flex gap-0.5 rounded-full border border-hairline bg-well p-[3px] focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-(--focus)">
            {accounts.map((a) => (
              <button
                key={a.value}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => onWrapper(a.value)}
                className={`min-h-[34px] flex-1 cursor-pointer rounded-full border-0 text-[13px] transition-[background] duration-300 ${
                  position.wrapper === a.value ? 'bg-fg/13 text-fg' : 'bg-transparent text-fg/60 hover:text-fg'
                }`}
              >
                {a.label}
              </button>
            ))}
            <select
              {...p}
              className="sr-only"
              value={position.wrapper}
              onChange={(e) => onWrapper(e.target.value as Wrapper)}
            >
              {accounts.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </Field>
      {position.wrapper !== 'taxable' && (
        <p className="m-0 text-[12.5px] leading-normal font-light text-pretty text-fg/65">
          {position.wrapper === 'IKE'
            ? t`Reguły IKE (limit wpłat, wypłata bez podatku od 60 lat, wcześniej 19% od zysku) są niezweryfikowane w ISAP; wymóg 5 lat wpłat pominięty.`
            : t`Reguły IKZE (limit wpłat, zwrot podatku, 10% od wypłaty od 65 lat, wcześniej uproszczone 19% od zysku zamiast zwrotu odliczeń) są niezweryfikowane w ISAP; wymóg 5 lat wpłat pominięty.`}
        </p>
      )}
      {children}
    </div>
  );
}
