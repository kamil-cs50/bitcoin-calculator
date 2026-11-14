import { Trans, useLingui } from '@lingui/react/macro';
import type { RunResult } from '@sim/engine';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../charts/DataTable';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Gate } from '../../entitlements/Gate';
import { formatMoney } from '../../lib/format';
import { MAX_COMPARE, useScenarioStore, type CompareEntry } from '../../state/scenarioStore';
import { runProgressive } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';
import { SIM_SEED } from '../results/useSimulation';
import { gridIndex, valuesAt } from '../results/values';
import { pairedDifference } from './diff';

export interface CompareProps {
  /** Fabryka workerów (testy podstawiają wersję synchroniczną). */
  createWorker?: () => SimWorker;
  maxPaths?: number;
  workers?: number;
}

const VIEW = { real: true, afterTax: true } as const;

/** Wszystkie scenariusze liczone z tym samym ziarnem (wspólne liczby losowe, spec 4.2). */
function useRuns(list: CompareEntry[], o: CompareProps): Record<string, RunResult | undefined> {
  const [runs, setRuns] = useState<Record<string, RunResult | undefined>>({});
  const { createWorker, maxPaths = 10_000, workers } = o;
  useEffect(() => {
    const handles = list.map((e) => {
      const h = runProgressive(e.scenario, SIM_SEED, { maxPaths, workers, createWorker, onStage: () => undefined });
      h.done.then(
        (r) => setRuns((cur) => (cur[e.id] === r ? cur : { ...cur, [e.id]: r })),
        () => undefined,
      );
      return h;
    });
    return () => handles.forEach((h) => h.cancel());
    // wynik zależy od scenariusza, nie od nazwy: klucz po id i referencji scenariusza
  }, [list, maxPaths, workers, createWorker]);
  return runs;
}

function CompareBody(p: CompareProps) {
  const { t } = useLingui();
  const list = useScenarioStore((s) => s.compareList);
  const addToCompare = useScenarioStore((s) => s.addToCompare);
  const remove = useScenarioStore((s) => s.removeFromCompare);
  const runs = useRuns(list, p);
  const full = list.length >= MAX_COMPARE;
  const ready = list.length > 0 && list.every((e) => runs[e.id]);

  const rows = useMemo(() => {
    if (!ready || list.length < 2) return null;
    const base = list[0]!;
    const a = runs[base.id]!;
    const money = (v: number) => formatMoney(v, base.scenario.baseCurrency, { sigDigits: 2 });
    const signed = (v: number) => (v === 0 ? money(0) : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`);
    const horizon = Math.min(...list.map((e) => e.scenario.horizonMonths));
    const abs = list.map((e) => {
      const r = runs[e.id]!;
      const v = Float64Array.from(valuesAt(r, gridIndex(r.grid, horizon), VIEW)).sort();
      const q = (x: number) => v[Math.floor((v.length - 1) * x)]!;
      return { name: e.name, median: money(q(0.5)), p10: money(q(0.1)) };
    });
    const diffs = list.slice(1).map((e) => {
      const d = pairedDifference(a, runs[e.id]!, { ...VIEW, month: horizon });
      const cell = (x: { diff: number; ci: [number, number] }) =>
        `${signed(x.diff)} (${signed(x.ci[0])} … ${signed(x.ci[1])})`;
      return { name: e.name, median: cell(d.median), p10: cell(d.p10) };
    });
    return { base: base.name, abs, diffs, horizon };
  }, [ready, list, runs]);

  const years = rows ? Math.floor(rows.horizon / 12) : 0;
  return (
    <div className="flex flex-col gap-4">
      <Card title={t`Scenariusze do porównania`}>
        <p className="mb-3 mt-0 text-sm text-muted">
          <Trans>
            Zapisz bieżący plan jako migawkę, zmień coś (np. udział bitcoina) i zapisz kolejną. Wszystkie scenariusze
            liczą się na tych samych losowych przyszłościach, więc różnice nie zależą od szczęścia w losowaniu.
          </Trans>
        </p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3">
              <span>{e.name}</span>
              <Button variant="secondary" onClick={() => remove(e.id)} aria-label={t`Usuń scenariusz ${e.name}`}>
                <Trans>Usuń</Trans>
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled={full} onClick={() => addToCompare(t`Scenariusz ${list.length + 1}`)}>
            <Trans>Dodaj bieżący scenariusz</Trans>
          </Button>
          {full && (
            <p role="status" className="m-0 text-sm font-medium">
              <Trans>Można porównać najwyżej {MAX_COMPARE} scenariusze. Usuń jeden, aby dodać kolejny.</Trans>
            </p>
          )}
        </div>
      </Card>

      {list.length === 1 && (
        <p className="m-0 text-muted">
          <Trans>Dodaj drugi scenariusz, aby zobaczyć różnice.</Trans>
        </p>
      )}
      {list.length >= 2 && !ready && (
        <p role="status" className="m-0 text-muted">
          <Trans>Liczymy porównanie…</Trans>
        </p>
      )}
      {rows && (
        <Card title={t`Wynik po ${years} latach (w dzisiejszych zł, po podatku)`}>
          <div className="flex flex-col gap-4">
            <DataTable
              caption={t`Wyniki scenariuszy`}
              cornerLabel={t`Scenariusz`}
              columns={[t`Typowy wynik`, t`Słabszy scenariusz (10%)`]}
              rows={rows.abs.map((r) => ({ label: r.name, cells: [r.median, r.p10] }))}
            />
            <DataTable
              caption={t`Różnice względem „${rows.base}”`}
              cornerLabel={t`Scenariusz`}
              columns={[t`Różnica typowego wyniku`, t`Różnica słabszego scenariusza (10%)`]}
              rows={rows.diffs.map((r) => ({ label: r.name, cells: [r.median, r.p10] }))}
            />
            <p className="m-0 text-sm text-muted">
              <Trans>
                W nawiasie przedział ufności 95% różnicy, liczony na parach tych samych przyszłości (zmiana „na
                wspólnych liczbach losowych”), więc jest wąski nawet przy dużej niepewności samych wyników.
              </Trans>
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Porównanie do 3 scenariuszy na wspólnych liczbach losowych (spec 4.2, 4.13). */
export function Compare(p: CompareProps) {
  return (
    <Gate feature="compare">
      <CompareBody {...p} />
    </Gate>
  );
}
