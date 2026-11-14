import { I18nProvider } from '@lingui/react';
import { loadDataset } from '@sim/data';
import { runBatch, summarize, wilson } from '@sim/engine';
import type { ModelCheckRow, RunResult, Scenario, Warning } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../app/routes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { useScenarioStore } from '../../state/scenarioStore';
import { useUiStore } from '../../state/uiStore';
import type { SimWorker } from '../../workers/pool';
import * as pool from '../../workers/pool';
import { BtcCard } from './BtcCard';
import { Dashboard, WarningBanners } from './Dashboard';
import { KpiTiles } from './KpiTiles';
import { ModelCheckPanel } from './ModelCheckPanel';
import { QualityBadge } from './QualityBadge';
import { SIM_SEED, useSimulation } from './useSimulation';

vi.mock('../../workers/pool', async (orig) => {
  const actual = await orig<typeof import('../../workers/pool')>();
  return { ...actual, runProgressive: vi.fn(actual.runProgressive) };
});

const syncWorker = (): SimWorker => ({ run: async (s, o) => runBatch(s, o), terminate: () => undefined });
const SIM = { createWorker: syncWorker, debounceMs: 0, maxPaths: 1000, workers: 1 };
const shell = (ui: React.ReactNode) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nProvider>
);
const wrap = (ui: React.ReactNode) => render(shell(ui));
const nb = (s: string | null) => (s ?? '').replace(/[\s\u00a0\u202f]/g, ' ');
const money2 = (v: number) => formatMoney(v, 'PLN', { sigDigits: 2 });

const goalScenario: Scenario = makeScenario({ horizonMonths: 120, goal: { amountReal: 120_000, month: 120 } });
const result: RunResult = runBatch(goalScenario, { seed: SIM_SEED, paths: 1000 });
const kpi = (o: { real?: boolean; afterTax?: boolean; expert?: boolean; month?: number } = {}) => (
  <KpiTiles result={result} scenario={goalScenario} month={o.month ?? 120} real={o.real ?? true} afterTax={o.afterTax ?? true} expert={o.expert ?? false} />
);

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ expert: false });
  useScenarioStore.getState().resetScenario();
  vi.mocked(pool.runProgressive).mockReset();
});

describe('KpiTiles', () => {
  it('typowy wynik = mediana realna po podatku (2 cyfry znaczące) i przedział p10-p90', () => {
    wrap(kpi());
    const s = summarize(result, goalScenario, { month: 120, real: true, afterTax: true });
    expect(screen.getByText('Typowy wynik za 10 lat (w dzisiejszych zł)')).toBeInTheDocument();
    expect(nb(screen.getByTestId('kpi-median').textContent)).toBe(nb(money2(s.median)));
    expect(nb(screen.getByTestId('kpi-range').textContent)).toBe(nb(`W 8 na 10 przyszłości między ${money2(s.p10)} a ${money2(s.p90)}`));
  });

  it('tryb nominalny zmienia liczby i podpis', () => {
    const { rerender } = wrap(kpi());
    const base = screen.getByTestId('kpi-median').textContent;
    rerender(shell(kpi({ real: false })));
    expect(screen.getByText('Typowy wynik za 10 lat (nominalnie)')).toBeInTheDocument();
    const nominal = screen.getByTestId('kpi-median').textContent;
    expect(nominal).toBe(money2(summarize(result, goalScenario, { month: 120, real: false, afterTax: true }).median));
    expect(nominal).not.toBe(base);
  });

  it('szansa celu, ryzyko spadku >30% i najgorsze 5% (częstości naturalne)', () => {
    wrap(kpi());
    expect(screen.getByRole('region', { name: 'Szansa na cel' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ryzyko spadku o ponad 30%' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Najgorsze 5% przyszłości/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Szansa na cel' }).textContent).toMatch(/przyszłości|żadnej|każdej/);
  });

  it('średnia tylko w trybie eksperta, z dopiskiem o rzadkich skrajnych scenariuszach', () => {
    const { rerender } = wrap(kpi());
    expect(screen.queryByRole('region', { name: /Średnia/ })).not.toBeInTheDocument();
    rerender(shell(kpi({ expert: true })));
    const card = screen.getByRole('region', { name: /Średnia/ });
    expect(within(card).getByText(/rzadkie, skrajnie dobre scenariusze/)).toBeInTheDocument();
    const mean = summarize(result, goalScenario, { month: 120, real: true, afterTax: true }).mean;
    expect(nb(card.textContent)).toContain(nb(money2(mean)));
  });
});

