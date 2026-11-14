import { wilson } from '../stats/intervals';

/**
 * Bisekcja po kwocie dla funkcji `f` (prawdopodobieństwo) i poziomu `target`.
 * Zakłada, że na wejściu koniec "bezpieczny" spełnia `f ≥ target`, a drugi koniec nie:
 *  - increasing = true:  f(lo) < target ≤ f(hi)  (wymagana wpłata: im więcej, tym lepiej),
 *  - increasing = false: f(lo) ≥ target > f(hi)  (bezpieczna wypłata: im mniej, tym lepiej).
 * `f` jest funkcją schodkową prawie monotoniczną (spec 4.13 [Z-21]), więc niezmiennik utrzymujemy punktowo.
 * Stop: szerokość przedziału ≤ relTol · lo (lo = dolny koniec, więc przedział jest też ≤ relTol · rozwiązanie)
 * albo maxIter iteracji.
 */
export function bisectAmount(
  f: (x: number) => number,
  lo: number,
  hi: number,
  target: number,
  o: { relTol: number; maxIter: number; increasing: boolean },
): { lo: number; hi: number; iterations: number } {
  let iterations = 0;
  while (iterations < o.maxIter && hi - lo > o.relTol * lo) {
    const mid = 0.5 * (lo + hi);
    const ok = f(mid) >= target;
    iterations++;
    // increasing: ok ⇒ rozwiązanie jest poniżej mid; decreasing: ok ⇒ powyżej
    if (ok === o.increasing) hi = mid;
    else lo = mid;
  }
  return { lo, hi, iterations };
}

export interface SolverResult {
  amount: number;
  prob: number;
  ci: [number, number];
  iterations: number;
}

/** Parametry wspólne solverów (spec 4.13): ziarno CRN, poziom i liczba ścieżek (domyślnie 4 000). */
export interface SolverOptions {
  targetProb: number;
  seed: number;
  paths?: number;
  /** Rozmiar partii przy liczeniu sukcesów (pamięć); wynik od niego nie zależy (T7). Domyślnie 1000. */
  batchSize?: number;
}

export const SOLVER_PATHS = 4000;
export const SOLVER_REL_TOL = 0.005;
export const SOLVER_MAX_ITER = 20;
const COARSE_PATHS = 1000;
const COARSE_REL_TOL = 0.02;
const MAX_EXPAND = 40;

export interface StagedProblem {
  /** Liczba sukcesów wśród pierwszych `paths` ścieżek (CRN: ścieżka i zależy tylko od ziarna i indeksu). */
  successes: (x: number, paths: number) => number;
  paths: number;
  targetProb: number;
  /** true: większa kwota = większe P (wpłata); false: mniejsza kwota = większe P (wypłata). */
  increasing: boolean;
  /** Punkt startowy (kwota > 0) albo null (wtedy przedział [0, xMax]). */
  start: number | null;
  xMax: number;
}

export interface StagedResult {
  amount: number;
  k: number;
  n: number;
  iterations: number;
}

/**
 * Dwuetapowa bisekcja (spec 4.14: etapy): najpierw gruba na 1 000 ścieżkach (tolerancja 2%), potem
 * dokładna na `paths` ścieżkach w poszerzonym przedziale (relTol 0,5%, maks. 20 iteracji). Przedział końcowy
 * jest sprawdzony na pełnej próbie; zwracamy jego bezpieczny koniec (niższą wypłatę / wyższą wpłatę).
 * Nieosiągalny cel wpłaty daje Infinity, a niemożliwa nawet zerowa wypłata daje 0.
 */
