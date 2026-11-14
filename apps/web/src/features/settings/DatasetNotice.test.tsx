import { I18nProvider } from '@lingui/react';
import { validateScenario } from '@sim/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { CURRENT_DATASET_VERSION } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';
import { DatasetNotice } from './DatasetNotice';

const wrap = () =>
  render(
    <I18nProvider i18n={i18n}>
      <DatasetNotice />
    </I18nProvider>,
  );

beforeEach(() => {
  const st = useScenarioStore.getState();
  st.resetScenario();
  st.addPosition({ presetId: 'globalEquity', value: 40_000 });
  st.addPosition({ presetId: 'btcBase', value: 10_000 });
});

const makeOutdated = () => {
  const sc = useScenarioStore.getState().scenario;
  // starszy zapis: inne g aktywa i stara wersja zbioru
  const assets = sc.assets.map((a) => (a.kind === 'risky' && a.id === 'globalEquity' ? { ...a, g: 0.123 } : a));
  useScenarioStore.setState({ scenario: { ...sc, assets, datasetVersion: '2025.01' }, datasetOutdated: true });
};

describe('DatasetNotice (datasetOutdated)', () => {
  it('nic nie pokazuje przy aktualnym zbiorze danych', () => {
    wrap();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('starszy zbiór: informacja z wersjami i propozycją aktualizacji', () => {
    makeOutdated();
    wrap();
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('2025.01');
    expect(note).toHaveTextContent(CURRENT_DATASET_VERSION);
    expect(screen.getByRole('button', { name: 'Zaktualizuj parametry' })).toBeInTheDocument();
  });

  it('„Zaktualizuj parametry” odbudowuje aktywa i rynek z bieżącego zbioru, zachowuje pozycje i plan', async () => {
    makeOutdated();
    const before = useScenarioStore.getState().scenario;
    wrap();
    await userEvent.click(screen.getByRole('button', { name: 'Zaktualizuj parametry' }));
    const st = useScenarioStore.getState();
    expect(st.datasetOutdated).toBe(false);
    expect(st.scenario.datasetVersion).toBe(CURRENT_DATASET_VERSION);
    const eq = st.scenario.assets.find((a) => a.id === 'globalEquity')!;
    expect(eq.kind === 'risky' && eq.g).not.toBe(0.123);
    expect(st.scenario.positions).toEqual(before.positions);
    expect(st.scenario.horizonMonths).toBe(before.horizonMonths);
    expect(validateScenario(st.scenario).ok).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('„Zostaw” chowa informację, ale parametry zostają', async () => {
    makeOutdated();
    wrap();
    await userEvent.click(screen.getByRole('button', { name: 'Zostaw bez zmian' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useScenarioStore.getState().scenario.datasetVersion).toBe('2025.01');
  });
});
