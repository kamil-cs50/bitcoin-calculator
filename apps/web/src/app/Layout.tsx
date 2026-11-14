import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useLocaleStore } from '../state/localeStore';
import { numberLocale } from '../i18n';
import { DatasetNotice } from '../features/settings/DatasetNotice';
import { StorageNotice } from '../features/settings/StorageNotice';
import { UpdateBanner } from '../features/settings/UpdateBanner';
import { APP_NAME } from './appConfig';
import { Ambient } from '../components/Ambient';
import { ErrorBoundary } from './ErrorBoundary';

/** Godzina w Warszawie (HH:MM), odświeżana co 20 s jak w projekcie. */
function useWarsawClock(): string {
  const fmt = (): string => {
    try {
      return new Intl.DateTimeFormat(numberLocale(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Warsaw' }).format(new Date());
    } catch {
      return '';
    }
  };
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setNow(fmt()), 20_000);
    return () => clearInterval(id);
  });
  return now;
}

/** „PL / EN · Warszawa — 16:43”: przełącznik języka i zegar (prawa strona nagłówka w projekcie v3). */
function HeaderAside() {
  const { t } = useLingui();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const clock = useWarsawClock();
  const btn = (l: 'pl' | 'en', text: string, name: string) => (
    <button
      type="button"
      lang={l}
      title={name}
      aria-pressed={locale === l}
      onClick={() => void setLocale(l)}
      className={`inline-flex min-h-9 min-w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.06em] uppercase transition-colors ${
        locale === l ? 'text-fg' : 'text-label hover:text-fg'
      }`}
    >
      {text}
    </button>
  );
  return (
    <div className="eyebrow flex w-full items-center justify-start gap-x-4 lg:w-auto lg:justify-end">
      <div className="flex items-center gap-1.5">
        {btn('pl', 'PL', 'Polski')}
        <span aria-hidden="true">/</span>
        {btn('en', 'EN', 'English')}
      </div>
      {clock && (
        <span>
          {t`Warszawa`} — <time className="tabular-nums">{clock}</time>
        </span>
      )}
    </div>
  );
}

export function Layout() {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const items = [
    { to: '/portfel', label: t`Portfel` },
    { to: '/plan', label: t`Plan` },
    { to: '/wynik', label: t`Wynik` },
    { to: '/porownanie', label: t`Porównanie` },
    { to: '/zalozenia', label: t`Założenia` },
    { to: '/ustawienia', label: t`Ustawienia` },
  ];
  return (
    <>
      <Ambient />
      <div className="relative z-[2] mx-auto box-content flex min-h-dvh max-w-[1360px] flex-col px-[clamp(18px,3.4vw,48px)]">
        <a
          href="#tresc"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg"
        >
          <Trans>Przejdź do treści</Trans>
        </a>
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 pb-3 pt-5 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <NavLink to="/" end className="eyebrow inline-flex min-h-11 items-center !text-fg no-underline hover:!text-accent-text">
            {APP_NAME}
          </NavLink>
          <nav aria-label={t`Główna nawigacja`} className="glass max-w-full rounded-3xl p-1 sm:rounded-full">
            <ul className="m-0 flex list-none flex-wrap gap-0.5 p-0">
              {items.map((i) => (
                <li key={i.to} className="shrink-0">
                  <NavLink
                    to={i.to}
                    className={({ isActive }) =>
                      `inline-flex min-h-9 items-center rounded-full px-[15px] text-[13px] tracking-[-0.005em] no-underline transition-[background,color] duration-300 hover:text-fg ${
                        isActive ? 'bg-fg/12 text-fg' : 'text-fg/75'
                      }`
                    }
                  >
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <HeaderAside />
        </header>
        <StorageNotice />
        <DatasetNotice />
        {pathname !== '/ustawienia' && <UpdateBanner />}
        <main id="tresc" tabIndex={-1} className="flex-1 pb-14 pt-[clamp(16px,2.4vw,32px)] outline-none">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <footer className="eyebrow grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-end gap-x-6 gap-y-2.5 border-t border-hairline pb-[26px] pt-[22px]">
          <span>
            <Trans>Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej</Trans>
          </span>
          <NavLink
            to="/metodologia"
            className="inline-flex min-h-11 items-center justify-self-start !text-fg no-underline hover:!text-accent-text sm:justify-self-center"
          >
            <Trans>Metodologia</Trans>
            <span aria-hidden="true">&nbsp;↗</span>
          </NavLink>
          <span className="sm:justify-self-end">© {new Date().getFullYear()}</span>
        </footer>
      </div>
    </>
  );
}
