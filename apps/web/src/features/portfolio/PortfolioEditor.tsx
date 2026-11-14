import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { formatMoney } from '../../lib/format';
import { useScenarioStore } from '../../state/scenarioStore';
import { AssetTile } from './AssetTile';
import { PositionForm } from './PositionForm';
import { TILE_ORDER, useAssetNames, type TileKind } from './tiles';

export function HomeNote({ onClose }: { onClose: () => void }) {
  return (
    <Card title="">
      <p>
        <Trans>
          Mieszkanie, w którym mieszkasz, jest Twoim majątkiem, ale nie inwestycją: zostaje poza symulacją
          inwestycyjną, więc go nie wpisujemy.
        </Trans>
      </p>
      <Button className="mt-3" onClick={onClose}>
        <Trans>Rozumiem</Trans>
      </Button>
    </Card>
  );
}

/** Wybór aktywa do dodania: kafelki, a po kliknięciu formularz (albo uwaga o mieszkaniu). */
export function AssetPicker({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const names = useAssetNames();
  const [open, setOpenState] = useState<TileKind | null>(null);
  const setOpen = (k: TileKind | null) => {
    setOpenState(k);
    onOpenChange?.(k !== null);
  };
  return (
    <div className="flex flex-col gap-4">
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
        {TILE_ORDER.map((k) => (
          <li key={k}>
            <Button variant={open === k ? 'primary' : 'secondary'} className="w-full" onClick={() => setOpen(k)}>
              {names.tile(k)}
            </Button>
          </li>
        ))}
      </ul>
      {open === 'home' && <HomeNote onClose={() => setOpen(null)} />}
      {open && open !== 'home' && (
        <PositionForm key={open} kind={open} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />
      )}
    </div>
  );
}

export function PortfolioEditor() {
  const names = useAssetNames();
  const { positions, baseCurrency } = useScenarioStore((s) => s.scenario);
  const { updatePosition, removePosition } = useScenarioStore.getState();
  const total = positions.reduce((a, p) => a + p.value, 0);
  return (
    <div className="flex flex-col gap-4">
      <Card title="">
        {positions.length === 0 ? (
          <p>
            <Trans>Portfel jest pusty. Dodaj pierwsze aktywo poniżej.</Trans>
          </p>
        ) : (
          <p>
            <Trans>Razem: {formatMoney(total, baseCurrency)}</Trans>
          </p>
        )}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {positions.map((p, i) => (
          <AssetTile
            key={`${p.assetId}-${i}`}
            name={names.asset(p.assetId)}
            position={p}
            onValue={(value) => updatePosition(i, { value })}
            onWrapper={(wrapper) => updatePosition(i, { wrapper })}
            onRemove={() => removePosition(i)}
          />
        ))}
      </div>
      <AssetPicker />
    </div>
  );
}
