import 'fake-indexeddb/auto';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { useScenarioStore } from '../../state/scenarioStore';
import * as exportImport from './exportImport';
import { StorageNotice } from './StorageNotice';

vi.mock('./exportImport', async (orig) => {
  const actual = await orig<typeof import('./exportImport')>();
  return { ...actual, downloadText: vi.fn() };
});

const wrap = () =>
  render(
    <I18nProvider i18n={i18n}>
      <StorageNotice />
    </I18nProvider>,
  );

beforeEach(() => {
  useScenarioStore.getState().resetScenario();
  useScenarioStore.setState({ storageError: null });
  vi.clearAllMocks();
});

describe('StorageNotice', () => {
  it('nic nie pokazuje, gdy zapis jest w porządku', () => {
    wrap();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uszkodzony zapis: karta, kopia surowych danych i „Zacznij od nowa”', async () => {
    useScenarioStore.setState({ loadStatus: 'invalid', loadError: 'zły schemat' });
    wrap();
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać zapisanego planu');
    await userEvent.click(screen.getByRole('button', { name: 'Pobierz kopię danych' }));
    expect(exportImport.downloadText).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Zacznij od nowa' }));
    expect(useScenarioStore.getState().loadStatus).toBe('ready');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('błąd zapisu lokalnego: komunikat, aplikacja działa dalej', () => {
    useScenarioStore.setState({ storageError: 'QuotaExceeded' });
    wrap();
    expect(screen.getByRole('status')).toHaveTextContent('Nie możemy zapisać planu na tym urządzeniu');
  });
});
