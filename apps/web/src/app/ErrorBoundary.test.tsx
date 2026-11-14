import 'fake-indexeddb/auto';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { useScenarioStore } from '../state/scenarioStore';
import { ErrorBoundary } from './ErrorBoundary';

let broken = true;
function Bomb() {
  if (broken) throw new Error('boom');
  return <p>wszystko działa</p>;
}

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </MemoryRouter>
    </I18nProvider>,
  );

beforeEach(() => {
  broken = true;
  useScenarioStore.getState().resetScenario();
  vi.spyOn(console, 'error').mockImplementation(() => undefined); // React loguje przechwycony błąd
});

describe('ErrorBoundary', () => {
  it('błąd renderu: karta „uszkodzony zapis” zamiast białego ekranu, z kopią danych i startem od nowa', () => {
    view();
    expect(screen.getByRole('alert')).toHaveTextContent('Coś poszło nie tak');
    expect(screen.getByRole('button', { name: 'Pobierz kopię danych' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zacznij od nowa' })).toBeInTheDocument();
  });

  it('„Zacznij od nowa” resetuje scenariusz i renderuje dzieci ponownie', async () => {
    useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 1000 });
    view();
    broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'Zacznij od nowa' }));
    expect(screen.getByText('wszystko działa')).toBeInTheDocument();
    expect(useScenarioStore.getState().scenario.positions).toEqual([]);
  });
});
