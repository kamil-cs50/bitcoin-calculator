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
import { syncWorker } from '../../workers/syncWorker';
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
    expect(screen.getByText('Typowy wynik za 10 lat (w dzisiejszych zł, po podatku)')).toBeInTheDocument();
    expect(nb(screen.getByTestId('kpi-median').textContent)).toBe(nb(money2(s.median)));
    expect(nb(screen.getByTestId('kpi-range').textContent)).toBe(nb(`W 8 na 10 przyszłości między ${money2(s.p10)} a ${money2(s.p90)}`));
  });

  it('tryb nominalny zmienia liczby i podpis', () => {
    const { rerender } = wrap(kpi());
    const base = screen.getByTestId('kpi-median').textContent;
    rerender(shell(kpi({ real: false })));
    expect(screen.getByText('Typowy wynik za 10 lat (nominalnie, po podatku)')).toBeInTheDocument();
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
    const { container } = wrap(<BtcCard scenario={goalScenario} dataset={dataset} month={60} createWorker={syncWorker} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('percentyle ceny w USD i PLN oraz szansa upadku do roku X', async () => {
    const s = btcScenario();
    const a = s.assets.find((x) => x.id === 'btcBase')!;
    if (a.kind !== 'risky' || !a.collapse) throw new Error('fixture');
    wrap(<BtcCard scenario={s} dataset={dataset} month={120} priceUsd={100_000} pricePln={400_000} createWorker={syncWorker} />);
    const year = s.startYear + 10;
    expect(screen.getByRole('region', { name: `Bitcoin: rozkład ceny w roku ${year}` })).toBeInTheDocument();
    const n = Math.round(100 * (1 - Math.exp(-a.collapse.hazard * 10)));
    expect(screen.getByText(`Szansa upadku do roku ${year}: ${n} na 100`)).toBeInTheDocument();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row')[1]!.textContent).not.toContain('–'));
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const cells = rows.map((r) => within(r).getAllByRole('cell').map((c) => nb(c.textContent)));
    expect(cells.every((c) => /\$|USD/.test(c[0]!) && /zł/.test(c[1]!))).toBe(true);
    // percentyle rosną: p10 < p50 < p90 (po usunięciu separatorów)
    const num = (t: string) => Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * (/mld/.test(t) ? 1e9 : /mln/.test(t) ? 1e6 : 1);
    expect(num(cells[0]![0]!)).toBeLessThan(num(cells[2]![0]!));
  });

  it('bez wpisanej ceny prosi o cenę, ale pokazuje szansę upadku', () => {
    const s = btcScenario();
    wrap(<BtcCard scenario={s} dataset={dataset} month={120} createWorker={syncWorker} />);
    expect(screen.getByText(/Wpisz dzisiejszą cenę 1 BTC/)).toBeInTheDocument();
    expect(screen.getByText(/Szansa upadku do roku/)).toBeInTheDocument();
  });
});

describe('liczenie poza głównym wątkiem', () => {
  const dataset = loadDataset('2026.11');
  it('BtcCard liczy rozkład ceny w workerze (2 zadania: USD i PLN, po 1000 ścieżek), nie na głównym wątku', async () => {
    useScenarioStore.getState().addPosition({ presetId: 'btcBase', value: 10_000 });
    const s = useScenarioStore.getState().scenario;
    const summary = vi.fn(async () => ({ p10: 1, median: 2, p90: 3 }) as never);
    wrap(<BtcCard scenario={s} dataset={dataset} month={120} priceUsd={100} pricePln={400} createWorker={() => syncWorker({ summary })} />);
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
    expect(summary.mock.calls.every((c) => (c as unknown as [unknown, { paths: number }])[1].paths === 1000)).toBe(true);
    const table = await screen.findByRole('table');
    await waitFor(() => expect(nb(within(table).getAllByRole('row')[1]!.textContent)).toMatch(/\$|USD/));
  });

  it('Dashboard: kontrola modelu idzie do workera (tryb eksperta pokazuje jej wynik)', async () => {
    useScenarioStore.getState().setScenario(goalScenario);
    useUiStore.setState({ expert: true });
    const rows: ModelCheckRow[] = [{ id: 'x', metric: 'vol', input: 0.16, simulated: 0.161, se: 0.002, ok: true }];
    const modelCheck = vi.fn(async () => rows);
    wrap(<Dashboard sim={{ ...SIM, createWorker: () => syncWorker({ modelCheck }) }} />);
    await waitFor(() => expect(modelCheck).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('table', { name: /Kontrola modelu/ })).toBeInTheDocument();
  });
});

describe('Dashboard: ruina za życia i wskazówki o bazie wypłat', () => {
  const wd = { kind: 'fixedReal', startMonth: 0, monthly: 1_500 } as const;
  it('z wypłatami, wiekiem i płcią pokazuje kafelek „gdy jeszcze żyjesz”; bez płci go nie ma', async () => {
    useScenarioStore.getState().setScenario(makeScenario({ horizonMonths: 120, withdrawal: wd, person: { age: 65, sex: 'K' } }));
    const { unmount } = wrap(<Dashboard sim={SIM} />);
    expect(await screen.findByTestId('kpi-ruin-alive')).toBeInTheDocument();
    unmount();
    useScenarioStore.getState().setScenario(makeScenario({ horizonMonths: 120, withdrawal: wd, person: { age: 65 } }));
    wrap(<Dashboard sim={SIM} />);
    await screen.findByTestId('kpi-median');
    expect(screen.queryByTestId('kpi-ruin-alive')).toBeNull();
  });
});

describe('WarningBanners', () => {
  it('CORR_PROJECTED: baner z macierzą po korekcie', () => {
    const w: Warning = { code: 'CORR_PROJECTED', message: 'Użyto najbliższej macierzy', data: { factorIds: ['a', 'b'], matrix: [1, 0.55, 0.55, 1] } };
    wrap(<WarningBanners warnings={[w]} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/najbliższej poprawnej macierzy korelacji/);
    const table = screen.getByRole('table', { name: /Macierz korelacji po korekcie/ });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByText('0,55')).toHaveLength(2);
  });
});

