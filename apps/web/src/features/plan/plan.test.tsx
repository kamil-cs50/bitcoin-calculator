import { I18nProvider } from '@lingui/react';
import { validateScenario } from '@sim/engine';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { ScenarioSchema } from '../../state/scenarioSchema';
import { useScenarioStore } from '../../state/scenarioStore';
import { estimateRealReturn } from './estimate';
import { PlanEditor } from './PlanEditor';

vi.mock('./estimate', () => ({ estimateRealReturn: vi.fn() }));
const estimate = vi.mocked(estimateRealReturn);

const sc = () => useScenarioStore.getState().scenario;
const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <PlanEditor />
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  useScenarioStore.getState().resetScenario();
  estimate.mockReset();
  estimate.mockResolvedValue(0.037);
});

describe('PlanEditor: wpłaty', () => {
  it('wpłata 1 500 zł z indeksacją inflacją daje contribution {monthly, cpi}', async () => {
    view();
    await userEvent.type(screen.getByRole('textbox', { name: /Wpłata miesięczna/ }), '1500');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Indeksacja wpłat/ }), 'cpi');
    expect(sc().contribution).toMatchObject({ monthly: 1500, indexation: 'cpi', endMonth: 240 });
    expect(ScenarioSchema.safeParse(sc()).success).toBe(true);
    expect(validateScenario(sc()).ok).toBe(true);
  });

  it('wyczyszczenie kwoty usuwa wpłaty; wpis 0 nie gubi pola', async () => {
    view();
    const input = screen.getByRole('textbox', { name: /Wpłata miesięczna/ });
    await userEvent.type(input, '10');
    expect(sc().contribution?.monthly).toBe(10);
    await userEvent.type(input, '{Backspace}{Backspace}0');
    expect(sc().contribution).toBeUndefined();
    expect(input).toHaveValue('0');
  });

  it('koniec wpłat nie wychodzi poza horyzont i podąża za jego zmianą', async () => {
    view();
    await userEvent.type(screen.getByRole('textbox', { name: /Wpłata miesięczna/ }), '500');
    const years = screen.getByRole('textbox', { name: /Horyzont/ });
    await userEvent.clear(years);
    await userEvent.type(years, '30');
    expect(sc().horizonMonths).toBe(360);
    expect(sc().contribution?.endMonth).toBe(360);
  });
});

describe('PlanEditor: horyzont', () => {
  it('„do wieku 65” przy wieku 35 daje 360 miesięcy', async () => {
    view();
    await userEvent.click(screen.getByRole('radio', { name: /Do wieku/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Mój wiek/ }), '35');
    await userEvent.type(screen.getByRole('textbox', { name: /Wiek docelowy/ }), '65');
    expect(sc().horizonMonths).toBe(360);
  });

  it('horyzont > 80 lat pokazuje błąd pola i nie trafia do scenariusza', async () => {
    view();
    const years = screen.getByRole('textbox', { name: /Horyzont/ });
    await userEvent.clear(years);
    await userEvent.type(years, '81');
    expect(screen.getByText(/od 1 miesiąca do 80 lat/)).toBeInTheDocument();
    expect(years).toBeInvalid();
    expect(validateScenario(sc()).ok).toBe(true);
    expect(sc().horizonMonths).not.toBe(972);
    await userEvent.clear(years);
    await userEvent.type(years, '80');
    expect(sc().horizonMonths).toBe(960);
    expect(screen.queryByText(/od 1 miesiąca do 80 lat/)).toBeNull();
  });
});

describe('PlanEditor: wypłaty', () => {
  it('oferuje trzy strategie z opisami w prostym języku', () => {
    view();
    expect(screen.getByRole('radio', { name: /Brak wypłat/ })).toBeChecked();
    for (const name of [/Stała kwota/, /Stały procent portfela/, /Amortyzacja/]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/co miesiąc tyle samo w dzisiejszych pieniądzach/)).toBeInTheDocument();
    expect(screen.getByText(/stały ułamek tego, co zostało/)).toBeInTheDocument();
    expect(screen.getByText(/rozkłada majątek równo na pozostałe lata/)).toBeInTheDocument();
  });

  it('stała kwota: 4 000 zł od 20. roku; po wyborze „brak” wypłata znika', async () => {
    view();
    await userEvent.click(screen.getByRole('radio', { name: /Stała kwota/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota miesięczna/ }), '4000');
    await userEvent.type(screen.getByRole('textbox', { name: /Wypłacaj od roku/ }), '20');
    expect(sc().withdrawal).toEqual({ kind: 'fixedReal', startMonth: 240, monthly: 4000 });
    await userEvent.click(screen.getByRole('radio', { name: /Brak wypłat/ }));
    expect(sc().withdrawal).toBeUndefined();
  });

  it('stały procent: 4% rocznie', async () => {
    view();
    await userEvent.click(screen.getByRole('radio', { name: /Stały procent portfela/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Procent rocznie/ }), '4');
    expect(sc().withdrawal).toMatchObject({ kind: 'percent', rate: 0.04 });
  });

  it('wybór ABW ustawia expectedRealReturn z estimateRealReturn', async () => {
    useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 100_000 });
    view();
    await userEvent.click(screen.getByRole('radio', { name: /Amortyzacja/ }));
    await waitFor(() => expect(sc().withdrawal).toMatchObject({ kind: 'abw', expectedRealReturn: 0.037 }));
    expect(estimate).toHaveBeenCalled();
    expect(validateScenario(sc()).ok).toBe(true);
    await userEvent.type(screen.getByRole('textbox', { name: /Podłoga/ }), '2000');
    expect(sc().withdrawal).toMatchObject({ kind: 'abw', floor: 2000, expectedRealReturn: 0.037 });
  });

  it('wypłaty zaczynające się po horyzoncie: ostrzeżenie przy polu', async () => {
    view();
    await userEvent.click(screen.getByRole('radio', { name: /Stała kwota/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota miesięczna/ }), '4000');
    await userEvent.type(screen.getByRole('textbox', { name: /Wypłacaj od roku/ }), '25');
    expect(screen.getByText(/po końcu horyzontu/)).toBeInTheDocument();
    expect(validateScenario(sc()).ok).toBe(true);
  });
});

describe('PlanEditor: cel', () => {
  it('1 mln zł w dzisiejszych pieniądzach za 20 lat', async () => {
    view();
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota celu/ }), '1000000');
    await userEvent.type(screen.getByRole('textbox', { name: /Cel za ile lat/ }), '20');
    expect(sc().goal).toEqual({ amountReal: 1_000_000, month: 240 });
  });

  it('cel bez podanych lat przypada na koniec horyzontu; cel poza horyzontem to błąd', async () => {
    view();
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota celu/ }), '500000');
    expect(sc().goal).toEqual({ amountReal: 500_000, month: 240 });
    await userEvent.type(screen.getByRole('textbox', { name: /Cel za ile lat/ }), '25');
    expect(screen.getByText(/Cel musi przypadać w horyzoncie/)).toBeInTheDocument();
    expect(sc().goal).toBeUndefined();
  });
});

describe('estimateRealReturn (prawdziwy silnik)', () => {
  it('portfel akcyjny: skończona mediana realnego CAGR w rozsądnym zakresie; pusty portfel: 0', async () => {
    const actual = await vi.importActual<typeof import('./estimate')>('./estimate');
    expect(await actual.estimateRealReturn(sc())).toBe(0);
    useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 100_000 });
    const r = await actual.estimateRealReturn(sc());
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(-0.02);
    expect(r).toBeLessThan(0.12);
    expect(await actual.estimateRealReturn(sc())).toBe(r); // stałe ziarno
  });
});
