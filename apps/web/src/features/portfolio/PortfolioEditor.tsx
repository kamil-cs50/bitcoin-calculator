import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { Flap, splitAmount } from '../../components/ui/Flap';
import { Button } from '../../components/ui/Button';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Card } from '../../components/ui/Card';
import { formatMoney, formatMoneyShort } from '../../lib/format';
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
  const { t } = useLingui();
  const names = useAssetNames();
  const [open, setOpenState] = useState<TileKind | null>(null);
  const setOpen = (k: TileKind | null) => {
    setOpenState(k);
    onOpenChange?.(k !== null);
  };
  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-5">
      <section aria-label={t`Dodaj aktywo`} className="flex flex-wrap items-center gap-2.5">
        <span aria-hidden="true" className="eyebrow mr-2.5">
          {t`Dodaj aktywo`}
        </span>
        <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
          {TILE_ORDER.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => setOpen(k)}
                className={`inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm text-fg transition-colors before:inline-block before:size-[9px] before:shrink-0 before:bg-[linear-gradient(currentColor,currentColor),linear-gradient(currentColor,currentColor)] before:bg-[length:100%_1.5px,1.5px_100%] before:bg-center before:bg-no-repeat before:opacity-80 before:content-[''] ${
                  open === k ? 'border-[rgba(157,185,255,0.45)] bg-[rgba(42,85,255,0.18)]' : 'border-border bg-field hover:bg-soft'
                }`}
              >
                {names.tile(k)}
              </button>
            </li>
          ))}
        </ul>
      </section>
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
  const { t } = useLingui();
  const inRouter = useInRouterContext();
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
  // widoczny zegar w krótkim zapisie projektu („250 tys. zł”); pełna kwota zostaje w tekście dla czytników
  const totalText = formatMoneyShort(total, baseCurrency);
  const btcValue = positions.filter((p) => /^btc/.test(p.assetId)).reduce((a, p) => a + p.value, 0);
  const pctOf = (v: number): string => `${total > 0 ? Math.round((v / total) * 100) : 0}%`;
  const parts = splitAmount(totalText);
  // paski udziałów: szerokość segmentu = wartość pozycji (flex); procenty tylko w legendzie
  const tints = ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.14)'];
  const alloc = positions.map((p, i) => {
    const btc = /^btc/.test(p.assetId);
    return { name: names.asset(p.assetId), flex: Math.max(p.value, 1), pct: pctOf(p.value), color: btc ? '#7fa8ff' : tints[i % 4]!, glow: btc ? '#2a55ff' : 'transparent' };
  });
  return (
    <div className="flex flex-col gap-[clamp(32px,5vw,56px)]">
      <section aria-label={t`Portfel · razem`} className="flex flex-col gap-6">
        <dl className="eyebrow m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-3.5 border-b border-hairline pb-[18px]">
          <div className="flex flex-col gap-[3px]">
            <dt className="text-label after:content-[':']">{t`Pozycje`}</dt>
            <dd className="m-0 text-fg">{positions.length}</dd>
          </div>
          <div className="flex flex-col gap-[3px]">
            <dt className="text-label after:content-[':']">{t`Waluta`}</dt>
            <dd className="m-0 text-fg">{baseCurrency}</dd>
          </div>
          <div className="flex flex-col gap-[3px]">
            <dt className="text-label after:content-[':']">{t`Udział BTC`}</dt>
            <dd className="m-0 text-fg">{pctOf(btcValue)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3.5">
            <span aria-hidden="true" className="eyebrow">
              {t`Portfel · razem`}
            </span>
            {positions.length === 0 ? (
              <p className="m-0 text-base font-light text-muted">
                <Trans>Portfel jest pusty. Dodaj pierwsze aktywo poniżej.</Trans>
              </p>
            ) : (
              <>
                {/* pełna kwota dla czytników ekranu i testów; zegar obok jest tylko oprawą */}
                <p className="sr-only">
                  <Trans>Razem: {formatMoney(total, baseCurrency)}</Trans>
                </p>
                <div aria-hidden="true" className="flex flex-wrap items-end gap-[clamp(12px,1.6vw,22px)]">
                  {parts ? (
                    <>
                      <span className="flex text-[clamp(68px,10.5vw,156px)] leading-none font-light tracking-normal">
                        <Flap text={parts[0]} />
                      </span>
                      <span className="text-[clamp(34px,4.4vw,64px)] leading-none font-light tracking-[-0.02em] text-accent-text">{parts[1]}</span>
                    </>
                  ) : (
                    <span className="text-[clamp(68px,10.5vw,156px)] leading-none font-light">{totalText}</span>
                  )}
                </div>
              </>
            )}
          </div>
          {/* poza routerem (testy samego edytora) zwykły odnośnik; w aplikacji nawigacja po stronie klienta */}
          {(() => {
            const cls = 'btn-primary inline-flex min-h-12 items-center gap-3 rounded-full px-[22px] text-[15px] no-underline';
            const body = (
              <>
                {t`Zobacz wynik`}
                <span aria-hidden="true">→</span>
              </>
            );
            return inRouter ? (
              <Link to="/wynik" className={cls}>
                {body}
              </Link>
            ) : (
              <a href="/wynik" className={cls}>
                {body}
              </a>
            );
          })()}
        </div>
        {alloc.length > 0 && (
          <div aria-hidden="true" className="flex flex-col gap-3">
            <div className="flex h-1.5 gap-1">
              {alloc.map((a, i) => (
                <span
                  key={i}
                  className="rounded-full transition-[flex] duration-[600ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{ flex: a.flex, background: a.color, boxShadow: `0 0 14px ${a.glow}` }}
                />
              ))}
            </div>
            <div className="eyebrow flex flex-wrap gap-x-6 gap-y-1.5 !tracking-[0.05em] !text-fg">
              {alloc.map((a, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full" style={{ background: a.color }} />
                  {a.name} <span className="text-label">{a.pct}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3.5">
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