describe('QualityBadge', () => {
  it('liczba przyszłości i dokładność z przedziału Wilsona dla szansy celu', () => {
    wrap(<QualityBadge result={result} scenario={goalScenario} running={false} />);
    const g = summarize(result, goalScenario, { month: 120, real: true, afterTax: true }).probGoal!;
    const [lo, hi] = wilson(Math.round(g.p * 1000), 1000);
    const pp = (((hi - lo) / 2) * 100).toFixed(1).replace('.', ',');
    expect(nb(screen.getByTestId('quality').textContent)).toBe(nb(`${new Intl.NumberFormat('pl-PL').format(1000)} przyszłości · dokładność ±${pp} pp`));
  });

  it('plakietka kalibracji i stan liczenia', () => {
    const { rerender } = wrap(<QualityBadge result={result} scenario={goalScenario} running={false} calibrated />);
    expect(screen.getByText('model skalibrowany ✓')).toBeInTheDocument();
    rerender(shell(<QualityBadge result={result} scenario={goalScenario} running calibrated={false} />));
    expect(screen.queryByText('model skalibrowany ✓')).not.toBeInTheDocument();
    expect(screen.getByText(/liczę dalej/)).toBeInTheDocument();
  });
});

describe('ModelCheckPanel', () => {
  const row = (id: string, ok: boolean): ModelCheckRow => ({ id, metric: 'vol', input: 0.16, simulated: ok ? 0.161 : 0.2, se: 0.002, ok });
  it('tabela wejście vs symulacja i plakietka tylko gdy wszystkie ok', () => {
    const { rerender } = wrap(<ModelCheckPanel rows={[row('a', true), row('b', true)]} />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('model skalibrowany ✓')).toBeInTheDocument();
    rerender(shell(<ModelCheckPanel rows={[row('a', true), row('b', false)]} />));
    expect(screen.queryByText('model skalibrowany ✓')).not.toBeInTheDocument();
    expect(screen.getByText('1 z 2 pozycji odbiega od wejścia')).toBeInTheDocument();
  });
});

describe('BtcCard', () => {
  const dataset = loadDataset('2026.11');
  const btcScenario = (): Scenario => {
    useScenarioStore.getState().addPosition({ presetId: 'btcBase', value: 10_000 });
    return useScenarioStore.getState().scenario;
  };

  it('niewidoczna bez BTC w portfelu', () => {
    const { container } = wrap(<BtcCard scenario={goalScenario} dataset={dataset} month={60} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('percentyle ceny w USD i PLN oraz szansa upadku do roku X', () => {
    const s = btcScenario();
    const a = s.assets.find((x) => x.id === 'btcBase')!;
    if (a.kind !== 'risky' || !a.collapse) throw new Error('fixture');
    wrap(<BtcCard scenario={s} dataset={dataset} month={120} priceUsd={100_000} pricePln={400_000} />);
    const year = s.startYear + 10;
    expect(screen.getByRole('region', { name: `Bitcoin: rozkład ceny w roku ${year}` })).toBeInTheDocument();
    const n = Math.round(100 * (1 - Math.exp(-a.collapse.hazard * 10)));
    expect(screen.getByText(`Szansa upadku do roku ${year}: ${n} na 100`)).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const cells = rows.map((r) => within(r).getAllByRole('cell').map((c) => nb(c.textContent)));
    expect(cells.every((c) => /\$|USD/.test(c[0]!) && /zł/.test(c[1]!))).toBe(true);
    // percentyle rosną: p10 < p50 < p90 (po usunięciu separatorów)
    const num = (t: string) => Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * (/mld/.test(t) ? 1e9 : /mln/.test(t) ? 1e6 : 1);
    expect(num(cells[0]![0]!)).toBeLessThan(num(cells[2]![0]!));
  });

  it('bez wpisanej ceny prosi o cenę, ale pokazuje szansę upadku', () => {
    const s = btcScenario();
    wrap(<BtcCard scenario={s} dataset={dataset} month={120} />);
    expect(screen.getByText(/Wpisz dzisiejszą cenę 1 BTC/)).toBeInTheDocument();
    expect(screen.getByText(/Szansa upadku do roku/)).toBeInTheDocument();
  });
});

describe('WarningBanners', () => {
  it('CORR_PROJECTED: baner z macierzą po korekcie', () => {
    const w: Warning = { code: 'CORR_PROJECTED', message: 'Użyto najbliższej macierzy', data: { factorIds: ['a', 'b'], matrix: [1, 0.55, 0.55, 1] } };
    wrap(<WarningBanners warnings={[w]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Użyto najbliższej macierzy');
    const table = screen.getByRole('table', { name: /Macierz korelacji po korekcie/ });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByText('0,55')).toHaveLength(2);
  });
});

describe('useSimulation', () => {
  const sc = makeScenario({ horizonMonths: 24 });

  it('liczy progresywnie i zwraca wynik końcowy', async () => {
    const { result: r } = renderHook(() => useSimulation(sc, SIM));
    await waitFor(() => expect(r.current.running).toBe(false));
    expect(r.current.stage).toBe(1000);
    expect(r.current.result?.paths).toBe(1000);
  });

  it('zmiana scenariusza w trakcie liczenia anuluje stary przebieg', async () => {
    const cancel = vi.fn();
    vi.mocked(pool.runProgressive).mockImplementation(() => ({ cancel, done: new Promise<RunResult>(() => undefined) }));
    const { rerender } = renderHook(({ s }) => useSimulation(s, SIM), { initialProps: { s: sc } });
    await waitFor(() => expect(pool.runProgressive).toHaveBeenCalledTimes(1));
    rerender({ s: { ...sc, horizonMonths: 36 } });
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pool.runProgressive).toHaveBeenCalledTimes(2));
  });

  it('debounce: szybkie zmiany dają jeden przebieg', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(pool.runProgressive).mockImplementation(() => ({ cancel: vi.fn(), done: new Promise<RunResult>(() => undefined) }));
      const { rerender } = renderHook(({ s }) => useSimulation(s, { ...SIM, debounceMs: 250 }), { initialProps: { s: sc } });
      rerender({ s: { ...sc, horizonMonths: 30 } });
      rerender({ s: { ...sc, horizonMonths: 36 } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(249);
      });
      expect(pool.runProgressive).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2);
      });
      expect(pool.runProgressive).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('niepoprawny scenariusz nie uruchamia symulacji i zwraca błędy', async () => {
    const bad = { ...sc, horizonMonths: 0 };
    const { result: r } = renderHook(() => useSimulation(bad, SIM));
    await waitFor(() => expect(r.current.errors.length).toBeGreaterThan(0));
    expect(pool.runProgressive).not.toHaveBeenCalled();
  });
});

