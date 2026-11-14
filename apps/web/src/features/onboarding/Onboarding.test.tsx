import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { useScenarioStore } from '../../state/scenarioStore';
import { Onboarding } from './Onboarding';

function view() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Onboarding /> },
      { path: '/wynik', element: <h1>Strona wyniku</h1> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return router;
}

const pos = () => useScenarioStore.getState().scenario.positions;
const asset = (id: string) => useScenarioStore.getState().scenario.assets.find((a) => a.id === id);

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  useScenarioStore.getState().resetScenario();
  fetchSpy = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe('Onboarding krok 1', () => {
  it('pokazuje kafelki aktywów', () => {
    view();
    for (const name of [
      'Bitcoin',
      'ETF na świat',
      'S&P 500',
      'Obligacje EDO',
      'Lokata',
      'Złoto',
      'Mieszkanie',
      'Własne',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('dodanie ETF na świat 50 000 zł daje pozycję globalEquity', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'ETF na świat' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '50000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(pos()).toHaveLength(1);
    expect(pos()[0]).toMatchObject({ assetId: 'globalEquity', value: 50_000 });
  });

  it('BTC w jednostkach: 0,35 BTC x cena ręczna 300 000 zł = 105 000 zł', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Liczba BTC/ }), '0,35');
    await userEvent.type(screen.getByRole('textbox', { name: /Cena 1 BTC/ }), '300000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(pos()[0]).toMatchObject({ assetId: 'btcBase', value: 105_000 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offline: pole ceny jest widoczne, wymagane i opisane; Dalej nieaktywne do wpisania ceny', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Liczba BTC/ }), '0,35');
    const price = screen.getByRole('textbox', { name: /Cena 1 BTC/ });
    expect(price).toBeVisible();
    expect(price).toBeRequired();
    expect(price).toHaveAccessibleDescription(/ręcznie/);
    expect(screen.getByRole('button', { name: 'Dodaj do portfela' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dalej' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Pobierz cenę' }));
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Nie udało się pobrać ceny/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Cena 1 BTC/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dodaj do portfela' })).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox', { name: /Cena 1 BTC/ }), '300000');
    expect(screen.getByRole('button', { name: 'Dodaj do portfela' })).toBeEnabled();
  });

  it('udane pobranie wstawia cenę i pokazuje atrybucję CoinGecko', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ bitcoin: { pln: 310000 } })));
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    expect(screen.queryByText(/Powered by CoinGecko/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pobierz cenę' }));
    expect(await screen.findByText(/Powered by CoinGecko/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Cena 1 BTC/ })).toHaveValue('310000');
  });

  it('bez kliknięcia „Pobierz cenę” nie ma żadnego fetch', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Liczba BTC/ }), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Złoto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('BTC: giełda/portfel = crypto, ETF/ETP = security; złoto: fizyczne albo ETF', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    await userEvent.click(screen.getByRole('radio', { name: /ETF\/ETP/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Kwotę w zł/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(asset('btcBase')).toMatchObject({ taxForm: 'security' });

    await userEvent.click(screen.getByRole('button', { name: 'Złoto' }));
    expect(screen.getByRole('radio', { name: /Fizyczne/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /^ETF/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '2000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(asset('gold')).toMatchObject({ taxForm: 'security' });
  });

  it('domyślnie BTC „na giełdzie/w portfelu” daje taxForm crypto', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    expect(screen.getByRole('radio', { name: /Giełda/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Kwotę w zł/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(asset('btcBase')).toMatchObject({ taxForm: 'crypto' });
  });

  it('mieszkanie: tylko wariant „mieszkam”, nie dodaje pozycji', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Mieszkanie' }));
    expect(screen.getByText(/poza symulacją/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rozumiem' }));
    expect(pos()).toHaveLength(0);
  });
});

describe('Onboarding trzy kroki', () => {
  it('kończy się na trasie /wynik i zapisuje plan', async () => {
    const router = view();
    expect(screen.getByRole('button', { name: 'Dalej' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Lokata' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '20000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dalej' }));

    await userEvent.type(screen.getByRole('textbox', { name: /Wpłata miesięczna/ }), '1000');
    const years = screen.getByRole('textbox', { name: /Horyzont/ });
    await userEvent.clear(years);
    await userEvent.type(years, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Dalej' }));

    expect(screen.getByRole('heading', { name: /Gotowe/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pokaż wynik' }));
    expect(router.state.location.pathname).toBe('/wynik');
    const s = useScenarioStore.getState().scenario;
    expect(s.horizonMonths).toBe(180);
    expect(s.contribution).toMatchObject({ monthly: 1000 });
  });
});

describe('Onboarding krok 2: plan', () => {
  const sc = () => useScenarioStore.getState().scenario;
  const toStep2 = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Dalej' }));
  };
  beforeEach(() => {
    useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 100_000 });
  });

  it('wypłata bez roku startu zaczyna się od początku, a nie na końcu horyzontu (wtedy nic by nie robiła)', async () => {
    view();
    await toStep2();
    await userEvent.type(screen.getByRole('textbox', { name: /Wypłata miesięczna/ }), '2000');
    await userEvent.click(screen.getByRole('button', { name: 'Dalej' }));
    expect(sc().withdrawal).toEqual({ kind: 'fixedReal', startMonth: 0, monthly: 2000 });
  });

  it('„Wypłacaj od roku” wyznacza start; start poza horyzontem pokazuje błąd i blokuje Dalej', async () => {
    view();
    await toStep2();
    await userEvent.type(screen.getByRole('textbox', { name: /Wypłata miesięczna/ }), '2000');
    const from = screen.getByRole('textbox', { name: /Wypłacaj od roku/ });
    await userEvent.type(from, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Dalej' }));
    expect(sc().withdrawal).toMatchObject({ startMonth: 120 });
    await userEvent.click(screen.getByRole('button', { name: 'Wstecz' }));
    const from2 = screen.getByRole('textbox', { name: /Wypłacaj od roku/ });
    await userEvent.clear(from2);
    await userEvent.type(from2, '20');
    expect(screen.getByText(/przed końcem horyzontu/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dalej' })).toBeDisabled();
  });

  it('powrót na stronę główną nie kasuje wpłat, wypłat i celu ustawionych w edytorze planu', async () => {
    useScenarioStore.setState({
      scenario: {
        ...sc(),
        horizonMonths: 300,
        contribution: { monthly: 1500, endMonth: 120, indexation: 'cpi', realGrowth: 0 },
        withdrawal: { kind: 'percent', startMonth: 240, rate: 0.04 },
        goal: { amountReal: 900_000, month: 200 },
      },
    });
    view();
    await toStep2();
    expect(screen.getByRole('textbox', { name: /Wpłata miesięczna/ })).toHaveValue('1500');
    expect(screen.getByRole('textbox', { name: /Cel/ })).toHaveValue('900000');
    await userEvent.click(screen.getByRole('button', { name: 'Dalej' }));
    expect(sc().contribution).toEqual({ monthly: 1500, endMonth: 120, indexation: 'cpi', realGrowth: 0 });
    expect(sc().withdrawal).toEqual({ kind: 'percent', startMonth: 240, rate: 0.04 });
    expect(sc().goal).toEqual({ amountReal: 900_000, month: 200 });
  });
});
