import { Trans, useLingui } from '@lingui/react/macro';
import { fanChart } from '@sim/engine';
import type { ModelCheckRow, Scenario, Warning } from '@sim/engine';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../charts/DataTable';
import { FanChart } from '../../charts/FanChart';
import { Histogram } from '../../charts/Histogram';
import { Card } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Toggle';
import { formatMoney } from '../../lib/format';
import { useAssetNames } from '../portfolio/tiles';
import { useScenarioStore } from '../../state/scenarioStore';
import { useUiStore } from '../../state/uiStore';
import { defaultMaxPaths, runTask } from '../../workers/pool';
import { currencyWord, useBasis } from './basis';
import { BtcCard } from './BtcCard';
import { labelCheckId } from './labels';
import { KpiTiles } from './KpiTiles';
import { ModelCheckPanel } from './ModelCheckPanel';
import { yearsText } from './periods';
import { Solvers } from './Solvers';
import { RiskCard } from './RiskCard';
import { RuinAliveCard } from './RuinAliveCard';
import { QualityBadge } from './QualityBadge';
import { SIM_SEED, useSimulation, type SimOptions } from './useSimulation';
import { calendarYear, gridIndex, valuesAt, winsorize } from './values';
import { numberLocale } from '../../i18n';

const fmtCorr = (v: number): string => new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

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

/** Tekst ostrzeżenia silnika po `code` (Lingui); surowy `message` silnika nie trafia do interfejsu. */
function useWarningText(): (w: Warning) => string {
  const { t } = useLingui();
  const names = useAssetNames();
  return (w) => {
    switch (w.code) {
      case 'CORR_PROJECTED':
        return t`Założone korelacje nie tworzyły poprawnej macierzy, więc do symulacji użyliśmy najbliższej poprawnej macierzy korelacji (pokazanej poniżej).`;
      case 'ALPHA_CLAMPED': {
        const id = (w.data as { id?: unknown } | undefined)?.id;
        if (typeof id === 'string' && id.startsWith('fx:')) {
          const cur = id.slice(3);
          return t`Wrażliwość na kryzysy kursu ${cur} została przycięta, żeby kryzys nie tłumaczył ponad 80% jego zmienności.`;
        }
        const name = typeof id === 'string' ? names.asset(id) : '';
        return t`Wrażliwość na kryzysy aktywa „${name}” została przycięta, żeby kryzys nie tłumaczył ponad 80% jego zmienności.`;
      }
      case 'LOSS_OVER_5M':
        return t`Strata przekracza 5 mln zł; model upraszcza zasady odliczania strat w podatku od zysków kapitałowych.`;
      case 'EMPTY_PORTFOLIO':
        return t`Suma docelowych wag aktywów płynnych wynosi 0, więc rebalansowanie nie wykona żadnych transakcji.`;
      case 'NEGATIVE_TARGET_WEIGHT':
        return t`Ujemna docelowa waga jest traktowana jak 0 (bez krótkiej sprzedaży).`;
    }
  };
}

