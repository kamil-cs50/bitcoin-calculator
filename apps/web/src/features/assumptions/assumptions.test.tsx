import { I18nProvider } from '@lingui/react';
import { validateScenario } from '@sim/engine';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { i18n } from '../../i18n';
import { ScenarioSchema } from '../../state/scenarioSchema';
import { useScenarioStore } from '../../state/scenarioStore';
import { useUiStore } from '../../state/uiStore';
import { AssumptionsPanel, switchBtcSet } from './AssumptionsPanel';

const st = () => useScenarioStore.getState();
const sc = () => st().scenario;
const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <AssumptionsPanel />
    </I18nProvider>,
  );
const region = (name: string) => screen.getByRole('region', { name });
const row = (reg: HTMLElement, label: RegExp | string) =>
  within(reg).getByRole('textbox', { name: label }).closest('li') as HTMLElement;
const btc = () => sc().assets.find((a) => a.id.startsWith('btc'))!;

beforeEach(() => {
  localStorage.clear();
  st().resetScenario();
  useUiStore.getState().setExpert(false);
  for (const presetId of ['btcBase', 'globalEquity', 'usEquity', 'edo']) {
    st().addPosition({ presetId, value: 10_000 });
  }
});

describe('AssumptionsPanel: wiersze parametrów', () => {
  it('parametr ma wartość, etykietę rodzaju, źródła jako linki z datą dostępu', () => {
    view();
    const r = row(region('ETF na świat'), 'Oczekiwany zwrot roczny');
    expect(within(r).getByRole('textbox')).toHaveValue('6,5');
    expect(within(r).getByText('prognoza instytucji')).toBeInTheDocument();
    const links = within(r).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('jpmorgan.com'));
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(r).getAllByText(/dostęp: 2026-11-13/)).toHaveLength(3);
  });

  it('rodzaje: dane (EDO), prognoza instytucji, założenie (BTC)', () => {
    view();
    expect(within(row(region('Obligacje EDO'), 'Oprocentowanie w pierwszym roku')).getByText('dane')).toBeInTheDocument();
    expect(within(row(region('Bitcoin'), /Oczekiwany zwrot roczny/)).getByText('założenie')).toBeInTheDocument();
  });

  it('parametr bez źródła pokazuje, że jest założeniem bez źródła', () => {
    view();
    expect(within(row(region('Bitcoin'), /Oczekiwany zwrot roczny/)).getByText(/brak źródła/)).toBeInTheDocument();
  });

  it('status weryfikacji ma tekst: zweryfikowane / źródło wtórne / niezweryfikowane', () => {
    view();
    const yes = row(region('ETF na świat'), 'Oczekiwany zwrot roczny');
    expect(within(yes).getByText(/^✅ zweryfikowane$/)).toBeInTheDocument();
    expect(within(yes).queryByText(/niezweryfikowane|źródło wtórne/)).toBeNull();
    const secondary = row(region('S&P 500'), 'Oczekiwany zwrot roczny');
    expect(within(secondary).getByText(/^◐ źródło wtórne$/)).toBeInTheDocument();
    const no = row(region('ETF na świat'), 'Zmienność roczna');
    expect(within(no).getByText(/^❌ niezweryfikowane$/)).toBeInTheDocument();
  });

  it('każdy parametr aktywa ma wiersz: ryzykowne, krypto, EDO, inflacja', () => {
    view();
    const eq = region('ETF na świat');
    for (const l of ['Oczekiwany zwrot roczny', 'Zmienność roczna', /Niepewność oczekiwanego zwrotu/, /Koszt roczny/]) {
      expect(within(eq).getByRole('textbox', { name: l })).toBeInTheDocument();
    }
    const b = region('Bitcoin');
    for (const l of [/Roczne ryzyko upadku/, /Strata przy upadku/, /Czas dojścia zwrotu/, /Docelowa zmienność roczna/]) {
      expect(within(b).getByRole('textbox', { name: l })).toBeInTheDocument();
    }
    const edo = region('Obligacje EDO');
    for (const l of [/Oprocentowanie w pierwszym roku/, /Marża/, /Opłata za wykup/]) {
      expect(within(edo).getByRole('textbox', { name: l })).toBeInTheDocument();
    }
    expect(within(region('Inflacja i kursy walut')).getByRole('textbox', { name: /Inflacja długookresowa/ })).toBeInTheDocument();
  });
});

