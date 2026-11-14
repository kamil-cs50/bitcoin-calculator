import 'fake-indexeddb/auto';
import { I18nProvider } from '@lingui/react';
import { runBatch, summarize } from '@sim/engine';
import type { Scenario } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as features from '../../entitlements/features';
import { i18n } from '../../i18n';
import { db } from '../../state/db';
import { MAX_COMPARE, useScenarioStore } from '../../state/scenarioStore';
import type { SimWorker } from '../../workers/pool';
import { formatMoney } from '../../lib/format';
import { SIM_SEED } from '../results/useSimulation';
import { valuesAt } from '../results/values';
import { Compare } from './Compare';
import { pairedDifference } from './diff';

vi.mock('../../entitlements/features', async (orig) => {
  const actual = await orig<typeof import('../../entitlements/features')>();
  return { ...actual, useEntitlement: vi.fn(actual.useEntitlement) };
});

const syncWorker = (): SimWorker => ({
  run: async (s, o) => runBatch(s, o),
  solve: async () => {
    throw new Error('nie dotyczy');
  },
  terminate: () => undefined,
});
const N = 1000;
const OPT = { month: 120, real: true, afterTax: true };
const nb = (s: string | null) => (s ?? '').replace(/[\s\u00a0\u202f]/g, ' ');

const base = makeScenario();
const asset0 = base.assets[0]!;
if (asset0.kind !== 'risky') throw new Error('fixture');
const better = makeScenario({ assets: [{ ...asset0, g: 0.08 }] });
const runA = runBatch(base, { seed: SIM_SEED, paths: N });
const runB = runBatch(better, { seed: SIM_SEED, paths: N });

function sortedQuantile(v: Float64Array, p: number): number {
  const s = Float64Array.from(v).sort();
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo]! + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)]! - s[lo]!));
}

describe('pairedDifference (wspólne liczby losowe)', () => {
  it('punkt = różnica kwantyli, a przedział zawiera punkt', () => {
    const d = pairedDifference(runA, runB, OPT);
    const a = valuesAt(runA, runA.grid.length - 1, OPT);
    const b = valuesAt(runB, runB.grid.length - 1, OPT);
    expect(d.median.diff).toBeCloseTo(sortedQuantile(b, 0.5) - sortedQuantile(a, 0.5), 6);
    expect(d.p10.diff).toBeCloseTo(sortedQuantile(b, 0.1) - sortedQuantile(a, 0.1), 6);
    expect(d.median.diff).toBeGreaterThan(0);
    for (const q of [d.median, d.p10]) {
      expect(q.ci[0]).toBeLessThanOrEqual(q.diff);
      expect(q.ci[1]).toBeGreaterThanOrEqual(q.diff);
    }
  });

  it('sparowany przedział jest węższy niż niezależny (z przedziałów mediany każdego scenariusza)', () => {
    const d = pairedDifference(runA, runB, OPT);
    const sa = summarize(runA, base, OPT);
    const sb = summarize(runB, better, OPT);
    // niezależne SE mediany z połowy szerokości przedziałów z statystyk pozycyjnych
    const seA = (sa.medianCI[1] - sa.medianCI[0]) / (2 * 1.96);
    const seB = (sb.medianCI[1] - sb.medianCI[0]) / (2 * 1.96);
    const indepWidth = 2 * 1.96 * Math.sqrt(seA * seA + seB * seB);
    expect(d.median.ci[1] - d.median.ci[0]).toBeLessThan(0.6 * indepWidth);
  });

  it('scenariusze identyczne dają różnicę dokładnie 0 i przedział [0, 0]', () => {
    const same = runBatch(makeScenario(), { seed: SIM_SEED, paths: N });
    const d = pairedDifference(runA, same, OPT);
    expect(d.median.diff).toBe(0);
    expect(d.p10.diff).toBe(0);
    expect(d.median.ci).toEqual([0, 0]);
    expect(d.p10.ci).toEqual([0, 0]);
  });

  it('jest deterministyczny (stałe ziarno bootstrapu)', () => {
    expect(pairedDifference(runA, runB, OPT)).toEqual(pairedDifference(runA, runB, OPT));
  });
});