/** Banery ostrzeżeń z silnika; CORR_PROJECTED pokazuje macierz po korekcie (spec 4.4). */
export function WarningBanners({ warnings }: { warnings: Warning[] }) {
  const text = useWarningText();
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {warnings.map((w, i) => (
        <div key={`${w.code}-${i}`} role="alert" className="rounded-card border border-accent bg-accent-soft p-4 text-accent-soft-fg">
          <p className="m-0 font-medium">{text(w)}</p>
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
  const assetNames = useAssetNames();
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

  // kontrola modelu po zakończeniu liczenia (osobny, tańszy przebieg samego rynku) w workerze
  const finished = result !== undefined && !state.running;
  const { createWorker } = sim;
  useEffect(() => {
    if (!finished) return;
    let alive = true;
    const h = runTask((w) => w.modelCheck(scenario, { seed: SIM_SEED, paths: 2000 }), createWorker);
    h.done.then(
      (rows) => alive && setCheckRows(rows),
      () => alive && setCheckRows(null),
    );
    return () => {
      alive = false;
      h.cancel();
    };
  }, [finished, scenario, createWorker]);

  const known = scenario.assets.map((x) => x.id);
  const nameOf = (id: string): string => (id === 'cpi' ? t`Inflacja` : id.startsWith('fx:') ? t`Kurs ${id.slice(3)}` : assetNames.asset(id));
  const annual = t`(roczna)`;
  const checkLabel = (id: string): string => labelCheckId(id, known, nameOf, annual);
  const maxPaths = sim.maxPaths ?? (expert ? defaultMaxPaths() : 10_000);
  const basis = useBasis(cur, real, afterTax);
  const unit = currencyWord(cur);

  if (state.errors.length > 0) {
    return (
      <div role="alert" className="rounded-card border border-danger bg-danger-soft p-4 text-danger">
        <p className="m-0 font-semibold">{t`Nie możemy policzyć tego scenariusza`}</p>
        <p className="mb-0 mt-2 text-fg">{t`Dane planu są niepoprawne albo niekompletne. Popraw portfel i plan albo zacznij od nowa w Ustawieniach.`}</p>
        <details className="mt-2 text-sm text-fg">
          <summary className="min-h-11 cursor-pointer py-2">{t`Szczegóły techniczne`}</summary>
          <ul className="m-0">
            {state.errors.map((e) => (
              <li key={`${e.path}-${e.message}`}>
                <code>{e.path}</code>: {e.message}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }
  if (state.failed) {
    return (
      <div role="alert" className="rounded-card border border-danger bg-danger-soft p-4 text-danger">
        <p className="m-0 font-semibold">{t`Nie udało się policzyć wyniku`}</p>
        <p className="mb-0 mt-2 text-fg">{t`Obliczenia w tle zakończyły się błędem. Zmień cokolwiek w planie albo odśwież stronę, żeby spróbować ponownie.`}</p>
      </div>
    );
  }
  if (!result || !fan || !histValues) {
    const n = new Intl.NumberFormat(numberLocale()).format(maxPaths);
    return (
      <p role="status" className="rounded-card border border-border bg-surface p-6 text-center text-muted">
        <Trans>Liczymy {n} możliwych przyszłości…</Trans>
      </p>
    );
  }

  const calibrated = checkRows ? checkRows.every((r) => r.ok) : undefined;
  const year = calendarYear(scenario.startYear, scenario.startMonth, month);
  const label = t`Wachlarz możliwych wartości portfela (${basis.full})`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
          <Toggle label={t`Realnie (w dzisiejszych ${unit})`} checked={real} onCheckedChange={setReal} />
          <Toggle label={t`Po podatku`} checked={afterTax} onCheckedChange={setAfterTax} />
          <Toggle label={t`Tryb eksperta`} checked={expert} onCheckedChange={setExpert} />
        </div>
        {afterTax && scenario.tax.kind === 'pl' && scenario.positions.some((p) => scenario.assets.find((a) => a.id === p.assetId)?.kind === 'realEstate') && (
          <p className="m-0 mt-1 text-sm text-muted">
            {t`Wartość po podatku uwzględnia podatek od sprzedaży mieszkania (19% od zysku, o ile sprzedaż nie jest zwolniona po 5 latach od zakupu; bez podanego roku zakupu zwolnienia nie zakładamy).`}
          </p>
        )}
        <div className="mt-2">
          <QualityBadge result={result} scenario={scenario} running={state.running} calibrated={calibrated} />
        </div>
      </Card>
      <WarningBanners warnings={state.warnings} />
      <KpiTiles result={result} scenario={scenario} month={month} real={real} afterTax={afterTax} expert={expert} />
      <RuinAliveCard result={result} scenario={scenario} dataset={dataset} createWorker={createWorker} />
      <Card title={t`Wachlarz możliwych przyszłości (${basis.full})`}>
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
      <Card title={t`Rozkład wartości za ${yearsText(month)} (${basis.full})`}>
        <p className="mb-2 mt-0 text-sm text-muted">{t`Najwyższe 1% przyszłości połączono w ostatnim słupku.`}</p>
        <Histogram values={histValues} formatValue={money} label={t`Rozkład wartości portfela (${basis.full})`} />
      </Card>
      {/* Karta BTC liczy dwa dodatkowe przebiegi w workerach: pokazujemy ją po zakończeniu etapów,
          żeby nie konkurować z nimi o rdzenie (budżet < 1 s do pierwszego etapu). */}
      {!state.running && <BtcCard scenario={scenario} dataset={dataset} month={month} createWorker={createWorker} />}
      {!state.running && <RiskCard scenario={scenario} createWorker={createWorker} />}
      <Solvers scenario={scenario} createWorker={sim.createWorker} />
      {expert && checkRows && <ModelCheckPanel rows={checkRows} labelOf={checkLabel} />}
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
