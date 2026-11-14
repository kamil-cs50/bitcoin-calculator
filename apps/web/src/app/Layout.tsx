import { Trans, useLingui } from '@lingui/react/macro';
import { NavLink, Outlet, useLocation } from 'react-router';
import { DatasetNotice } from '../features/settings/DatasetNotice';
import { StorageNotice } from '../features/settings/StorageNotice';
import { UpdateBanner } from '../features/settings/UpdateBanner';
import { APP_NAME } from './appConfig';
import { ErrorBoundary } from './ErrorBoundary';

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
    <div className="mx-auto flex min-h-dvh max-w-[1360px] flex-col px-[clamp(18px,3.4vw,48px)]">
      <div aria-hidden="true" className="ambient" />
      <a
        href="#tresc"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg"
      >
        <Trans>Przejdź do treści</Trans>
      </a>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
        <NavLink to="/" end className="inline-flex min-h-11 items-center text-sm font-medium tracking-[0.02em] uppercase">
          {APP_NAME}
        </NavLink>
        <nav aria-label={t`Główna nawigacja`} className="glass rounded-full p-1">
          <ul className="m-0 flex list-none flex-wrap gap-0.5 p-0">
            {items.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  className={({ isActive }) =>
                    `inline-flex min-h-9 items-center rounded-full px-4 text-sm transition-colors hover:bg-surface-2 ${
                      isActive ? 'bg-surface-2 font-medium text-fg' : 'text-muted'
                    }`
                  }
                >
                  {i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <StorageNotice />
      <DatasetNotice />
      {pathname !== '/ustawienia' && <UpdateBanner />}
      <main id="tresc" tabIndex={-1} className="flex-1 pb-8 pt-2 outline-none">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-6 text-sm text-muted">
        <span>
          <Trans>Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej</Trans>
        </span>
        <NavLink
          to="/metodologia"
          className={({ isActive }) =>
            `inline-flex min-h-11 items-center underline ${isActive ? 'font-semibold text-fg' : ''}`
          }
        >
          <Trans>Metodologia</Trans>
        </NavLink>
      </footer>
    </div>
  );
}
