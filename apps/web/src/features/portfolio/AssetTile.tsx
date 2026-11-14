import { Trans, useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import type { Position, Wrapper } from '@sim/engine';
import { Button } from '../../components/ui/Button';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Field, inputClass } from '../../components/ui/Field';
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
  return (
    <div
      role="group"
      aria-label={name}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h3 className="text-base font-semibold">{name}</h3>
      <MoneyInput
        label={t`Wartość`}
        suffix={currencyWord('PLN')}
        value={draft}
        error={draft === null ? t`Wpisz kwotę.` : null}
        onChange={(v) => {
          setDraft(v);
          if (v !== null && v >= 0) onValue(v);
        }}
      />
      <Field label={t`Konto`}>
        {(p) => (
          <select
            {...p}
            className={inputClass}
            value={position.wrapper}
            onChange={(e) => onWrapper(e.target.value as Wrapper)}
          >
            <option value="taxable">{t`Zwykłe`}</option>
            <option value="IKE">IKE</option>
            <option value="IKZE">IKZE</option>
          </select>
        )}
      </Field>
      {position.wrapper !== 'taxable' && (
        <p className="m-0 text-sm text-muted">
          {position.wrapper === 'IKE'
            ? t`Reguły IKE (limit wpłat, wypłata bez podatku od 60 lat, wcześniej 19% od zysku) są niezweryfikowane w ISAP; wymóg 5 lat wpłat pominięty.`
            : t`Reguły IKZE (limit wpłat, zwrot podatku, 10% od wypłaty od 65 lat, wcześniej uproszczone 19% od zysku zamiast zwrotu odliczeń) są niezweryfikowane w ISAP; wymóg 5 lat wpłat pominięty.`}
        </p>
      )}
      {children}
      <Button variant="danger" onClick={onRemove} aria-label={t`Usuń ${name}`}>
        <Trans>Usuń</Trans>
      </Button>
    </div>
  );
}
