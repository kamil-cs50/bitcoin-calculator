import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Card } from '../../components/ui/Card';
import { formatMoney } from '../../lib/format';
import type { Wrapper } from '@sim/engine';
import { knownAge, useScenarioStore } from '../../state/scenarioStore';
import { AssetTile } from './AssetTile';
import { RealEstateFields, realEstateErrors, type RealEstateDraft } from './RealEstateFields';
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

const validAge = (v: number | null): v is number => v !== null && Number.isInteger(v) && v >= 0 && v <= 120;

/** Wiek użytkownika: od niego zależy, czy wypłata z IKE (60 lat) i IKZE (65 lat) jest bez podatku. Wymagany przy IKE/IKZE. */
function AgeField() {
  const { t } = useLingui();
  const stored = useScenarioStore((s) => knownAge(s.scenario) ?? null);
  // Wersja robocza: puste pole nie cofa się do wartości ze store w trakcie pisania.
  const [age, setAge] = useState<number | null>(stored);
  return (
    <MoneyInput
      label={t`Twój wiek`}
      suffix={t`lat`}
      value={age}
      required
      hint={t`Wypłaty z IKE są bez podatku od 60 lat, z IKZE (10%) od 65 lat; wymóg 5 lat wpłat pominięty. Przepisy cytowane z pamięci, niezweryfikowane w ISAP (❌).`}
      error={age === null ? t`Wiek jest wymagany przy IKE i IKZE.` : !validAge(age) ? t`Wiek: pełne lata od 0 do 120.` : null}
      onChange={(v) => {
        setAge(v);
        if (validAge(v)) useScenarioStore.getState().setAge(v);
      }}
    />
  );
}

/** Prośba o wiek przy wyborze IKE/IKZE: wieku nie zakładamy po cichu, bo od niego zależy podatek od wypłat. */
function AgePrompt({ wrapper, onConfirm, onCancel }: { wrapper: Wrapper; onConfirm: (age: number) => void; onCancel: () => void }) {
  const { t } = useLingui();
  const [age, setAge] = useState<number | null>(null);
  const ok = validAge(age);
  return (
    <Card title="">
      <div role="group" aria-label={t`Wiek do wyboru konta ${wrapper}`} className="flex flex-col gap-3">
        <p className="m-0">
          <Trans>
            Reguły IKE i IKZE zależą od Twojego wieku (wypłata z IKE bez podatku od 60 lat, z IKZE od 65 lat), a nie zakładamy go za Ciebie. Podaj wiek, żeby wybrać konto {wrapper}.
          </Trans>
        </p>
        <MoneyInput
          label={t`Twój wiek`}
          suffix={t`lat`}
          required
          value={age}
          onChange={setAge}
          error={age !== null && !ok ? t`Wiek: pełne lata od 0 do 120.` : null}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ok} onClick={() => ok && onConfirm(age)}>
            {t`Wybierz ${wrapper}`}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            <Trans>Anuluj</Trans>
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Pola mieszkania w kafelku pozycji: poprawne wartości trafiają od razu do scenariusza, niepoprawne zostają szkicem z błędem. */
function RealEstateTileFields({ index, assetId }: { index: number; assetId: string }) {
  const startYear = useScenarioStore((s) => s.scenario.startYear);
  const asset = useScenarioStore((s) => s.scenario.assets.find((x) => x.id === assetId));
  const position = useScenarioStore((s) => s.scenario.positions[index]);
  const [draft, setDraft] = useState<RealEstateDraft>({
    purchaseYear: asset?.kind === 'realEstate' ? (asset.purchaseYear ?? null) : null,
    saleYear: asset?.kind === 'realEstate' ? (asset.saleYear ?? null) : null,
    costBasis: position?.costBasis ?? null,
  });
  if (asset?.kind !== 'realEstate' || !position) return null;
  const onChange = (patch: Partial<RealEstateDraft>): void => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const err = realEstateErrors(next, startYear);
    const st = useScenarioStore.getState();
    const years: { purchaseYear?: number | null; saleYear?: number | null } = {};
    if ('purchaseYear' in patch && !err.purchaseYear) years.purchaseYear = next.purchaseYear;
    if ('saleYear' in patch && !err.saleYear) years.saleYear = next.saleYear;
    if (Object.keys(years).length > 0) st.setRealEstateYears(assetId, years);
    if ('costBasis' in patch && !err.costBasis && next.costBasis !== null) st.updatePosition(index, { costBasis: next.costBasis });
  };
  return <RealEstateFields draft={draft} startYear={startYear} onChange={onChange} />;
}

export function PortfolioEditor() {
  const names = useAssetNames();
  const { positions, baseCurrency } = useScenarioStore((s) => s.scenario);
  const hasWrapper = positions.some((p) => p.wrapper !== 'taxable');
  const assets = useScenarioStore((s) => s.scenario.assets);
  const { updatePosition, removePosition } = useScenarioStore.getState();
  // Wybór IKE/IKZE bez znanego wieku czeka na wiek (wieku nie zakładamy po cichu).
  const [pending, setPending] = useState<{ index: number; wrapper: Wrapper } | null>(null);
  const chooseWrapper = (index: number, wrapper: Wrapper): void => {
    if (wrapper === 'taxable' || knownAge(useScenarioStore.getState().scenario) !== undefined) {
      setPending(null);
      updatePosition(index, { wrapper });
    } else setPending({ index, wrapper });
  };
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
            onWrapper={(wrapper) => chooseWrapper(i, wrapper)}
            onRemove={() => {
              setPending(null);
              removePosition(i);
            }}
          >
            {assets.find((a) => a.id === p.assetId)?.kind === 'realEstate' && <RealEstateTileFields index={i} assetId={p.assetId} />}
          </AssetTile>
        ))}
      </div>
      {pending && (
        <AgePrompt
          wrapper={pending.wrapper}
          onCancel={() => setPending(null)}
          onConfirm={(age) => {
            const st = useScenarioStore.getState();
            st.setAge(age);
            st.updatePosition(pending.index, { wrapper: pending.wrapper });
            setPending(null);
          }}
        />
      )}
      {hasWrapper && <AgeField />}
      <AssetPicker />
    </div>
  );
}