describe('BTC w dwóch wariantach podatkowych (giełda + ETF)', () => {
  it('zmiana zestawu BTC obejmuje oba aktywa i zachowuje podatek każdego', () => {
    st().addPosition({ presetId: 'btcBase', value: 1000 });
    st().addPosition({ presetId: 'btcBase', value: 2000, etf: true });
    const next = switchBtcSet(sc(), st().dataset, 'btcOptimistic');
    expect(next.assets.filter((a) => a.id.startsWith('btc')).map((a) => [a.id, a.kind === 'risky' ? a.taxForm : ''])).toEqual([
      ['btcOptimistic', 'crypto'],
      ['btcOptimistic#etf', 'security'],
    ]);
    expect(next.positions.map((p) => p.assetId).filter((id) => id.startsWith('btc')).sort()).toEqual(['btcOptimistic', 'btcOptimistic', 'btcOptimistic#etf']);
    expect(validateScenario(next).ok).toBe(true);
  });

  it('panel pokazuje parametry wariantu ETF (z presetu bazowego) i odróżnia tytuły kart', () => {
    st().addPosition({ presetId: 'btcBase', value: 1000 });
    st().addPosition({ presetId: 'btcBase', value: 2000, etf: true });
    view();
    expect(screen.getByRole('region', { name: 'Bitcoin' })).toBeInTheDocument();
    const etf = screen.getByRole('region', { name: 'Bitcoin (ETF/ETP)' });
    expect(within(etf).getByRole('textbox', { name: 'Oczekiwany zwrot roczny' })).toBeInTheDocument();
  });
});

describe('AssumptionsPanel: zmiana i przywracanie', () => {
  it('zmiana wartości zapisuje się w scenariuszu, oznacza wiersz i pozwala przywrócić domyślne', async () => {
    view();
    const reg = region('ETF na świat');
    const r = row(reg, 'Zmienność roczna');
    expect(within(r).queryByText('zmienione przez Ciebie')).toBeNull();
    expect(within(r).queryByRole('button', { name: /Przywróć domyślne/ })).toBeNull();

    const input = within(r).getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '20');
    const asset = () => sc().assets.find((a) => a.id === 'globalEquity');
    expect(asset()).toMatchObject({ sigma: 0.2 });
    expect(within(r).getByText('zmienione przez Ciebie')).toBeInTheDocument();
    expect(ScenarioSchema.safeParse(sc()).success).toBe(true);
    expect(validateScenario(sc()).ok).toBe(true);

    await userEvent.click(within(r).getByRole('button', { name: /Przywróć domyślne/ }));
    expect(asset()).toMatchObject({ sigma: 0.16 });
    expect(within(r).getByRole('textbox')).toHaveValue('16');
    expect(within(r).queryByText('zmienione przez Ciebie')).toBeNull();
  });

  it('wartość poza zakresem (zmienność 200%) pokazuje błąd i nie trafia do scenariusza; pusty wpis niczego nie zmienia', async () => {
    view();
    const r = row(region('ETF na świat'), 'Zmienność roczna');
    const input = within(r).getByRole('textbox');
    await userEvent.clear(input);
    expect(sc().assets.find((a) => a.id === 'globalEquity')).toMatchObject({ sigma: 0.16 });
    await userEvent.type(input, '200');
    expect(within(r).getByRole('alert')).toBeInTheDocument();
    // „20” było jeszcze poprawne i zostało zapisane; „200” już nie.
    expect(sc().assets.find((a) => a.id === 'globalEquity')).toMatchObject({ sigma: 0.2 });
  });
});

