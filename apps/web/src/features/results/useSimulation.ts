import type { RunResult, Scenario, Warning } from '@sim/engine';
import { validateScenario } from '@sim/engine';
import { useEffect, useRef, useState } from 'react';
import { runProgressive } from '../../workers/pool';
import type { SimWorker } from '../../workers/pool';

/** Stałe ziarno: ten sam scenariusz zawsze daje te same liczby (wspólne liczby losowe przy porównaniach). */
export const SIM_SEED = 20261113;

export interface SimOptions {
  /** Opóźnienie przed startem po zmianie scenariusza (domyślnie 250 ms, spec 4.14). */
  debounceMs?: number;
  seed?: number;
  /** Limit ścieżek; domyślnie 10 000 (tryb eksperta może podnieść). */
  maxPaths?: number;
  workers?: number;
  /** Fabryka workerów (testy podstawiają wersję synchroniczną). */
  createWorker?: () => SimWorker;
}

export interface SimState {
  result?: RunResult;
  /** Liczba ścieżek ostatniego ukończonego etapu (0 przed pierwszym etapem). */
  stage: number;
  running: boolean;
  warnings: Warning[];
  /** Błędy walidacji scenariusza; przy błędach symulacja się nie uruchamia. */
  errors: { path: string; message: string }[];
}

const EMPTY: SimState = { stage: 0, running: false, warnings: [], errors: [] };

/**
 * Symulacja progresywna dla scenariusza: debounce, anulowanie poprzedniego przebiegu przy zmianie
 * scenariusza lub odmontowaniu, wynik po każdym etapie (1 000 → 4 000 → 10 000 ścieżek).
 */
export function useSimulation(scenario: Scenario, opts: SimOptions = {}): SimState {
  const { debounceMs = 250, seed = SIM_SEED, maxPaths = 10_000, workers } = opts;
  const [state, setState] = useState<SimState>(EMPTY);
  const factory = useRef(opts.createWorker);
  factory.current = opts.createWorker;

  useEffect(() => {
    const v = validateScenario(scenario);
    if (!v.ok) {
      setState({ ...EMPTY, errors: v.errors });
      return;
    }
    let alive = true;
    let handle: ReturnType<typeof runProgressive> | undefined;
    setState((s) => ({ ...s, running: true, errors: [], warnings: v.warnings }));
    const timer = setTimeout(() => {
      handle = runProgressive(scenario, seed, {
        maxPaths,
        workers,
        createWorker: factory.current,
        onStage: (result, stage) => {
          if (alive) setState({ result, stage, running: true, warnings: result.warnings, errors: [] });
        },
      });
      handle.done.then(
        () => {
          if (alive) setState((s) => ({ ...s, running: false }));
        },
        () => undefined, // anulowanie lub błąd workera: stan zostaje z ostatniego etapu
      );
    }, debounceMs);
    return () => {
      alive = false;
      clearTimeout(timer);
      handle?.cancel();
    };
  }, [scenario, seed, maxPaths, workers, debounceMs]);

  return state;
}
