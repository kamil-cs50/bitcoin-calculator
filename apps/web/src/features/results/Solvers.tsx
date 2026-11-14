import { Trans, useLingui } from '@lingui/react/macro';
import type { Scenario, SolverResult } from '@sim/engine';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Gate } from '../../entitlements/Gate';
import type { FeatureId } from '../../entitlements/features';
import { formatMoney, naturalFrequency } from '../../lib/format';
import { runSolver } from '../../workers/pool';
import type { SimWorker, SolverHandle, SolverKind } from '../../workers/pool';
import { SIM_SEED } from './useSimulation';

type State =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'error' }
  | { status: 'done'; scenario: Scenario; result: SolverResult };

/** Solver w workerze: start na żądanie (trwa kilka sekund), anulowanie, wynik ważny tylko dla tego scenariusza. */
function useSolver(kind: SolverKind, scenario: Scenario, createWorker?: () => SimWorker) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const handle = useRef<SolverHandle | undefined>(undefined);
  const cancel = () => {
    handle.current?.cancel();
    handle.current = undefined;
    setState({ status: 'idle' });
  };
  useEffect(() => () => handle.current?.cancel(), []);
  // zmiana scenariusza w trakcie liczenia unieważnia przebieg
  const forScenario = useRef(scenario);
  useEffect(() => {
    if (forScenario.current !== scenario) {
      forScenario.current = scenario;
      handle.current?.cancel();
      handle.current = undefined;
      setState((s) => (s.status === 'running' ? { status: 'idle' } : s));
    }
  }, [scenario]);

  const start = (targetProb: number) => {
    handle.current?.cancel();
    setState({ status: 'running' });
    const h = runSolver(kind, scenario, { targetProb, seed: SIM_SEED }, createWorker);
    handle.current = h;
    h.done.then(
      (result) => {
        if (handle.current === h) setState({ status: 'done', scenario, result });
      },
      (e: unknown) => {
        if (handle.current === h && (e as Error)?.name !== 'AbortError') setState({ status: 'error' });
      },
    );
  };
  const visible = state.status === 'done' && state.scenario !== scenario ? { status: 'idle' as const } : state;
  return { state: visible, start, cancel };
}

interface CardProps {
  feature: FeatureId;
  kind: SolverKind;
  title: string;
  question: string;
  button: string;
  scenario: Scenario;
  createWorker?: () => SimWorker;
  describe: (r: SolverResult) => string;
}

function SolverCard({ feature, kind, title, question, button, scenario, createWorker, describe }: CardProps) {
  const { t } = useLingui();
  const { state, start, cancel } = useSolver(kind, scenario, createWorker);
  const [prob, setProb] = useState(0.9);
  const selId = useId();
  const running = state.status === 'running';
  return (
    <Gate feature={feature}>
      <Card title={title}>
        <p className="mb-3 mt-0 text-sm text-muted">{question}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={selId} className="text-sm font-medium">
              <Trans>Jak pewnie ma starczyć</Trans>
            </label>
            <select
              id={selId}
              value={prob}
              disabled={running}
              onChange={(e) => setProb(Number(e.target.value))}
              className="min-h-11 rounded-xl border border-border-strong bg-surface px-3 text-base"
            >
              <option value={0.8}>{t`8 na 10`}</option>
              <option value={0.9}>{t`9 na 10`}</option>
              <option value={0.95}>{t`95 na 100`}</option>
            </select>
          </div>
          {running ? (
            <Button variant="secondary" onClick={cancel}>
              <Trans>Anuluj</Trans>
            </Button>
          ) : (
            <Button onClick={() => start(prob)}>{button}</Button>
          )}
        </div>
        {running && (
          <div className="mt-3">
            <progress aria-label={t`Liczymy odpowiedź`} className="h-2 w-full accent-accent" />
            <p role="status" className="mb-0 mt-1 text-sm text-muted">
              <Trans>Liczymy… to potrwa kilka sekund. Możesz w tym czasie oglądać wyniki.</Trans>
            </p>
          </div>
        )}
        {state.status === 'error' && (
          <p role="alert" className="mb-0 mt-3 font-medium text-danger">
            <Trans>Nie udało się policzyć odpowiedzi. Spróbuj jeszcze raz.</Trans>
          </p>
        )}
        {state.status === 'done' && (
          <p data-testid={`solver-${kind}`} className="mb-0 mt-3 text-lg font-medium">
            {describe(state.result)}
          </p>
        )}
      </Card>
    </Gate>
  );
}

/** „Ile mogę bezpiecznie wydawać?” i „Ile muszę wpłacać?” (solvery z silnika, każdy za własną bramką funkcji). */
export function Solvers({ scenario, createWorker }: { scenario: Scenario; createWorker?: () => SimWorker }) {
  const { t } = useLingui();
  const money = (v: number) => formatMoney(v, scenario.baseCurrency, { sigDigits: 2 });
  return (
    <>
      <SolverCard
        feature="solver.safeWithdrawal"
        kind="safeWithdrawal"
        title={t`Ile mogę bezpiecznie wydawać?`}
        question={t`Stała miesięczna wypłata (w dzisiejszych zł), przy której pieniądze starczą do końca horyzontu.`}
        button={t`Policz bezpieczną wypłatę`}
        scenario={scenario}
        createWorker={createWorker}
        describe={(r) =>
          r.amount > 0
            ? t`Około ${money(r.amount)} miesięcznie: pieniądze starczą ${naturalFrequency(r.prob)}.`
            : t`Przy tym portfelu i horyzoncie nie da się niczego wypłacać z tak dużą pewnością.`
        }
      />
      {scenario.goal ? (
        <SolverCard
          feature="solver.requiredContribution"
          kind="requiredContribution"
          title={t`Ile muszę wpłacać?`}
          question={t`Miesięczna wpłata (w dzisiejszych zł, rosnąca z inflacją), przy której osiągniesz cel z planu.`}
          button={t`Policz wymaganą wpłatę`}
          scenario={scenario}
          createWorker={createWorker}
          describe={(r) =>
            r.amount === 0
              ? t`Cel jest osiągalny bez dodatkowych wpłat.`
              : !Number.isFinite(r.amount)
                ? t`Cel nie jest osiągalny przy rozsądnych wpłatach. Zmniejsz go albo wydłuż horyzont.`
                : t`Około ${money(r.amount)} miesięcznie: cel osiągniesz ${naturalFrequency(r.prob)}.`
          }
        />
      ) : (
        <Gate feature="solver.requiredContribution">
          <Card title={t`Ile muszę wpłacać?`}>
            <p className="m-0 text-sm text-muted">
              <Trans>Ustaw cel w planie, a policzymy, ile trzeba miesięcznie wpłacać.</Trans>
            </p>
          </Card>
        </Gate>
      )}
    </>
  );
}
