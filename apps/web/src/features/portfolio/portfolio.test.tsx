import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { useScenarioStore } from '../../state/scenarioStore';
import { PortfolioEditor } from './PortfolioEditor';
import { validateScenario } from '@sim/engine';
import { ScenarioSchema } from '../../state/scenarioSchema';
import { fetchCryptoPrice, fetchCryptoQuote, fetchNbpRate, ALLOWED_HOSTS } from './prices';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  localStorage.clear();
  useScenarioStore.getState().resetScenario();
});
afterEach(() => vi.unstubAllGlobals());

describe('prices.ts', () => {
  it('fetchNbpRate: tylko api.nbp.pl, zwraca kurs średni i zapisuje cache 24 h', async () => {
    const f = vi.fn().mockResolvedValue(json({ rates: [{ mid: 4.05 }] }));
    vi.stubGlobal('fetch', f);
    expect(await fetchNbpRate('USD')).toBe(4.05);
    expect(new URL(String(f.mock.calls[0]![0])).origin).toBe('https://api.nbp.pl');
    // drugi raz z cache: bez sieci
    expect(await fetchNbpRate('USD')).toBe(4.05);
    expect(f).toHaveBeenCalledOnce();
  });

  it('fetchCryptoPrice: tylko api.coingecko.com; cache wygasa po 24 h', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(json({ bitcoin: { pln: 300000 } })));
    vi.stubGlobal('fetch', f);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
      expect(await fetchCryptoPrice('bitcoin', 'pln')).toBe(300000);
      expect(new URL(String(f.mock.calls[0]![0])).origin).toBe('https://api.coingecko.com');
      vi.setSystemTime(new Date('2026-11-15T09:00:00Z'));
      await fetchCryptoPrice('bitcoin', 'pln');
      expect(f).toHaveBeenCalledOnce();
      vi.setSystemTime(new Date('2026-11-15T10:00:01Z'));
      await fetchCryptoPrice('bitcoin', 'pln');
      expect(f).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetchCryptoQuote: zwraca też czas pobrania (z cache: oryginalny, nie „teraz”)', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(json({ bitcoin: { pln: 300000 } })));
    vi.stubGlobal('fetch', f);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t0 = new Date('2026-11-14T10:00:00Z').getTime();
      vi.setSystemTime(t0);
      expect(await fetchCryptoQuote('bitcoin', 'pln')).toEqual({ price: 300000, fetchedAt: t0 });
      vi.setSystemTime(t0 + 5 * 3600_000);
      expect(await fetchCryptoQuote('bitcoin', 'pln')).toEqual({ price: 300000, fetchedAt: t0 });
      expect(f).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dozwolone hosty to wyłącznie NBP i CoinGecko', () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(['https://api.coingecko.com', 'https://api.nbp.pl']);
  });

  it('odrzuca odpowiedź bez poprawnej ceny i błąd HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ bitcoin: { pln: 'x' } })));
    await expect(fetchCryptoPrice('bitcoin', 'pln')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(fetchNbpRate('EUR')).rejects.toThrow();
  });

  it('działa mimo niedostępnego localStorage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ rates: [{ mid: 4.3 }] })));
    expect(await fetchNbpRate('EUR')).toBe(4.3);
  });
});

