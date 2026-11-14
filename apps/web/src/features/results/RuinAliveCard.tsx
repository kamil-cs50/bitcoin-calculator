import { useLingui } from '@lingui/react/macro';
import type { Dataset } from '@sim/data';
import type { RunResult, Scenario } from '@sim/engine';
import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { naturalFrequency } from '../../lib/format';
import { numberLocale } from '../../i18n';
import { runTask } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';
import { capitalize } from './periods';

export interface RuinAliveCardProps {
  result: RunResult;
  scenario: Scenario;
  dataset: Dataset;
  /** Fabryka workerów (testy podstawiają wersję synchroniczną). */
  createWorker?: () => SimWorker;
}

/**
 * „Szansa, że środki wyczerpią się, gdy jeszcze żyjesz” (spec 4.12): ruina w odległym roku liczy się tylko wtedy,
 * gdy dożyjesz tego roku. Widoczna przy wypłatach oraz podanych wieku i płci; liczy w workerze z tablic GUS
 * (opcjonalnie z założeniem „+2 lata”). Przedział uwzględnia tylko błąd losowania symulacji rynku.
 */
export function RuinAliveCard({ result, scenario, dataset, createWorker }: RuinAliveCardProps) {
  const { t } = useLingui();
  const person = scenario.person;
  const age = person?.age;
  const sex = person?.sex;
  const bonus = person?.cohortBonus === true;
  const eligible = scenario.withdrawal !== undefined && age !== undefined && sex !== undefined;
  const [out, setOut] = useState<{ p: number; ci: [number, number] } | null>(null);
  const horizon = scenario.horizonMonths;
  const lt = dataset.lifeTables;

  useEffect(() => {
    if (!eligible) return;
    let alive = true;
    const qx = (sex === 'M' ? lt.male : lt.female).qx;
    const extra = bonus ? lt.cohortExtraYears.value : 0;
    const h = runTask((w) => w.ruinAlive(result.ruinMonth, qx, age, horizon, extra), createWorker);
    h.done.then(
      (r) => alive && setOut(r),
      () => alive && setOut(null),
    );
    return () => {
      alive = false;
      h.cancel();
    };
  }, [eligible, result, age, sex, bonus, horizon, lt, createWorker]);

  if (!eligible || !out) return null;
  const pp = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 }).format(((out.ci[1] - out.ci[0]) / 2) * 100);
  const sexWord = sex === 'M' ? t`mężczyzna` : t`kobieta`;
  const extraYears = lt.cohortExtraYears.value;
  return (
    <Card title={t`Szansa, że środki wyczerpią się, gdy jeszcze żyjesz`}>
      <p data-testid="kpi-ruin-alive" className="m-0 text-3xl font-semibold tabular-nums">
        {capitalize(naturalFrequency(out.p))}
      </p>
      <p className="m-0 mt-1 text-sm text-muted">
        {t`Ruina w odległym roku liczy się tylko wtedy, gdy dożyjesz tego roku. Wiek ${age}, ${sexWord}, tablice trwania życia GUS (±${pp} pp).`}
      </p>
      <p className="mb-0 mt-1 text-sm text-muted">
        {bonus
          ? t`Z założeniem „+${extraYears} lata” (dłuższe życie kolejnych roczników; założenie niezweryfikowane).`
          : t`Tablice okresowe mogą zaniżać długość życia; opcję „+2 lata” włączysz w Planie.`}
        {' '}
        {t`Przedział uwzględnia tylko błąd losowania symulacji rynku, nie niepewność tablic.`}
      </p>
    </Card>
  );
}
