import { Trans, useLingui } from '@lingui/react/macro';
import { NavLink, Outlet } from 'react-router';
import { APP_NAME } from './appConfig';

export function Layout() {
  const { t } = useLingui();
  const items = [
    { to: '/portfel', label: t`Portfel` },
    { to: '/plan', label: t`Plan` },
    { to: '/wynik', label: t`Wynik` },
    { to: '/zalozenia', label: t`Założenia` },
    { to: '/ustawienia', label: t`Ustawienia` },
  ];
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4">
      <a
        href="#tresc"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg"
      >
        <Trans>Przejdź do treści</Trans>
      </a>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
        <NavLink to="/" end className="inline-flex min-h-11 items-center text-lg font-bold">
          {APP_NAME}
        </NavLink>
        <nav aria-label={t`Główna nawigacja`}>
          <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
            {items.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center rounded-xl px-3 text-base hover:bg-surface-2 ${
                      isActive ? 'bg-accent-soft font-semibold text-accent-soft-fg' : 'text-fg'
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
      <main id="tresc" tabIndex={-1} className="flex-1 pb-8 pt-2 outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-border py-4 text-sm text-muted">
        <Trans>Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej</Trans>
      </footer>
    </div>
  );
}
