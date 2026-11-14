import { I18nProvider } from '@lingui/react';
import type { Scenario, SolverResult } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as features from '../../entitlements/features';
import { i18n } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { syncWorker } from '../../workers/syncWorker';
import type { SimWorker } from '../../workers/pool';
import { useScenarioStore } from '../../state/scenarioStore';
import { Dashboard } from './Dashboard';
import { SIM_SEED } from './useSimulation';
import { Solvers } from './Solvers';

vi.mock('../../entitlements/features', async (orig) => {
  const actual = await orig<typeof import('../../entitlements/features')>();
  return { ...actual, useEntitlement: vi.fn(actual.useEntitlement) };
});

const nb = (s: string | null) => (s ?? '').replace(/[\s\u00a0\u202f]/g, ' ');
const res = (amount: number, prob = 0.91): SolverResult => ({ amount, prob, ci: [prob - 0.01, prob + 0.01], iterations: 7 });

function worker(solve: SimWorker['solve']): () => SimWorker {
  return () => syncWorker({ solve, terminate: vi.fn() });
}
const wrap = (s: Scenario, createWorker: () => SimWorker) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <Solvers scenario={s} createWorker={createWorker} />
      </MemoryRouter>
    </I18nProvider>,
  );

const plain = makeScenario();
const withGoal = makeScenario({ goal: { amountReal: 200_000, month: 120 } });

beforeEach(() => vi.mocked(features.useEntitlement).mockReset().mockReturnValue(true));

describe('Solvers: „Ile mogę bezpiecznie wydawać?”', () => {
  it('uruchamia solver w workerze (ziarno SIM_SEED, poziom z wyboru), pokazuje postęp i wynik', async () => {
    let resolve!: (r: SolverResult) => void;
    const solve = vi.fn(() => new Promise<SolverResult>((r) => (resolve = r)));
    wrap(plain, worker(solve));
    expect(screen.getByRole('heading', { name: 'Ile mogę bezpiecznie wydawać?' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Jak pewnie ma starczyć'), '0.95');
    await userEvent.click(screen.getByRole('button', { name: 'Policz bezpieczną wypłatę' }));
    expect(solve).toHaveBeenCalledWith('safeWithdrawal', plain, { targetProb: 0.95, seed: SIM_SEED });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    resolve(res(2500));
    const out = await screen.findByTestId('solver-safeWithdrawal');
    expect(nb(out.textContent)).toContain(nb(formatMoney(2500, 'PLN', { sigDigits: 2 })));
    expect(out.textContent).toMatch(/w 91 na 100 przyszłości/);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('błąd workera pokazuje komunikat, anulowanie ucina liczenie', async () => {
    const solve = vi.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation(() => new Promise(() => undefined));
    const terminate = vi.fn();
    wrap(plain, () => syncWorker({ solve, terminate }));
    await userEvent.click(screen.getByRole('button', { name: 'Policz bezpieczną wypłatę' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się policzyć');
    await userEvent.click(screen.getByRole('button', { name: 'Policz bezpieczną wypłatę' }));
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(terminate).toHaveBeenCalled();
  });

  it('wynik znika, gdy scenariusz się zmienił', async () => {
    const solve = vi.fn().mockResolvedValue(res(2500));
    const { rerender } = wrap(plain, worker(solve));
    await userEvent.click(screen.getByRole('button', { name: 'Policz bezpieczną wypłatę' }));
    await screen.findByTestId('solver-safeWithdrawal');
    rerender(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <Solvers scenario={{ ...plain, horizonMonths: 60 }} createWorker={worker(solve)} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.queryByTestId('solver-safeWithdrawal')).not.toBeInTheDocument();
  });

  it('bez uprawnienia sekcja się nie pokazuje', () => {
    vi.mocked(features.useEntitlement).mockReturnValue(false);
    wrap(withGoal, worker(vi.fn()));
    expect(screen.queryByRole('heading', { name: 'Ile mogę bezpiecznie wydawać?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ile muszę wpłacać?' })).not.toBeInTheDocument();
  });
});

describe('Solvers: „Ile muszę wpłacać?”', () => {
  it('bez celu w planie jest tylko podpowiedź', () => {
    wrap(plain, worker(vi.fn()));
    expect(screen.getByText(/Ustaw cel w planie/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Policz wymaganą wpłatę' })).not.toBeInTheDocument();
  });

  it('z celem: wpłata, 0 i nieosiągalny cel (Infinity)', async () => {
    const solve = vi.fn().mockResolvedValueOnce(res(800, 0.9)).mockResolvedValueOnce(res(0, 0.97)).mockResolvedValueOnce(res(Infinity, 0.2));
    wrap(withGoal, worker(solve));
    const btn = () => screen.getByRole('button', { name: 'Policz wymaganą wpłatę' });
    await userEvent.click(btn());
    expect(solve).toHaveBeenCalledWith('requiredContribution', withGoal, { targetProb: 0.9, seed: SIM_SEED });
    const out = await screen.findByTestId('solver-requiredContribution');
    expect(nb(out.textContent)).toContain(nb(formatMoney(800, 'PLN', { sigDigits: 2 })));
    await userEvent.click(btn());
    await waitFor(() => expect(screen.getByTestId('solver-requiredContribution').textContent).toMatch(/bez dodatkowych wpłat/));
    await userEvent.click(btn());
    await waitFor(() => expect(screen.getByTestId('solver-requiredContribution').textContent).toMatch(/nie jest osiągalny/));
  });
});

describe('Dashboard', () => {
  it('pokazuje sekcje solverów pod wynikami', async () => {
    useScenarioStore.getState().resetScenario();
    useScenarioStore.getState().addPosition({ presetId: 'globalEquity', value: 50_000 });
    const w = (): SimWorker => syncWorker({ solve: async () => res(1000) });
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <Dashboard sim={{ createWorker: w, debounceMs: 0, maxPaths: 1000, workers: 1 }} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Ile mogę bezpiecznie wydawać?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Policz bezpieczną wypłatę' }));
    expect(await screen.findByTestId('solver-safeWithdrawal')).toBeInTheDocument();
  });
});