describe('WarningBanners: teksty przez Lingui (mapowanie po code)', () => {
  const raw = 'SUROWY-TEKST-SILNIKA';
  it.each([
    [{ code: 'EMPTY_PORTFOLIO', message: raw }, /Suma docelowych wag/],
    [{ code: 'NEGATIVE_TARGET_WEIGHT', message: raw }, /Ujemna docelowa waga/],
    [{ code: 'LOSS_OVER_5M', message: raw, data: { year: 2040, loss: 6e6 } }, /5 mln zł/],
    [{ code: 'ALPHA_CLAMPED', message: raw, data: { id: 'btcBase', from: 1, to: 0.5 } }, /Bitcoin/],
    [{ code: 'ALPHA_CLAMPED', message: raw, data: { id: 'fx:USD', from: 1, to: 0.5 } }, /kursu USD/],
    [{ code: 'CORR_PROJECTED', message: raw }, /najbliższej poprawnej macierzy/],
  ] as [Warning, RegExp][])('%j', (w, re) => {
    wrap(<WarningBanners warnings={[w]} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(re);
    expect(alert).not.toHaveTextContent(raw);
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

  it('błąd workera: running wraca na false i jest stan błędu (anulowanie go nie ustawia)', async () => {
    vi.mocked(pool.runProgressive).mockImplementation(() => ({ cancel: vi.fn(), done: Promise.reject(new Error('worker padł')) }));
    const { result: r } = renderHook(() => useSimulation(sc, SIM));
    await waitFor(() => expect(r.current.failed).toBe(true));
    expect(r.current.running).toBe(false);
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
    expect(screen.getByText(/Typowy wynik za 10 lat \(nominalnie, po podatku\)/)).toBeInTheDocument();
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

  it('błąd workera: komunikat o błędzie zamiast wiecznego „liczę dalej”', async () => {
    vi.mocked(pool.runProgressive).mockImplementation((_s, _seed, o) => {
      o.onStage(runBatch(goalScenario, { seed: SIM_SEED, paths: 1000 }), 1000);
      return { cancel: vi.fn(), done: Promise.reject(new Error('worker padł')) };
    });
    wrap(<Dashboard sim={SIM} />);
    expect(await screen.findByText(/Nie udało się policzyć wyniku/)).toBeInTheDocument();
    expect(screen.queryByText(/liczę dalej/)).not.toBeInTheDocument();
  });

  it('podstawa (realnie/nominalnie, po podatku) jest w kafelkach, tytułach kart i opisie wykresu', async () => {
    wrap(<Dashboard sim={SIM} />);
    await ready();
    const basis = 'w dzisiejszych zł, po podatku';
    for (const title of ['Zakres wyników', 'Najgorsze 5% przyszłości: średnio']) {
      expect(screen.getByRole('region', { name: new RegExp(`^${title}.*\\(${basis}\\)`) })).toBeInTheDocument();
    }
    // strata realna jest zawsze realna, więc podstawa to tylko podatek
    expect(screen.getByRole('region', { name: 'Szansa straty realnej (po podatku)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: new RegExp(`Wachlarz możliwych przyszłości.*${basis}`) })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: new RegExp(`Wachlarz.*${basis}`) })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: new RegExp(`Rozkład wartości.*${basis}`) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Realnie/ }));
    await userEvent.click(screen.getByRole('switch', { name: /Po podatku/ }));
    expect(screen.getByRole('region', { name: /^Zakres wyników.*\(nominalnie, przed podatkiem\)/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Wachlarz.*nominalnie, przed podatkiem/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Szansa straty realnej (przed podatkiem)' })).toBeInTheDocument();
  });

  it('tytuł ładowania podaje faktyczną liczbę ścieżek (nie sztywne 10 000)', async () => {
    vi.mocked(pool.runProgressive).mockImplementation(() => ({ cancel: vi.fn(), done: new Promise<RunResult>(() => undefined) }));
    wrap(<Dashboard sim={SIM} />);
    expect(await screen.findByText(/Liczymy 1\s?000 możliwych przyszłości/)).toBeInTheDocument();
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

describe('Dashboard: po podatku a mieszkanie', () => {
  it('przy mieszkaniu pod przełącznikami jest zdanie o podatku od sprzedaży mieszkania; bez mieszkania go nie ma', async () => {
    const st = useScenarioStore.getState();
    st.addPosition({ presetId: 'globalEquity', value: 100_000 });
    const { unmount } = wrap(<Dashboard sim={SIM} />);
    await screen.findByTestId('kpi-median');
    expect(screen.queryByText(/podatek od sprzedaży mieszkania/)).toBeNull();
    unmount();
    st.addPosition({ presetId: 'realEstate', value: 600_000, costBasis: 400_000, targetWeight: 0 });
    wrap(<Dashboard sim={SIM} />);
    await screen.findByTestId('kpi-median');
    expect(screen.getByText(/podatek od sprzedaży mieszkania/)).toBeInTheDocument();
  });
});