describe('AssumptionsPanel: zestaw BTC', () => {
  it('przełącznik pesymistyczny/bazowy/optymistyczny podmienia parametry aktywa i pozycji', async () => {
    view();
    expect(btc()).toMatchObject({ id: 'btcBase', g: 0.15 });
    await userEvent.click(screen.getByRole('radio', { name: 'Pesymistyczny' }));
    expect(btc()).toMatchObject({ id: 'btcPessimistic', g: 0.05, sigma: 0.55 });
    expect(sc().positions.some((p) => p.assetId === 'btcPessimistic')).toBe(true);
    expect(sc().positions.some((p) => p.assetId === 'btcBase')).toBe(false);
    expect(sc().market.factorIds).toContain('btcPessimistic');
    expect(validateScenario(sc()).ok).toBe(true);
    expect(within(row(region('Bitcoin'), /Oczekiwany zwrot roczny/)).getByRole('textbox')).toHaveValue('5');

    await userEvent.click(screen.getByRole('radio', { name: 'Optymistyczny' }));
    expect(btc()).toMatchObject({ id: 'btcOptimistic', g: 0.25 });
    expect(validateScenario(sc()).ok).toBe(true);
  });

  it('bez BTC w portfelu nie ma przełącznika zestawu', () => {
    st().resetScenario();
    view();
    expect(screen.queryByRole('radio', { name: 'Pesymistyczny' })).toBeNull();
  });
});