export function solveStaged(p: StagedProblem): StagedResult {
  const cache = new Map<string, number>();
  const kAt = (x: number, n: number): number => {
    const key = `${n}:${x}`;
    let k = cache.get(key);
    if (k === undefined) {
      k = p.successes(x, n);
      cache.set(key, k);
    }
    return k;
  };
  const pAt = (x: number, n: number): number => kAt(x, n) / n;
  const N = p.paths;
  const target = p.targetProb;
  const inc = p.increasing;
  // przy porównaniach z target dopuszczamy błąd zaokrąglenia k/n
  const good = (x: number, n: number): boolean => pAt(x, n) >= target - 1e-12;
  const result = (amount: number, iterations: number): StagedResult => ({
    amount,
    k: kAt(amount === Infinity ? p.xMax : amount, N),
    n: N,
    iterations,
  });

  // --- etap 1: gruby
  let a: number;
  let b: number;
  let iterations = 0;
  const n1 = Math.min(COARSE_PATHS, N);
  const startLo = p.start === null ? 0 : p.start * 0.9;
  const startHi = p.start === null ? p.xMax : p.start * 1.1;
  if (n1 < N) {
    a = startLo;
    b = startHi;
    if (p.start !== null) {
      // zweryfikuj i rozszerz przedział na grubej próbie (tylko wypłata ma start; wpłata zaczyna od [0, xMax])
      const f1 = (x: number): number => pAt(x, n1);
      ({ lo: a, hi: b } = expand(a, b, inc, (x) => f1(x) >= target - 1e-12, p.xMax));
    }
    const r1 = bisectAmount((x) => pAt(x, n1), a, b, target, { relTol: COARSE_REL_TOL, maxIter: SOLVER_MAX_ITER, increasing: inc });
    iterations += r1.iterations;
    a = r1.lo;
    b = r1.hi;
    // poszerzenie o szum grubej próby
    a = Math.max(0, a * 0.95);
    b = Math.min(p.xMax, b * 1.05);
    if (!(b > a)) {
      a = startLo;
      b = startHi;
    }
  } else {
    a = startLo;
    b = startHi;
  }

  // --- etap 2: pełna próba; walidacja i rozszerzenie przedziału
  const g = (x: number): boolean => good(x, N);
  const e = expand(a, b, inc, g, p.xMax);
  if (e.status === 'unreachable') return result(Infinity, iterations);
  if (e.status === 'zero') return result(0, iterations);
  const r2 = bisectAmount((x) => pAt(x, N), e.lo, e.hi, target, { relTol: SOLVER_REL_TOL, maxIter: SOLVER_MAX_ITER, increasing: inc });
  iterations += r2.iterations;
  return result(inc ? r2.hi : r2.lo, iterations);
}

interface Bracket {
  lo: number;
  hi: number;
  status: 'ok' | 'unreachable' | 'zero';
}

/**
 * Rozszerza [lo, hi], aż koniec bezpieczny spełnia `good`, a drugi nie.
 * increasing: bezpieczny = hi (rośnie do xMax; jeśli xMax nie wystarcza → unreachable), niebezpieczny = lo (maleje do 0;
 * jeśli już 0 spełnia cel → zero). decreasing: bezpieczny = lo (maleje do 0; jeśli 0 nie spełnia → zero),
 * niebezpieczny = hi (rośnie; bez limitu poza liczbą kroków).
 */
function expand(lo: number, hi: number, increasing: boolean, good: (x: number) => boolean, xMax: number): Bracket {
  const up = (x: number): number => Math.min(xMax, Math.max(x * 1.5, xMax * Math.pow(2, -10)));
  const upFinite = (x: number): number => x * 1.25;
  const down = (x: number): number => (x < 1e-9 * Math.max(1, hi) ? 0 : x * 0.8);
  if (increasing) {
    // bezpieczny koniec: hi
    for (let i = 0; !good(hi); i++) {
      if (hi >= xMax || i > MAX_EXPAND) return { lo, hi, status: 'unreachable' };
      lo = hi;
      hi = up(hi);
    }
    // niebezpieczny koniec: lo musi NIE spełniać celu
    for (let i = 0; good(lo); i++) {
      if (lo === 0) return { lo, hi, status: 'zero' };
      hi = lo;
      lo = i >= 12 ? 0 : down(lo);
    }
    return { lo, hi, status: 'ok' };
  }
  for (let i = 0; !good(lo); i++) {
    if (lo === 0) return { lo, hi, status: 'zero' };
    hi = lo;
    lo = i >= 12 ? 0 : down(lo);
  }
  for (let i = 0; good(hi); i++) {
    if (i > MAX_EXPAND) break; // praktycznie nieograniczona wypłata spełnia cel; zwracamy ostatni sprawdzony koniec
    lo = hi;
    hi = upFinite(hi);
  }
  return { lo, hi, status: 'ok' };
}

/** Zamienia wynik etapowy na SolverResult (Wilson dla P̂ w punkcie wyniku). */
export function toSolverResult(r: StagedResult): SolverResult {
  return { amount: r.amount, prob: r.n > 0 ? r.k / r.n : 0, ci: wilson(r.k, r.n), iterations: r.iterations };
}
