import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Toggle } from '../../components/ui/Toggle';
import { knownAge, useScenarioStore } from '../../state/scenarioStore';

const validAge = (v: number | null): v is number => v !== null && Number.isInteger(v) && v >= 0 && v <= 120;

/**
 * Wiek i płeć (opcjonalnie): z nimi Wyniki liczą szansę, że środki wyczerpią się, gdy jeszcze żyjesz (tablice GUS,
 * spec 4.12). Puste pola = bez krzywej przeżycia. Wiek jest też wymagany dla IKE/IKZE i wtedy nie można go wyczyścić.
 */
export function PersonCard() {
  const { t } = useLingui();
  const stored = useScenarioStore((s) => knownAge(s.scenario) ?? null);
  const sex = useScenarioStore((s) => s.scenario.person?.sex ?? '');
  const bonus = useScenarioStore((s) => s.scenario.person?.cohortBonus === true);
  const hasPerson = useScenarioStore((s) => s.scenario.person !== undefined);
  const needsAge = useScenarioStore((s) => s.scenario.positions.some((p) => p.wrapper !== 'taxable'));
  const [age, setAge] = useState<number | null>(stored);
  const { setAge: commitAge, setSex, setCohortBonus } = useScenarioStore.getState();

  const ageError =
    age !== null && !validAge(age) ? t`Wiek: pełne lata od 0 do 120.` : age === null && needsAge ? t`Wiek jest wymagany przy IKE i IKZE.` : null;

  return (
    <Card title={t`Wiek i płeć (opcjonalnie)`}>
      <div className="flex flex-col gap-3">
        <MoneyInput
          label={needsAge ? t`Twój wiek (wymagany przy IKE i IKZE)` : t`Twój wiek (opcjonalnie)`}
          suffix={t`lat`}
          value={age}
          onChange={(v) => {
            setAge(v);
            // niepoprawny wpis nie zostawia po cichu poprzedniego wieku (poza IKE/IKZE, gdzie wiek jest wymagany)
            commitAge(validAge(v) ? v : null);
          }}
          hint={t`Z wiekiem i płcią pokażemy w Wynikach szansę, że środki wyczerpią się, gdy jeszcze żyjesz (tablice trwania życia GUS). Puste: bez krzywej przeżycia, liczymy tylko szansę wyczerpania w całym okresie.`}
          error={ageError}
        />
        <Field label={t`Płeć (opcjonalnie)`} hint={t`Tablice GUS różnią się dla kobiet i mężczyzn. Dostępne po podaniu wieku.`}>
          {(p) => (
            <select
              {...p}
              className={inputClass}
              disabled={!hasPerson}
              value={sex}
              onChange={(e) => setSex(e.target.value === 'M' || e.target.value === 'K' ? e.target.value : null)}
            >
              <option value="">{t`Nie podano`}</option>
              <option value="K">{t`Kobieta`}</option>
              <option value="M">{t`Mężczyzna`}</option>
            </select>
          )}
        </Field>
        <Toggle label={t`Dłuższe życie kolejnych roczników (+2 lata, założenie)`} checked={bonus} onCheckedChange={setCohortBonus} disabled={!hasPerson || sex === ''} />
        <p className="m-0 text-sm text-muted">
          <Trans>
            Tablice okresowe zaniżają długość życia kolejnych roczników; opcja „+2 lata” przesuwa ryzyko zgonu o 2 lata wieku. To założenie, niezweryfikowane (❌).
          </Trans>
        </p>
      </div>
    </Card>
  );
}
