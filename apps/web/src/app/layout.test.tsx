import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { APP_NAME } from './appConfig';
import { routes } from './routes';

function at(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

describe('układ i trasy', () => {
  it.each([
    ['/', APP_NAME],
    ['/portfel', 'Portfel'],
    ['/plan', 'Plan'],
    ['/wynik', 'Wynik'],
    ['/zalozenia', 'Założenia i źródła'],
    ['/ustawienia', 'Ustawienia'],
  ])('trasa %s ma nagłówek %s, nawigację i zastrzeżenie', (path, heading) => {
    at(path);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Główna nawigacja' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByText('Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej'),
    ).toBeInTheDocument();
  });

  it('link „Przejdź do treści” i oznaczenie bieżącej strony', () => {
    at('/plan');
    expect(screen.getByRole('link', { name: 'Przejdź do treści' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
  });

  it('nieznana trasa pokazuje stronę 404', () => {
    at('/nie-ma');
    expect(screen.getByRole('heading', { level: 1, name: 'Nie ma takiej strony' })).toBeInTheDocument();
  });
});

describe('nazwa aplikacji', () => {
  it('index.html nie ma nazwy wpisanej na sztywno', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).not.toContain(APP_NAME);
    expect(html).toContain('%APP_NAME%');
  });
  it('e2e bierze nazwę z appConfig', () => {
    const e2e = readFileSync(resolve(process.cwd(), 'e2e/offline.spec.ts'), 'utf8');
    expect(e2e).not.toContain(`'${APP_NAME}'`);
    expect(e2e).toContain('APP_NAME');
  });
});
