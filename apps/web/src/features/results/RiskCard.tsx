import { useLingui } from '@lingui/react/macro';
import type { AssetRiskShare, Scenario } from '@sim/engine';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../charts/DataTable';
import { Card } from '../../components/ui/Card';
import { runTask } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';
import { useAssetNames } from '../portfolio/tiles';
import { SIM_SEED } from './useSimulation';

export interface RiskCardProps {
  scenario: Scenario;
  /** Fabryka workerów (testy podstawiają wersję synchroniczną). */
  createWorker?: () => SimWorker;
}

const PATHS = 2000;
const pct = (v: number): number => Math.round(v * 100);

/** Aktywa ryzykowne, które mają w portfelu dodatnią wartość. */
function heldRiskyIds(s: Scenario): string[] {
  return s.assets.filter((a) => a.kind === 'risky' && s.positions.some((p) => p.assetId === a.id && p.value > 0)).map((a) => a.id);
}

/**
 * Karta „Wkład aktywów w ryzyko” (spec 4.13): „BTC to 10% wartości i N% ryzyka”. Widoczna tylko przy ≥ 2 aktywach
 * ryzykownych. Zdanie dotyczy BTC, jeśli jest w portfelu, a inaczej aktywa o największym wkładzie w ryzyko.
 * Liczy w workerze, osobnym przebiegiem 2 000 ścieżek.
 */
export function RiskCard({ scenario, createWorker }: RiskCardProps) {
  const { t } = useLingui();
  const names = useAssetNames();
  const [rows, setRows] = useState<AssetRiskShare[] | null>(null);
  const eligible = heldRiskyIds(scenario).length >= 2;

  useEffect(() => {
    if (!eligible) return;
    let alive = true;
    const h = runTask((w) => w.riskShares(scenario, { seed: SIM_SEED, paths: PATHS }), createWorker);
    h.done.then(
      (r) => alive && setRows(r),
      () => alive && setRows(null),
    );
    return () => {
      alive = false;
      h.cancel();
    };
  }, [eligible, scenario, createWorker]);

  const focus = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    return rows.find((r) => /^btc/.test(r.assetId)) ?? rows.reduce((a, b) => (b.riskShare > a.riskShare ? b : a));
  }, [rows]);

  if (!eligible || !rows || !focus) return null;
  const nameOf = (id: string): string => (/^btc/.test(id) ? 'BTC' : names.asset(id));
  const name = nameOf(focus.assetId);
  const value = pct(focus.valueShare);
  const risk = pct(focus.riskShare);

  return (
    <Card title={t`Wkład aktywów w ryzyko`}>
      <p className="m-0 font-medium">{t`${name} to ${value}% wartości i ${risk}% ryzyka`}</p>
      <p className="mb-3 mt-1 text-sm text-muted">{t`Ryzyko to zmienność wartości portfela w skali roku; udział aktywa uwzględnia jego wagę, zmienność i zależność od pozostałych.`}</p>
      <DataTable
        caption={t`Udział aktywów w wartości i ryzyku portfela`}
        cornerLabel={t`Aktywo`}
        columns={[t`Wartość`, t`Ryzyko`]}
        rows={rows.map((r) => ({ label: nameOf(r.assetId), cells: [`${pct(r.valueShare)}%`, `${pct(r.riskShare)}%`] }))}
      />
    </Card>
  );
}
