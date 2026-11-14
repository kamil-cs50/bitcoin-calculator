import { i18n } from '@lingui/core';
import { messages as pl } from './locales/pl.po';

export type Locale = 'pl' | 'en';
export const LOCALES: readonly Locale[] = ['pl', 'en'];

// Polski (źródło) jest w głównym chunku; angielski ładujemy leniwie, dopiero po wyborze.
i18n.load('pl', pl);
i18n.activate('pl');

const loaded = new Set<Locale>(['pl']);
let latest: Locale = 'pl';

/** Ładuje katalog (jeśli trzeba), aktywuje język i ustawia `<html lang>`. Wygrywa ostatnie wywołanie. */
export async function activateLocale(locale: Locale): Promise<void> {
  latest = locale;
  if (!loaded.has(locale)) {
    const mod = await import('./locales/en.po');
    i18n.load('en', mod.messages);
    loaded.add('en');
  }
  if (latest !== locale) return;
  i18n.activate(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

/** Ustawienia regionalne dla Intl: polskie liczby i waluty po polsku, brytyjskie po angielsku. */
export function numberLocale(): 'pl-PL' | 'en-GB' {
  return i18n.locale === 'en' ? 'en-GB' : 'pl-PL';
}

export { i18n };
