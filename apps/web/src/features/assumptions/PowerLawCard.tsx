import type { AssetParams, Scenario } from '@sim/engine';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { DecimalInput } from '../../components/ui/numberInput';
import { Toggle } from '../../components/ui/Toggle';
import { presetIdOf } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';

type Risky = Extract<AssetParams, { kind: 'risky' }>;
const isBtc = (a: AssetParams): a is Risky => a.kind === 'risky' && presetIdOf(a.id).startsWith('btc');

/**
 * Nakładka potęgowa BTC (spec 4.8): model kontrowersyjny, domyślnie wyłączony. Parametry a i b wpisuje
 * użytkownik (brak wartości domyślnych, bo są niezweryfikowane); do scenariusza trafiają dopiero po wpisaniu obu.
 */
export function PowerLawCard() {
  const { t } = useLingui();
  const scenario = useScenarioStore((s) => s.scenario);
  const setScenario = useScenarioStore((s) => s.setScenario);
  const btc = scenario.assets.filter(isBtc);
  const stored = btc.find((a) => a.powerLaw)?.powerLaw;
  const [enabledDraft, setEnabledDraft] = useState(false);
  const [a, setA] = useState<number | null>(stored?.a ?? null);
  const [b, setB] = useState<number | null>(stored?.b ?? null);
  const enabled = enabledDraft || stored !== undefined;
  // Zmiana nakładki spoza karty (import, zmiana aktywów) nadpisuje szkic, więc karta nie pokazuje nakładki,
  // której silnik nie używa; własny zapis z karty ustawia `seen` razem ze scenariuszem i niczego nie nadpisuje.
  const keyOf = (p: { a: number; b: number } | undefined): string => (p ? `${p.a}|${p.b}` : '');
  const [seen, setSeen] = useState(keyOf(stored));
  if (keyOf(stored) !== seen) {
    setSeen(keyOf(stored));
    setA(stored?.a ?? null);
    setB(stored?.b ?? null);
    setEnabledDraft(stored !== undefined);
  }

  const apply = (next: { a: number; b: number } | null): void => {
    setSeen(keyOf(next ?? undefined));
    const assets = scenario.assets.map((x): AssetParams => {
      if (!isBtc(x)) return x;
      const rest: Risky = { ...x };
      delete rest.powerLaw;
      return next ? { ...rest, powerLaw: { a: next.a, b: next.b, genesis: '2009-01-03' } } : rest;
    });
    setScenario({ ...scenario, assets } satisfies Scenario);
  };
  const toggle = (on: boolean): void => {
    setEnabledDraft(on);
    if (!on) {
      setA(null);
      setB(null);
      apply(null);
    } else if (a !== null && b !== null) apply({ a, b });
  };
  const edit = (na: number | null, nb: number | null): void => {
    setA(na);
    setB(nb);
    if (na !== null && nb !== null) apply({ a: na, b: nb });
    else if (stored) apply(null);
  };

  return (
    <Card title={t`Nakładka potęgowa`} aside={<Badge tone="warning">{t`model kontrowersyjny`}</Badge>}>
      <p className="mt-0 text-sm text-muted">
        {t`Zastępuje oczekiwany zwrot Bitcoina pochodną trendu ln P = a + b·ln(dni od 2009-01-03). Zastrzeżenie: regresja ceny na czasie jest podatna na regresję pozorną i nie ma podstaw ekonomicznych. Parametry a i b są niezweryfikowane. Zmienność i upadek pozostają bez zmian.`}
      </p>
      <p className="mt-0 text-sm text-muted">
        {t`Parametr a nie wpływa na dryf (liczy się tylko nachylenie b), ale wymagamy obu, bo razem opisują wpisany trend. Włączona nakładka przesłania zwrot z zestawu założeń Bitcoina, także „Docelowy zwrot roczny”.`}
      </p>
      <Toggle label={t`Nakładka potęgowa`} checked={enabled} onCheckedChange={toggle} disabled={btc.length === 0} />
      {btc.length === 0 && <p className="mb-0 mt-1 text-sm text-muted">{t`Dodaj Bitcoina do portfela, aby użyć nakładki.`}</p>}
      {enabled && btc.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          <DecimalInput label={t`Parametr a`} value={a} onChange={(v) => edit(v, b)} allowNegative required />
          <DecimalInput label={t`Parametr b`} value={b} onChange={(v) => edit(a, v)} allowNegative required />
          {(a === null || b === null) && (
            <p className="m-0 text-sm text-muted">{t`Wpisz oba parametry. Do czasu ich wpisania nakładka nie działa.`}</p>
          )}
        </div>
      )}
    </Card>
  );
}