describe('lista porównania w store', () => {
  beforeEach(async () => {
    await db.scenarios.clear();
    useScenarioStore.getState().resetScenario();
    useScenarioStore.setState({ compareList: [] });
  });

  it('przechowuje do 3 scenariuszy; czwarty jest odrzucany', () => {
    const st = useScenarioStore.getState();
    expect(MAX_COMPARE).toBe(3);
    expect(st.addToCompare('A')).toBe(true);
    expect(st.addToCompare('B')).toBe(true);
    expect(st.addToCompare('C')).toBe(true);
    expect(st.addToCompare('D')).toBe(false);
    expect(useScenarioStore.getState().compareList.map((e) => e.name)).toEqual(['A', 'B', 'C']);
    st.removeFromCompare(useScenarioStore.getState().compareList[0]!.id);
    expect(useScenarioStore.getState().compareList).toHaveLength(2);
  });

  it('lista jest zapisywana i wczytywana (a uszkodzony wpis jest pomijany)', async () => {
    useScenarioStore.getState().addToCompare('Zapis');
    await useScenarioStore.getState().saveNow();
    useScenarioStore.setState({ compareList: [] });
    await useScenarioStore.getState().loadSaved();
    const list = useScenarioStore.getState().compareList;
    expect(list.map((e) => e.name)).toEqual(['Zapis']);
    expect(list[0]!.scenario.schemaVersion).toBe(1);
    await db.scenarios.put({ id: 'compare', name: 'x', updatedAt: 1, data: { entries: [{ id: 'z', name: 'z', scenario: { zly: 1 } }] } });
    await useScenarioStore.getState().loadSaved();
    expect(useScenarioStore.getState().compareList).toEqual([]);
  });

  it('pusta lista usuwa wpis z bazy', async () => {
    useScenarioStore.getState().addToCompare('X');
    await useScenarioStore.getState().saveNow();
    expect(await db.scenarios.get('compare')).toBeDefined();
    useScenarioStore.getState().removeFromCompare(useScenarioStore.getState().compareList[0]!.id);
    await useScenarioStore.getState().saveNow();
    expect(await db.scenarios.get('compare')).toBeUndefined();
  });
});

function withBtc(btc: number): Scenario {
  const st = useScenarioStore.getState();
  st.resetScenario();
  st.addPosition({ presetId: 'globalEquity', value: 100_000 - btc });
  if (btc > 0) useScenarioStore.getState().addPosition({ presetId: 'btcBase', value: btc });
  return { ...useScenarioStore.getState().scenario, horizonMonths: 120 };
}

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <Compare createWorker={syncWorker} maxPaths={N} workers={1} />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('Compare', () => {
  beforeEach(async () => {
    await db.scenarios.clear();
    useScenarioStore.getState().resetScenario();
    useScenarioStore.setState({ compareList: [] });
    vi.mocked(features.useEntitlement).mockReset().mockReturnValue(true);
  });

  it('dwa scenariusze różniące się udziałem BTC: tabela różnic mediany i p10 z przedziałem ufności', async () => {
    const s0 = withBtc(0);
    const s10 = withBtc(10_000);
    useScenarioStore.setState({
      scenario: s10,
      compareList: [
        { id: 'a', name: 'Bez BTC', scenario: s0 },
        { id: 'b', name: '10% BTC', scenario: s10 },
      ],
    });
    view();
    const table = await screen.findByRole('table', { name: /Różnice względem/ }, { timeout: 20_000 });
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('10% BTC');
    const a = runBatch(s0, { seed: SIM_SEED, paths: N });
    const b = runBatch(s10, { seed: SIM_SEED, paths: N });
    const d = pairedDifference(a, b, OPT);
    const text = nb(rows[0]!.textContent);
    expect(text).toMatch(/[−+-]/);
    expect(text).toContain(nb(formatMoney(Math.abs(d.median.diff), 'PLN', { sigDigits: 2 })));
    expect(d.median.ci[0]).toBeLessThanOrEqual(d.median.diff);
    expect(screen.getAllByText(/przedział/i).length).toBeGreaterThan(0);
  }, 30_000);

  it('czwarty scenariusz jest blokowany z komunikatem', async () => {
    view();
    const add = screen.getByRole('button', { name: 'Dodaj bieżący scenariusz' });
    await userEvent.click(add);
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj bieżący scenariusz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj bieżący scenariusz' }));
    expect(useScenarioStore.getState().compareList).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Dodaj bieżący scenariusz' })).toBeDisabled();
    expect(screen.getByText('Można porównać najwyżej 3 scenariusze. Usuń jeden, aby dodać kolejny.')).toBeInTheDocument();
    await waitFor(() => expect(useScenarioStore.getState().compareList).toHaveLength(3));
  });

  it('bez uprawnienia nic nie jest pokazywane', () => {
    vi.mocked(features.useEntitlement).mockReturnValue(false);
    view();
    expect(screen.queryByRole('button', { name: 'Dodaj bieżący scenariusz' })).not.toBeInTheDocument();
  });
});
