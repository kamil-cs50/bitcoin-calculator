import { Trans, useLingui } from '@lingui/react/macro';
import { fanChart, modelCheck } from '@sim/engine';
import type { ModelCheckRow, Scenario, Warning } from '@sim/engine';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../charts/DataTable';
import { FanChart } from '../../charts/FanChart';
import { Histogram } from '../../charts/Histogram';
import { Card } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Toggle';
import { formatMoney } from '../../lib/format';
import { useScenarioStore } from '../../state/scenarioStore';
import { useUiStore } from '../../state/uiStore';
import { defaultMaxPaths } from '../../workers/pool';
import { BtcCard } from './BtcCard';
import { KpiTiles } from './KpiTiles';
import { ModelCheckPanel } from './ModelCheckPanel';
import { yearsText } from './periods';
import { QualityBadge } from './QualityBadge';
import { SIM_SEED, useSimulation, type SimOptions } from './useSimulation';
import { calendarYear, gridIndex, valuesAt, winsorize } from './values';

const fmtCorr = (v: number): string => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function CorrMatrix({ data }: { data: unknown }) {
  const { t } = useLingui();
  const d = data as { factorIds?: unknown; matrix?: unknown } | undefined;
  if (!d || !Array.isArray(d.factorIds) || !Array.isArray(d.matrix)) return null;
  const ids = d.factorIds as string[];
  const m = d.matrix as number[];
  if (m.length !== ids.length * ids.length) return null;
  return (
    <DataTable
      caption={t`Macierz korelacji po korekcie`}
      columns={ids}
      rows={ids.map((id, i) => ({ label: id, cells: ids.map((_, j) => fmtCorr(m[i * ids.length + j]!)) }))}
    />
  );
}

/** Banery ostrzeżeń z silnika; CORR_PROJECTED pokazuje macierz po korekcie (spec 4.4). */
export function WarningBanners({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {warnings.map((w, i) => (
        <div key={`${w.code}-${i}`} role="alert" className="rounded-card border border-accent bg-accent-soft p-4 text-accent-soft-fg">
          <p className="m-0 font-medium">{w.message}</p>
          {w.code === 'CORR_PROJECTED' && (
            <div className="mt-3 text-fg">
              <CorrMatrix data={w.data} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Body({ scenario, sim }: { scenario: Scenario; sim: SimOptions }) {
  const { t } = useLingui();
  const dataset = useScenarioStore((s) => s.dataset);
  const expert = useUiStore((s) => s.expert);
  const setExpert = useUiStore((s) => s.setExpert);
  const [real, setReal] = useState(true);
  const [afterTax, setAfterTax] = useState(true);
  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [checkRows, setCheckRows] = useState<ModelCheckRow[] | null>(null);

  const state = useSimulation(scenario, { maxPaths: expert ? defaultMaxPaths() : 10_000, ...sim });
  const { result } = state;
  const cur = scenario.baseCurrency;
  const money = (v: number) => formatMoney(v, cur, { sigDigits: 2 });

  const fan = useMemo(() => (result ? fanChart(result, { real, afterTax }) : null), [result, real, afterTax]);
  const G = result?.grid.length ?? 0;
  const month = result ? (pickedMonth === null ? result.grid[G - 1]! : result.grid[gridIndex(result.grid, pickedMonth)]!) : 0;
  const j = result ? gridIndex(result.grid, month) : 0;
  const histValues = useMemo(() => (result ? winsorize(valuesAt(result, j, { real, afterTax }), 0.99) : null), [result, j, real, afterTax]);

  // kontrola modelu po zakończeniu liczenia (osobny, tańszy przebieg samego rynku)
  const finished = result !== undefined && !state.running;
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(() => {
      try {
        setCheckRows(modelCheck(scenario, { seed: SIM_SEED, paths: 2000 }));
      } catch {
        setCheckRows(null);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [finished, scenario]);

  const names = useMemo(() => {
    const nameOf = (id: string): string => dataset.crypto[id]?.name ?? dataset.assets[id]?.name ?? id;
    return (id: string): string => id.split('~').map((x) => nameOf(x.replace(/ \(roczna\)$/, '')) + (x.endsWith(' (roczna)') ? ' (roczna)' : '')).join(' ~ ');
  }, [dataset]);

  if (state.errors.length > 0) {
    return (
      <div role="alert" className="rounded-card border border-danger bg-danger-soft p-4 text-danger">
        <p className="m-0 font-semibold">{t`Nie możemy policzyć tego scenariusza`}</p>
        <ul className="mb-0 mt-2">
          {state.errors.map((e) => (
            <li key={e.path}>{e.message}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (!result || !fan || !histValues) {
    return (
      <p role="status" className="rounded-card border border-border bg-surface p-6 text-center text-muted">
        <Trans>Liczymy 10 000 możliwych przyszłości…</Trans>
      </p>
    );
  }

  const calibrated = checkRows ? checkRows.every((r) => r.ok) : undefined;
  const year = calendarYear(scenario.startYear, scenario.startMonth, month);
  const label = t`Wachlarz możliwych wartości portfela`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
          <Toggle label={t`Realnie (w dzisiejszych zł)`} checked={real} onCheckedChange={setReal} />
          <Toggle label={t`Po podatku`} checked={afterTax} onCheckedChange={setAfterTax} />
          <Toggle label={t`Tryb eksperta`} checked={expert} onCheckedChange={setExpert} />
        </div>
        <div className="mt-2">
          <QualityBadge result={result} scenario={scenario} running={state.running} calibrated={calibrated} />
        </div>
      </Card>
      <WarningBanners warnings={state.warnings} />
      <KpiTiles result={result} scenario={scenario} month={month} real={real} afterTax={afterTax} expert={expert} />
      <Card title={t`Wachlarz możliwych przyszłości`}>
        <label className="mb-3 flex flex-col gap-1 text-sm font-medium">
          <span>{t`Rok na wykresie: za ${yearsText(month)} (${year})`}</span>
          <input
            type="range"
            aria-label={t`Rok na wykresie`}
            aria-valuetext={t`za ${yearsText(month)} (${year})`}
            min={0}
            max={G - 1}
            step={1}
            value={j}
            onChange={(e) => setPickedMonth(result.grid[Number(e.target.value)]!)}
            className="h-11 w-full accent-accent"
          />
        </label>
        <FanChart fan={fan} month={month} onMonthChange={setPickedMonth} formatValue={money} label={label} />
      </Card>
      <Card title={t`Rozkład wartości za ${yearsText(month)}`}>
        <p className="mb-2 mt-0 text-sm text-muted">{t`Najwyższe 1% przyszłości połączono w ostatnim słupku.`}</p>
        <Histogram values={histValues} formatValue={money} label={t`Rozkład wartości portfela`} />
      </Card>
      <BtcCard scenario={scenario} dataset={dataset} month={month} />
      {expert && checkRows && <ModelCheckPanel rows={checkRows} labelOf={names} />}
    </div>
  );
}

/** Dashboard wyników (trasa /wynik): symulacja progresywna, kafelki KPI, wachlarz z suwakiem, rozkład, BTC. */
export function Dashboard({ sim = {} }: { sim?: SimOptions }) {
  const scenario = useScenarioStore((s) => s.scenario);
  if (scenario.positions.length === 0) {
    return (
      <Card>
        <p className="m-0">
          <Trans>Dodaj do portfela przynajmniej jedną pozycję, a pokażemy, jak mogą potoczyć się jego losy.</Trans>
        </p>
      </Card>
    );
  }
  return <Body scenario={scenario} sim={sim} />;
}
