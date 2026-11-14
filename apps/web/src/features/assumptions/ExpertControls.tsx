import { useLingui } from '@lingui/react/macro';
import { Card } from '../../components/ui/Card';
import { Field, inputClass } from '../../components/ui/Field';
import { PowerLawCard } from './PowerLawCard';
import { useScenarioStore } from '../../state/scenarioStore';
import { useAssetNames } from '../portfolio/tiles';
import { ParamRow } from './ParamRow';
import { useParamRows } from './useParamRows';

/** Sekcje widoczne tylko w trybie eksperta: model, ν, reżimy, α i b, nakładka potęgowa. */
export function ExpertControls() {
  const { t } = useLingui();
  const scenario = useScenarioStore((s) => s.scenario);
  const setScenario = useScenarioStore((s) => s.setScenario);
  const { dataset, assetRows, marketRows, modelRows } = useParamRows();
  const names = useAssetNames();
  const m = scenario.market;
  const { nu, regime } = modelRows(m, dataset);
  const crisis = [
    ...scenario.assets.flatMap((a) => assetRows(a, dataset, true, names.asset(a.id))),
    ...marketRows(m, dataset, true),
  ];

  return (
    <>
      <Card title={t`Model rynku`}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <li>
            <Field
              label={t`Model rynku`}
              hint={t`Realistyczny: ogony grubsze niż w rozkładzie normalnym i okresy kryzysu. Podręcznikowy: zwroty o rozkładzie log-normalnym, bez kryzysów.`}
            >
              {(p) => (
                <select
                  {...p}
                  className={inputClass}
                  value={m.mode}
                  onChange={(e) => setScenario({ ...scenario, market: { ...m, mode: e.target.value === 'gbm' ? 'gbm' : 'realistic' } })}
                >
                  <option value="realistic">{t`Realistyczny`}</option>
                  <option value="gbm">{t`Podręcznikowy`}</option>
                </select>
              )}
            </Field>
          </li>
          <ParamRow spec={nu} />
          {regime.map((r) => (
            <ParamRow key={r.key} spec={r} />
          ))}
        </ul>
      </Card>

      {crisis.length > 0 && (
        <Card title={t`Wrażliwość na kryzysy`}>
          <p className="mt-0 text-sm text-muted">
            {t`α mówi, jak mocno aktywo odczuwa kryzys rynkowy, a b, jaka część jego zmienności rośnie w kryzysie.`}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {crisis.map((r) => (
              <ParamRow key={r.key} spec={r} />
            ))}
          </ul>
        </Card>
      )}

      <PowerLawCard />
    </>
  );
}
