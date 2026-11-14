import 'fake-indexeddb/auto';
import { I18nProvider } from '@lingui/react';
import { loadDataset } from '@sim/data';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { CURRENT_ID, db } from '../../state/db';
import { defaultScenario } from '../../state/defaults';
import { useScenarioStore } from '../../state/scenarioStore';
import { applyTheme, useThemeStore } from '../../state/themeStore';
import { useUpdateStore } from '../../state/updateStore';
import { exportScenario, parseImport } from './exportImport';
import * as exportImport from './exportImport';
import { Settings } from './Settings';
import { UpdateBanner } from './UpdateBanner';

vi.mock('./exportImport', async (orig) => {
  const actual = await orig<typeof import('./exportImport')>();
  return { ...actual, downloadText: vi.fn() };
});

const shell = (ui: React.ReactNode) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nProvider>
);
const wrap = (ui: React.ReactNode) => render(shell(ui));

const withPositions = () => {
  const st = useScenarioStore.getState();
  st.resetScenario();
  st.addPosition({ presetId: 'globalEquity', value: 50_000 });
  st.addPosition({ presetId: 'btcBase', value: 10_000 });
  return useScenarioStore.getState().scenario;
};

beforeEach(async () => {
  localStorage.clear();
  await db.scenarios.clear();
  useScenarioStore.getState().resetScenario();
  useThemeStore.setState({ theme: 'system' });
  useUpdateStore.setState({ needRefresh: false, offlineReady: false, apply: null });
  document.documentElement.removeAttribute('data-theme');
  vi.mocked(exportImport.downloadText).mockClear();
});

describe('eksport i import', () => {
  it('eksport i ponowny import dają równy scenariusz', () => {
    const s = withPositions();
    const r = parseImport(exportScenario(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scenario).toEqual(s);
  });

  it.each([
    ['nie-JSON', '{to nie jest json'],
    ['tablica', '[1,2,3]'],
    ['brak schemaVersion', '{"horizonMonths":12}'],
    ['nowsza wersja schematu', JSON.stringify({ ...defaultScenario(loadDataset('2026.11')), schemaVersion: 99 })],
    ['zły typ pola', JSON.stringify({ ...defaultScenario(loadDataset('2026.11')), horizonMonths: 'dużo' })],
  ])('odrzuca uszkodzony plik: %s', (_n, text) => {
    expect(parseImport(text).ok).toBe(false);
  });
});

describe('Ustawienia: dane', () => {
  it('„Pobierz kopię” zapisuje bieżący scenariusz jako JSON', async () => {
    const s = withPositions();
    wrap(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Pobierz kopię (JSON)' }));
    const [name, text] = vi.mocked(exportImport.downloadText).mock.calls[0]!;
    expect(name).toMatch(/\.json$/);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('import poprawnego pliku podmienia scenariusz', async () => {
    const s = withPositions();
    const text = exportScenario(s);
    useScenarioStore.getState().resetScenario();
    wrap(<Settings />);
    const file = new File([text], 'plan.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Wczytaj plik JSON'), file);
    await waitFor(() => expect(useScenarioStore.getState().scenario).toEqual(s));
    expect(screen.getByRole('status')).toHaveTextContent('Wczytano plan z pliku');
  });

  it('import uszkodzonego pliku pokazuje błąd i nie zmienia stanu', async () => {
    const before = withPositions();
    wrap(<Settings />);
    const file = new File(['{zepsute'], 'zly.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Wczytaj plik JSON'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać pliku');
    expect(useScenarioStore.getState().scenario).toBe(before);
  });

  it('„Zresetuj dane” czyści Dexie dopiero po potwierdzeniu', async () => {
    const s = withPositions();
    await db.scenarios.put({ id: CURRENT_ID, name: 'x', updatedAt: 1, data: s });
    wrap(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Zresetuj dane' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    expect(await db.scenarios.count()).toBe(1);
    expect(useScenarioStore.getState().scenario).toBe(s);

    await userEvent.click(screen.getByRole('button', { name: 'Zresetuj dane' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Tak, usuń moje dane' }));
    await waitFor(async () => expect(await db.scenarios.count()).toBe(0));
    expect(useScenarioStore.getState().scenario.positions).toEqual([]);
  });
});

describe('Ustawienia: motyw', () => {
  it('wybór ciemnego/jasnego ustawia data-theme i zapamiętuje, „system” je zdejmuje', async () => {
    wrap(<Settings />);
    const group = screen.getByRole('radiogroup', { name: 'Motyw' });
    expect(within(group).getByRole('radio', { name: 'Jak w systemie' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'Ciemny' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('ui:theme')).toBe('dark');
    await userEvent.click(within(group).getByRole('radio', { name: 'Jasny' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(within(group).getByRole('radio', { name: 'Jak w systemie' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('ui:theme')).toBe('system');
  });

  it('applyTheme jest idempotentne', () => {
    applyTheme('dark');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('aktualizacja aplikacji', () => {
  it('baner pojawia się dopiero, gdy jest nowa wersja, i odświeża po kliknięciu', async () => {
    const apply = vi.fn();
    wrap(<UpdateBanner />);
    expect(screen.queryByRole('button', { name: 'Odśwież' })).not.toBeInTheDocument();
    act(() => useUpdateStore.getState().setNeedRefresh(apply));
    expect(screen.getByRole('status')).toHaveTextContent('Dostępna nowa wersja — odśwież');
    await userEvent.click(screen.getByRole('button', { name: 'Odśwież' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('Ustawienia pokazują ten sam baner', () => {
    useUpdateStore.getState().setNeedRefresh(() => undefined);
    wrap(<Settings />);
    expect(screen.getByText('Dostępna nowa wersja — odśwież')).toBeInTheDocument();
  });
});
