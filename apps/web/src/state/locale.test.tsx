import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateLocale, i18n, numberLocale } from '../i18n';
import { formatMoney, formatPercent, naturalFrequency } from '../lib/format';
import { Settings } from '../features/settings/Settings';
import { initLocale, readLocale, useLocaleStore } from './localeStore';

const n = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

beforeEach(async () => {
  localStorage.clear();
  await activateLocale('pl');
  useLocaleStore.setState({ locale: 'pl' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await activateLocale('pl');
});

describe('wybór języka', () => {
  it('domyślnie polski, także gdy przeglądarka jest angielska (angielski tylko po jawnym wyborze)', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    expect(readLocale()).toBe('pl');
  });

  it('odczyt zapisanego języka; uszkodzona wartość i brak localStorage dają polski', () => {
    localStorage.setItem('ui:locale', 'en');
    expect(readLocale()).toBe('en');
    localStorage.setItem('ui:locale', 'de');
    expect(readLocale()).toBe('pl');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('zablokowane');
    });
    expect(readLocale()).toBe('pl');
  });

  it('setLocale("en"): katalog en, <html lang>, zapis, format en-GB', async () => {
    await act(() => useLocaleStore.getState().setLocale('en'));
    expect(i18n.locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('ui:locale')).toBe('en');
    expect(numberLocale()).toBe('en-GB');
    expect(n(formatMoney(12500, 'PLN'))).toBe('PLN 12,500');
    expect(n(formatMoney(1234567, 'PLN', { sigDigits: 2 }))).toBe('PLN 1.2m');
    expect(n(formatMoney(2.5e9, 'EUR', { sigDigits: 2 }))).toBe('€2.5bn');
    expect(formatPercent(0.123, 1)).toBe('12.3%');
    expect(naturalFrequency(0.8)).toBe('in 8 in 10 futures');
  });

  it('powrót do polskiego przywraca format pl-PL', async () => {
    await act(() => useLocaleStore.getState().setLocale('en'));
    await act(() => useLocaleStore.getState().setLocale('pl'));
    expect(document.documentElement.lang).toBe('pl');
    expect(n(formatMoney(12500, 'PLN'))).toBe('12 500 zł');
    expect(formatPercent(0.123, 1)).toBe('12,3%');
  });

  it('zapis do localStorage, który rzuca wyjątek, nie psuje przełączenia', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('pełny');
    });
    await act(() => useLocaleStore.getState().setLocale('en'));
    expect(i18n.locale).toBe('en');
  });

  it('initLocale ładuje zapisany język przed renderem', async () => {
    localStorage.setItem('ui:locale', 'en');
    await initLocale();
    expect(i18n.locale).toBe('en');
    expect(useLocaleStore.getState().locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('przełącznik języka w Ustawieniach', () => {
  it('zmienia nagłówki i etykiety po wyborze angielskiego i z powrotem', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </I18nProvider>,
    );
    const group = screen.getByRole('radiogroup', { name: 'Język' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wygląd' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(document.documentElement.lang).toBe('en');
    await userEvent.click(screen.getByRole('radio', { name: 'Polski' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Wygląd' })).toBeInTheDocument());
  });
});
