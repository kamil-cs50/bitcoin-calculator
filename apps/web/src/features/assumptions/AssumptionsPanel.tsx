import { useLingui } from '@lingui/react/macro';
import type { Dataset } from '@sim/data';
import type { Scenario } from '@sim/engine';
import { RadioGroup } from 'radix-ui';
import { Card } from '../../components/ui/Card';
import { assetFromPreset, rebuildMarket } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';
import { useUiStore } from '../../state/uiStore';
import { useAssetNames } from '../portfolio/tiles';
import { ExpertControls } from './ExpertControls';
import { ParamRow } from './ParamRow';
import { useParamRows } from './useParamRows';

export const BTC_SETS = ['btcPessimistic', 'btcBase', 'btcOptimistic'] as const;
type BtcSet = (typeof BTC_SETS)[number];

/** Podmienia parametry aktywa BTC na wybrany zestaw (pozycje i czynniki rynku idą za nowym id). */
export function switchBtcSet(s: Scenario, d: Dataset, presetId: BtcSet): Scenario {
  const old = s.assets.find((a) => (BTC_SETS as readonly string[]).includes(a.id));
  if (!old || old.id === presetId) return s;
  const fresh = assetFromPreset(d, presetId);
  const next =
    fresh.kind === 'risky' && old.kind === 'risky' ? { ...fresh, costBps: old.costBps, taxForm: old.taxForm } : fresh;
  const assets = s.assets.map((a) => (a === old ? next : a));
  const positions = s.positions.map((p) => (p.assetId === old.id ? { ...p, assetId: presetId } : p));
  return { ...s, assets, positions, market: rebuildMarket(d, s.market, assets, s.baseCurrency) };
}

/** Panel „Założenia i źródła” (spec 6.6, PLAN 5.1 pkt 4). */
export function AssumptionsPanel() {
  const { t } = useLingui();
  const scenario = useScenarioStore((s) => s.scenario);
  const setScenario = useScenarioStore((s) => s.setScenario);
  const expert = useUiStore((s) => s.expert);
  const { dataset, assetRows, marketRows } = useParamRows();
  const names = useAssetNames();
  const btc = scenario.assets.find((a) => (BTC_SETS as readonly string[]).includes(a.id));
  const scale = scenario.market.uncertaintyScale;
  const scaleText = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(scale);
  const setLabel: Record<BtcSet, string> = {
    btcPessimistic: t`Pesymistyczny`,
    btcBase: t`Bazowy`,
    btcOptimistic: t`Optymistyczny`,
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mt-0">
          {t`Każda liczba, na której opiera się symulacja, ma tu swoje źródło i status. Wartości możesz zmienić; zawsze da się wrócić do domyślnej. Zbiór danych: wersja ${dataset.version}.`}
        </p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          <li>{t`✅ zweryfikowane: liczba odczytana ze źródła i sprawdzona.`}</li>
          <li>{t`◐ źródło wtórne: liczba pochodzi z omówienia, nie z oryginału.`}</li>
          <li>{t`❌ niezweryfikowane: założenie albo liczba czekająca na kalibrację.`}</li>
        </ul>
      </Card>

      <Card title={t`Jak pewny jesteś oczekiwanego zwrotu?`}>
        <div className="flex flex-col gap-2">
          <label htmlFor="uncertainty" className="text-sm font-medium">
            {t`Jak pewny jesteś oczekiwanego zwrotu?`}
          </label>
          <input
            id="uncertainty"
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={scale}
            aria-valuetext={t`${scaleText}× domyślnej niepewności`}
            aria-describedby="uncertainty-hint"
            className="min-h-11 w-full accent-[var(--color-accent)]"
            onChange={(e) => {
              const v = Math.min(2, Math.max(0, Number(e.target.value)));
              if (Number.isFinite(v)) setScenario({ ...scenario, market: { ...scenario.market, uncertaintyScale: v } });
            }}
          />
          <div className="flex justify-between text-sm text-muted" aria-hidden="true">
            <span>{t`0: pewny`}</span>
            <span>{t`1: domyślnie`}</span>
            <span>{t`2: niepewny`}</span>
          </div>
          <p id="uncertainty-hint" className="m-0 text-sm text-muted">
            {t`Teraz: ${scaleText}× domyślnej niepewności. Im wyżej, tym szerzej rozrzucone są możliwe przyszłe zwroty; 0 oznacza, że traktujesz zakładane zwroty jako pewne.`}
          </p>
        </div>
      </Card>

      {btc && (
        <Card title={t`Bitcoin: zestaw założeń`}>
          <RadioGroup.Root
            aria-label={t`Zestaw założeń dla Bitcoina`}
            value={btc.id}
            onValueChange={(v) => setScenario(switchBtcSet(useScenarioStore.getState().scenario, dataset, v as BtcSet))}
            className="flex flex-wrap gap-2"
          >
            {BTC_SETS.map((id) => (
              <label
                key={id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border-strong px-3 py-2 has-[[data-state=checked]]:bg-accent-soft"
              >
                <RadioGroup.Item
                  value={id}
                  aria-label={setLabel[id]}
                  className="size-5 shrink-0 rounded-full border border-border-strong data-[state=checked]:border-accent data-[state=checked]:bg-accent"
                />
                <span aria-hidden="true">{setLabel[id]}</span>
              </label>
            ))}
          </RadioGroup.Root>
          <p className="mb-0 mt-2 text-sm text-muted">
            {t`Zestaw podmienia zwrot, zmienność i ryzyko upadku Bitcoina. Własne zmiany tych parametrów są wtedy zastępowane wartościami zestawu.`}
          </p>
        </Card>
      )}

      {scenario.assets.length === 0 && (
        <Card>
          <p className="m-0 text-muted">{t`Dodaj pozycje w portfelu, a pojawią się tu założenia dla każdego aktywa.`}</p>
        </Card>
      )}
      {scenario.assets.map((a) => {
        const rows = assetRows(a, dataset, false);
        return (
          <Card key={a.id} title={names.asset(a.id)}>
            {rows.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {rows.map((r) => (
                  <ParamRow key={r.key} spec={r} />
                ))}
              </ul>
            ) : (
              <p className="m-0 text-muted">{t`Parametry tego aktywa wpisałeś sam, więc nie mają źródeł ani wartości domyślnych.`}</p>
            )}
          </Card>
        );
      })}

      <Card title={t`Inflacja i kursy walut`}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {marketRows(scenario.market, dataset, false).map((r) => (
            <ParamRow key={r.key} spec={r} />
          ))}
        </ul>
      </Card>

      {expert && <ExpertControls />}
    </div>
  );
}
