import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { useScenarioStore } from '../../state/scenarioStore';
import { PortfolioEditor } from './PortfolioEditor';
import { validateScenario } from '@sim/engine';
import { ScenarioSchema } from '../../state/scenarioSchema';
import { fetchCryptoPrice, fetchNbpRate, ALLOWED_HOSTS } from './prices';

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
