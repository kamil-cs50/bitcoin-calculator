import { create } from 'zustand';
import { activateLocale, type Locale } from '../i18n';

const KEY = 'ui:locale';

/**
 * Zapisany wybór języka. Domyślnie polski także przy angielskiej przeglądarce:
 * aplikacja jest polska, angielski włącza się tylko jawnie w Ustawieniach.
 */
export function readLocale(): Locale {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'pl';
  } catch {
    return 'pl';
  }
}

export interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: readLocale(),
  setLocale: async (locale) => {
    try {
      localStorage.setItem(KEY, locale);
    } catch {
      // bez localStorage: język żyje do końca sesji
    }
    await activateLocale(locale);
    set({ locale });
  },
}));

/** Przed pierwszym renderem: ładuje katalog zapisanego języka. */
export async function initLocale(): Promise<void> {
  const locale = readLocale();
  await activateLocale(locale);
  useLocaleStore.setState({ locale });
}