describe('PortfolioEditor', () => {
  const view = () =>
    render(
      <I18nProvider i18n={i18n}>
        <PortfolioEditor />
      </I18nProvider>,
    );

  it('pokazuje pozycje, zmienia wartość i usuwa', async () => {
    useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 50_000 });
    view();
    const tile = screen.getByRole('group', { name: /ETF na świat/ });
    const input = within(tile).getByRole('textbox', { name: /Wartość/ });
    await userEvent.clear(input);
    await userEvent.type(input, '60000');
    expect(useScenarioStore.getState().scenario.positions[0]!.value).toBe(60_000);
    await userEvent.click(within(tile).getByRole('button', { name: /Usuń/ }));
    expect(useScenarioStore.getState().scenario.positions).toHaveLength(0);
  });

  it('dodaje ETF na świat 50 000 zł przez formularz', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'ETF na świat' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '50000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(useScenarioStore.getState().scenario.positions[0]).toMatchObject({
      assetId: 'globalEquity',
      value: 50_000,
    });
  });

  describe('opakowania IKE/IKZE', () => {
    const addEtf = () => useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 50_000 });
    const pickWrapper = async (w: 'IKE' | 'IKZE') => {
      const tile = screen.getByRole('group', { name: /ETF na świat/ });
      await userEvent.selectOptions(within(tile).getByRole('combobox', { name: /Konto/ }), w);
    };

    it('wybór IKE bez znanego wieku NIE zgaduje wieku: prosi o wiek i dopiero po jego podaniu włącza limity', async () => {
      addEtf();
      expect(useScenarioStore.getState().scenario.wrappers).toBeUndefined();
      view();
      expect(screen.queryByRole('textbox', { name: /Twój wiek/ })).toBeNull();
      await pickWrapper('IKE');
      let sc = useScenarioStore.getState().scenario;
      expect(sc.positions[0]!.wrapper).toBe('taxable');
      expect(sc.wrappers).toBeUndefined();
      expect(screen.getByText(/nie zakładamy go za Ciebie/)).toBeInTheDocument();
      const confirm = screen.getByRole('button', { name: 'Wybierz IKE' });
      expect(confirm).toBeDisabled();
      await userEvent.type(screen.getByRole('textbox', { name: /Twój wiek/ }), '62');
      await userEvent.click(confirm);
      sc = useScenarioStore.getState().scenario;
      expect(sc.positions[0]!.wrapper).toBe('IKE');
      expect(sc.wrappers).toMatchObject({ ikeLimit: 28_260, ikzeLimit: 11_304, ikzeTaxRate: 0.12, age: 62 });
      expect(sc.person).toEqual({ age: 62 });
      expect(screen.queryByText(/nie zakładamy go za Ciebie/)).toBeNull();
      expect(screen.getByRole('textbox', { name: /Twój wiek/ })).toHaveValue('62');
      expect(ScenarioSchema.safeParse(sc).success).toBe(true);
      expect(validateScenario(sc).ok).toBe(true);
    });

    it('z wiekiem już podanym (np. w planie) wybór IKZE działa od razu, z tym wiekiem', async () => {
      addEtf();
      useScenarioStore.getState().setAge(41);
      view();
      await pickWrapper('IKZE');
      const sc = useScenarioStore.getState().scenario;
      expect(sc.positions[0]!.wrapper).toBe('IKZE');
      expect(sc.wrappers!.age).toBe(41);
    });

    it('anulowanie prośby o wiek zostawia konto zwykłe', async () => {
      addEtf();
      view();
      await pickWrapper('IKZE');
      await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
      expect(screen.queryByRole('button', { name: 'Wybierz IKZE' })).toBeNull();
      expect(useScenarioStore.getState().scenario.positions[0]!.wrapper).toBe('taxable');
    });

    it('ostrzega w miejscu użycia: przepisy niezweryfikowane (pole wieku i kafelek pozycji)', async () => {
      addEtf();
      useScenarioStore.getState().setAge(41);
      view();
      await pickWrapper('IKE');
      const tile = screen.getByRole('group', { name: /ETF na świat/ });
      expect(within(tile).getByText(/niezweryfikowane w ISAP/)).toBeInTheDocument();
      expect(screen.getAllByText(/wymóg 5 lat wpłat pominięty/).length).toBeGreaterThanOrEqual(2); // pole wieku i kafelek
      expect(screen.getAllByText(/niezweryfikowane w ISAP/).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mieszkanie na wynajem: rok zakupu, cena zakupu, rok sprzedaży', () => {
    const openRental = async () => {
      view();
      await userEvent.click(screen.getByRole('button', { name: 'Mieszkanie na wynajem' }));
    };

    it('formularz zapisuje rok zakupu, cenę zakupu (podstawa zysku) i rok sprzedaży', async () => {
      await openRental();
      await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '600000');
      await userEvent.type(screen.getByRole('textbox', { name: /Rok zakupu/ }), '2021');
      await userEvent.type(screen.getByRole('textbox', { name: /Cena zakupu/ }), '400000');
      await userEvent.type(screen.getByRole('textbox', { name: /Rok sprzedaży/ }), '2040');
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
      const s = useScenarioStore.getState().scenario;
      expect(s.assets[0]).toMatchObject({ kind: 'realEstate', purchaseYear: 2021, saleYear: 2040 });
      expect(s.positions[0]).toMatchObject({ value: 600_000, costBasis: 400_000, targetWeight: 0 });
      expect(ScenarioSchema.safeParse(s).success).toBe(true);
      expect(validateScenario(s).ok).toBe(true);
    });

    it('bez roku zakupu: jawny komunikat, że nie zakładamy zwolnienia z podatku; pozycja i tak się dodaje', async () => {
      await openRental();
      expect(screen.getByText(/Bez roku zakupu nie zakładamy zwolnienia/)).toBeInTheDocument();
      expect(screen.getByText(/Przepisy cytowane z pamięci, niezweryfikowane w ISAP/)).toBeInTheDocument();
      await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '600000');
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
      const s = useScenarioStore.getState().scenario;
      expect(s.assets[0]).not.toHaveProperty('purchaseYear');
      expect(s.positions[0]).toMatchObject({ costBasis: 600_000 });
    });

    it('niepoprawne lata blokują dodanie z komunikatem (zakup w przyszłości, sprzedaż przed zakupem)', async () => {
      await openRental();
      const start = useScenarioStore.getState().scenario.startYear;
      await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '600000');
      await userEvent.type(screen.getByRole('textbox', { name: /Rok zakupu/ }), String(start + 3));
      expect(screen.getByText(new RegExp(`Rok zakupu: od 1900 do ${start}`))).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dodaj do portfela' })).toBeDisabled();
    });

    it('kafelek pozycji pozwala poprawić lata i cenę zakupu po dodaniu', async () => {
      useScenarioStore.getState().addPosition({ presetId: 'realEstate', value: 600_000, targetWeight: 0 });
      view();
      const tile = screen.getByRole('group', { name: /Mieszkanie na wynajem/ });
      await userEvent.type(within(tile).getByRole('textbox', { name: /Rok zakupu/ }), '2019');
      await userEvent.type(within(tile).getByRole('textbox', { name: /Rok sprzedaży/ }), '2038');
      const price = within(tile).getByRole('textbox', { name: /Cena zakupu/ });
      await userEvent.clear(price);
      await userEvent.type(price, '350000');
      const s = useScenarioStore.getState().scenario;
      expect(s.assets[0]).toMatchObject({ purchaseYear: 2019, saleYear: 2038 });
      expect(s.positions[0]!.costBasis).toBe(350_000);
      expect(within(tile).getByText(/niezweryfikowane w ISAP/)).toBeInTheDocument();
    });
  });

  describe('wiek pobranej ceny', () => {
    const openBtc = async () => {
      view();
      await userEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
      await userEvent.click(screen.getByRole('button', { name: 'Pobierz cenę' }));
    };

    it('świeżo pobrana cena: „przed chwilą”, bez twierdzenia o „ostatniej minucie”', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json({ bitcoin: { pln: 300000 } }))));
      await openBtc();
      const status = await screen.findByText(/Powered by CoinGecko/);
      expect(status).toHaveTextContent('Cena z CoinGecko, pobrana przed chwilą');
      expect(status).not.toHaveTextContent('ostatniej minuty');
    });

    it('cena z cache sprzed 5 godzin pokazuje swój wiek', async () => {
      localStorage.setItem('price-cache:cg:bitcoin:pln', JSON.stringify({ v: 280000, t: Date.now() - 5 * 3600_000 - 60_000 }));
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('nie powinno być sieci')));
      await openBtc();
      expect(await screen.findByText(/Powered by CoinGecko/)).toHaveTextContent('pobrana 5 godz. temu');
    });
  });

  it('nazwa aktywa własnego: bez „~” (rozdzielacz w identyfikatorach), spacje zwinięte, długość ograniczona', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Własne' }));
    const name = screen.getByRole('textbox', { name: 'Nazwa' });
    expect(name).toHaveAttribute('maxlength', '40');
    await userEvent.type(name, '  Fun~dusz   X ');
    await userEvent.type(screen.getByRole('textbox', { name: /Oczekiwany roczny wzrost/ }), '5');
    await userEvent.type(screen.getByRole('textbox', { name: /Roczna zmienność/ }), '12');
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '10000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    expect(useScenarioStore.getState().scenario.positions[0]!.assetId).toBe('custom:Fun-dusz X');
  });

  it('aktywo własne daje poprawny scenariusz (schemat i walidacja silnika)', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Własne' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nazwa' }), 'Fundusz X');
    await userEvent.type(screen.getByRole('textbox', { name: /Oczekiwany roczny wzrost/ }), '5');
    await userEvent.type(screen.getByRole('textbox', { name: /Roczna zmienność/ }), '12');
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '10000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    const s = useScenarioStore.getState().scenario;
    expect(s.positions[0]).toMatchObject({ assetId: 'custom:Fundusz X', value: 10_000 });
    expect(s.assets[0]).toMatchObject({ g: 0.05, sigma: 0.12 });
    expect(ScenarioSchema.safeParse(s).success).toBe(true);
    expect(validateScenario(s).ok).toBe(true);
  });
  it('kafelek „Mieszkanie na wynajem” dodaje niepłynną nieruchomość (poprawny scenariusz), obok wariantu „mieszkam”', async () => {
    view();
    expect(screen.getByRole('button', { name: 'Mieszkanie' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mieszkanie na wynajem' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Kwota/ }), '600000');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj do portfela' }));
    const s = useScenarioStore.getState().scenario;
    expect(s.positions[0]).toMatchObject({ assetId: 'realEstate', value: 600_000, targetWeight: 0, wrapper: 'taxable' });
    expect(s.assets[0]).toMatchObject({ kind: 'realEstate', netRentYield: 0.035 });
    expect((s.assets[0] as { realGrowth: number }).realGrowth).toBeCloseTo(0.01, 12);
    expect(s.market.factorIds).toContain('realEstate');
    expect(ScenarioSchema.safeParse(s).success).toBe(true);
    expect(validateScenario(s).ok).toBe(true);
  });
});