function fireSlider(el: HTMLElement, value: number) {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Dashboard', () => {
  beforeEach(() => {
    useScenarioStore.getState().setScenario(goalScenario);
  });
  const ready = async () => {
    await waitFor(() => expect(screen.getByTestId('kpi-median')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/liczę dalej/)).not.toBeInTheDocument());
  };

  it('domyślnie realnie i po podatku; przełączniki zmieniają kafelki i wachlarz', async () => {
    wrap(<Dashboard sim={SIM} />);
    await ready();
    const realSwitch = screen.getByRole('switch', { name: /Realnie/ });
    const taxSwitch = screen.getByRole('switch', { name: /Po podatku/ });
    expect(realSwitch).toBeChecked();
    expect(taxSwitch).toBeChecked();
    const exp = (real: boolean, afterTax: boolean) => money2(summarize(result, goalScenario, { month: 120, real, afterTax }).median);
    expect(nb(screen.getByTestId('kpi-median').textContent)).toBe(nb(exp(true, true)));
    const fanBefore = screen.getByRole('img', { name: /Wachlarz/ }).innerHTML;
    await userEvent.click(realSwitch);
    expect(nb(screen.getByTestId('kpi-median').textContent)).toBe(nb(exp(false, true)));
    expect(screen.getByText(/Typowy wynik za 10 lat \(nominalnie\)/)).toBeInTheDocument();
    await userEvent.click(taxSwitch);
    expect(nb(screen.getByTestId('kpi-median').textContent)).toBe(nb(exp(false, false)));
    expect(screen.getByRole('img', { name: /Wachlarz/ }).innerHTML).not.toBe(fanBefore);
  });

  it('suwak roku zmienia wartości kafelków', async () => {
    wrap(<Dashboard sim={SIM} />);
    await ready();
    const slider = screen.getByRole('slider', { name: /Rok na wykresie/ });
    const before = screen.getByTestId('kpi-median').textContent;
    fireSlider(slider, '4' as unknown as number);
    await waitFor(() => expect(screen.getByTestId('kpi-median').textContent).not.toBe(before));
    expect(screen.getByText(/Typowy wynik za (\d+|\d+,\d+) (lat|lata|rok|roku)/)).toBeInTheDocument();
  });

  it('tryb eksperta odsłania średnią i kontrolę modelu', async () => {
    wrap(<Dashboard sim={SIM} />);
    await ready();
    expect(screen.queryByRole('region', { name: /Średnia/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Tryb eksperta/ }));
    expect(screen.getByRole('region', { name: /Średnia/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('table', { name: /Kontrola modelu/ })).toBeInTheDocument());
  });

  it('pusty scenariusz pokazuje komunikat zamiast wyniku', async () => {
    useScenarioStore.getState().resetScenario();
    wrap(<Dashboard sim={SIM} />);
    expect(await screen.findByText(/Dodaj do portfela/)).toBeInTheDocument();
  });
});

describe('trasa /wynik', () => {
  it('renderuje Dashboard', async () => {
    useScenarioStore.getState().resetScenario();
    render(
      <I18nProvider i18n={i18n}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/wynik'] })} />
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Wynik' })).toBeInTheDocument();
    expect(screen.getByText(/Dodaj do portfela/)).toBeInTheDocument();
  });
});