describe('AssumptionsPanel: niepewność i tryb eksperta', () => {
  it('suwak „Jak pewny jesteś oczekiwanego zwrotu?” ustawia uncertaintyScale w zakresie 0–2', () => {
    view();
    const slider = screen.getByRole('slider', { name: 'Jak pewny jesteś oczekiwanego zwrotu?' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '2');
    expect(slider).toHaveValue('1');
    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(sc().market.uncertaintyScale).toBe(1.5);
    fireEvent.change(slider, { target: { value: '0' } });
    expect(sc().market.uncertaintyScale).toBe(0);
    fireEvent.change(slider, { target: { value: '7' } });
    expect(sc().market.uncertaintyScale).toBe(2);
  });

  it('poza trybem eksperta: brak nakładki potęgowej, modelu, ν, α i b', () => {
    view();
    expect(screen.queryByText(/model kontrowersyjny/)).toBeNull();
    expect(screen.queryByRole('switch', { name: /Nakładka potęgowa/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model rynku' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Liczba stopni swobody/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Wrażliwość na kryzysy' })).toBeNull();
  });

  it('tryb eksperta odsłania model, ν, α i b oraz nakładkę potęgową', async () => {
    useUiStore.getState().setExpert(true);
    view();
    const model = screen.getByRole('combobox', { name: 'Model rynku' });
    expect(model).toHaveValue('realistic');
    await userEvent.selectOptions(model, 'gbm');
    expect(sc().market.mode).toBe('gbm');
    await userEvent.selectOptions(model, 'realistic');

    const nu = screen.getByRole('textbox', { name: /Liczba stopni swobody/ });
    expect(nu).toHaveValue('5');
    expect(within(nu.closest('li')!).getByText(/^❌ niezweryfikowane$/)).toBeInTheDocument();
    await userEvent.clear(nu);
    await userEvent.type(nu, '8');
    expect(sc().market.nu).toBe(8);

    const crisis = region('Wrażliwość na kryzysy');
    expect(within(crisis).getByRole('textbox', { name: /^α .*Bitcoin/ })).toBeInTheDocument();
    const b = within(crisis).getByRole('textbox', { name: /^b .*ETF na świat/ });
    await userEvent.clear(b);
    await userEvent.type(b, '0,5');
    expect(sc().assets.find((a) => a.id === 'globalEquity')).toMatchObject({ b: 0.5 });

    const overlay = screen.getByRole('switch', { name: /Nakładka potęgowa/ });
    expect(overlay).not.toBeChecked();
    expect(screen.getByText(/model kontrowersyjny/)).toBeInTheDocument();
  });

  it('nakładka potęgowa: ostrzeżenie przed włączeniem, brak wartości domyślnych, zapis do BTC, wyłączenie', async () => {
    useUiStore.getState().setExpert(true);
    view();
    expect(screen.getByText(/regresja ceny na czasie jest podatna na regresję pozorną/)).toBeInTheDocument();
    expect(screen.getByText(/nie ma podstaw ekonomicznych/)).toBeInTheDocument();
    const btcOf = () => sc().assets.find((a) => a.id === 'btcBase');
    expect(btcOf()).toBeDefined();
    expect(btcOf()).not.toHaveProperty('powerLaw');
    await userEvent.click(screen.getByRole('switch', { name: /Nakładka potęgowa/ }));
    const a = screen.getByRole('textbox', { name: /Parametr a/ });
    const b = screen.getByRole('textbox', { name: /Parametr b/ });
    expect(a).toHaveValue('');
    expect(b).toHaveValue('');
    expect(btcOf()).not.toHaveProperty('powerLaw');
    await userEvent.type(a, '-17');
    expect(btcOf()).not.toHaveProperty('powerLaw');
    await userEvent.type(b, '5,8');
    expect(btcOf()).toMatchObject({ powerLaw: { a: -17, b: 5.8, genesis: '2009-01-03' } });
    await userEvent.click(screen.getByRole('switch', { name: /Nakładka potęgowa/ }));
    expect(btcOf()).not.toHaveProperty('powerLaw');
  });
});

describe('PowerLawCard: spójność z silnikiem', () => {
  it('gdy nakładka zniknie ze scenariusza (np. import, zmiana aktywów), karta nie pokazuje jej jako włączonej', async () => {
    useUiStore.getState().setExpert(true);
    view();
    await userEvent.click(screen.getByRole('switch', { name: /Nakładka potęgowa/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Parametr a/ }), '-17');
    await userEvent.type(screen.getByRole('textbox', { name: /Parametr b/ }), '5,8');
    expect(screen.getByRole('switch', { name: /Nakładka potęgowa/ })).toBeChecked();
    act(() => {
      const s = sc();
      st().setScenario({ ...s, assets: s.assets.map((x) => (x.kind === 'risky' ? { ...x, powerLaw: undefined } : x)) });
    });
    expect(screen.getByRole('switch', { name: /Nakładka potęgowa/ })).not.toBeChecked();
    expect(screen.queryByRole('textbox', { name: /Parametr a/ })).toBeNull();
  });

  it('czyszczenie jednego pola w trakcie pisania nie wyłącza karty ani nie kasuje drugiego pola', async () => {
    useUiStore.getState().setExpert(true);
    view();
    await userEvent.click(screen.getByRole('switch', { name: /Nakładka potęgowa/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Parametr a/ }), '-17');
    await userEvent.type(screen.getByRole('textbox', { name: /Parametr b/ }), '5,8');
    await userEvent.clear(screen.getByRole('textbox', { name: /Parametr a/ }));
    expect(screen.getByRole('switch', { name: /Nakładka potęgowa/ })).toBeChecked();
    expect(screen.getByRole('textbox', { name: /Parametr b/ })).toHaveValue('5,8');
  });

  it('opis mówi, że parametr a nie wpływa na dryf', () => {
    useUiStore.getState().setExpert(true);
    view();
    expect(screen.getByText(/parametr a nie wpływa na dryf/i)).toBeInTheDocument();
  });
});

describe('AssumptionsPanel: przepisy podatkowe i limity ze statusem', () => {
  it('karta „Podatki i limity (Polska)”: limity IKE/IKZE ◐, stawki i ryczałt ❌, zasady wypłat z IKE/IKZE ❌', () => {
    view();
    const reg = region('Podatki i limity (Polska)');
    const li = (label: RegExp) => within(reg).getByText(label).closest('li') as HTMLElement;
    expect(within(li(/Limit wpłat na IKE w 2026/)).getByText(/^◐ źródło wtórne$/)).toBeInTheDocument();
    expect(within(li(/Limit wpłat na IKZE w 2027/)).getByText(/^◐ źródło wtórne$/)).toBeInTheDocument();
    expect(within(li(/Podatek od zysków kapitałowych/)).getByText(/^❌ niezweryfikowane$/)).toBeInTheDocument();
    expect(within(li(/Ryczałt od najmu do progu/)).getByText(/^❌ niezweryfikowane$/)).toBeInTheDocument();
    expect(within(li(/Zwolnienie sprzedaży mieszkania/)).getByText(/^❌ niezweryfikowane$/)).toBeInTheDocument();
    expect(within(li(/Zasady wypłat z IKE i IKZE/)).getByText(/^❌ niezweryfikowane$/)).toBeInTheDocument();
    expect(within(reg).getByText(/Traktuj wyniki po podatku jako orientacyjne/)).toBeInTheDocument();
  });
});

describe('trasa /zalozenia', () => {
  it('renderuje panel Założenia i źródła', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/zalozenia'] });
    render(
      <I18nProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Założenia i źródła' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ETF na świat' })).toBeInTheDocument();
  });
});
