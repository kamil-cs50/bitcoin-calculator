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
});
