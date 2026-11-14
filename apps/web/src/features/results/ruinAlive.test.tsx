import { I18nProvider } from '@lingui/react';
import { loadDataset } from '@sim/data';
import { probRuinWhileAlive, runBatch, survivalCurve } from '@sim/engine';
import type { RunResult, Scenario } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { naturalFrequency } from '../../lib/format';
import { useScenarioStore } from '../../state/scenarioStore';
import { syncWorker } from '../../workers/syncWorker';
import { RuinAliveCard } from './RuinAliveCard';
import { capitalize } from './periods';
import { SIM_SEED } from './useSimulation';

const dataset = loadDataset('2026.11');
const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );

/** Portfel 100 000 zł z wypłatą 2 000 zł miesięcznie przez 10 lat: ruina w sporej części przyszłości. */
const base = (over: Partial<Scenario> = {}): Scenario =>
  makeScenario({ horizonMonths: 120, withdrawal: { kind: 'fixedReal', startMonth: 0, monthly: 1_500 }, ...over });

beforeEach(() => {
  localStorage.clear();
  useScenarioStore.getState().resetScenario();
});

describe('zadanie ruinAlive (worker)', () => {
  it('zwraca to samo co probRuinWhileAlive na krzywej przeżycia z tablic GUS', async () => {
    const s = base();
    const r: RunResult = runBatch(s, { seed: SIM_SEED, paths: 1000 });
    const qx = dataset.lifeTables.female.qx;
    const got = await syncWorker().ruinAlive(r.ruinMonth, qx, 65, s.horizonMonths, 0);
    const want = probRuinWhileAlive(r.ruinMonth, survivalCurve(qx, 65, s.horizonMonths, 0));
    expect(got.p).toBeCloseTo(want.p, 12);
    expect(got.ci).toEqual(want.ci);
    expect(got.p).toBeGreaterThan(0);
  });
});

describe('RuinAliveCard', () => {
  const result = runBatch(base(), { seed: SIM_SEED, paths: 1000 });
  const ruinShare = result.ruinMonth.filter((m) => m >= 0).length / result.paths;

  it('bez wieku i płci albo bez wypłat nic nie pokazuje (brak krzywej przeżycia)', () => {
    const noPerson = wrap(<RuinAliveCard result={result} scenario={base()} dataset={dataset} createWorker={syncWorker} />);
    expect(noPerson.container).toBeEmptyDOMElement();
    noPerson.unmount();
    const ageOnly = wrap(<RuinAliveCard result={result} scenario={base({ person: { age: 65 } })} dataset={dataset} createWorker={syncWorker} />);
    expect(ageOnly.container).toBeEmptyDOMElement();
    ageOnly.unmount();
    const noWd = base({ person: { age: 65, sex: 'M' } });
    delete noWd.withdrawal;
    const c = wrap(<RuinAliveCard result={result} scenario={noWd} dataset={dataset} createWorker={syncWorker} />);
    expect(c.container).toBeEmptyDOMElement();
  });

  it('pokazuje szansę ruiny za życia (mniejszą niż szansa ruiny w całym okresie), liczoną w workerze z tablic GUS', async () => {
    const s = base({ person: { age: 70, sex: 'M' } });
    const ruinAlive = vi.fn(async (...a: Parameters<ReturnType<typeof syncWorker>['ruinAlive']>) => syncWorker().ruinAlive(...a));
    wrap(<RuinAliveCard result={result} scenario={s} dataset={dataset} createWorker={() => syncWorker({ ruinAlive })} />);
    const tile = await screen.findByTestId('kpi-ruin-alive');
    const want = probRuinWhileAlive(result.ruinMonth, survivalCurve(dataset.lifeTables.male.qx, 70, 120, 0));
    expect(tile.textContent).toBe(capitalize(naturalFrequency(want.p)));
    expect(want.p).toBeLessThan(ruinShare);
    expect(ruinAlive).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Szansa, że środki wyczerpią się, gdy jeszcze żyjesz' })).toBeInTheDocument();
    expect(screen.getByText(/nie niepewność tablic/)).toBeInTheDocument();
  });

  it('opcja „+2 lata” podnosi szansę (dłuższe życie) i jest opisana w karcie; płeć K używa tablicy kobiet', async () => {
    const run = async (person: NonNullable<Scenario['person']>) => {
      const { unmount } = wrap(<RuinAliveCard result={result} scenario={base({ person })} dataset={dataset} createWorker={syncWorker} />);
      const el = await screen.findByTestId('kpi-ruin-alive');
      const text = el.textContent!;
      await waitFor(() => expect(text).not.toBe(''));
      unmount();
      return text;
    };
    const plain = await run({ age: 70, sex: 'K' });
    const bonus = await run({ age: 70, sex: 'K', cohortBonus: true });
    const k = (cb: boolean) =>
      probRuinWhileAlive(result.ruinMonth, survivalCurve(dataset.lifeTables.female.qx, 70, 120, cb ? dataset.lifeTables.cohortExtraYears.value : 0)).p;
    expect(plain).toBe(capitalize(naturalFrequency(k(false))));
    expect(bonus).toBe(capitalize(naturalFrequency(k(true))));
    expect(k(true)).toBeGreaterThan(k(false));
  });
});
