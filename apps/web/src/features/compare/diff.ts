import type { RunResult } from '@sim/engine';
import { gridIndex, valuesAt } from '../results/values';

export interface DiffEstimate {
  /** Różnica kwantyla (B − A) policzona na całej próbie. */
  diff: number;
  /** Przedział 95% z bootstrapu na parach ścieżek (ta sama ścieżka w A i B losowana razem). */
  ci: [number, number];
}

export interface PairedDifference {
  median: DiffEstimate;
  p10: DiffEstimate;
  /** Liczba sparowanych ścieżek. */
  paths: number;
  /** Miesiąc, w którym porównujemy (najpóźniejszy wspólny punkt siatki). */
  month: number;
}

export interface DiffOptions {
  /** Miesiąc porównania; domyślnie koniec krótszego z horyzontów. */
  month?: number;
  real: boolean;
  afterTax: boolean;
  /** Liczba powtórzeń bootstrapu (domyślnie 300). */
  reps?: number;
}

/** Deterministyczny PRNG (mulberry32) tylko do bootstrapu; wynik nie zależy od symulacji. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kwantyl typu 7 z próby posortowanej (jak w silniku). */
function q7(sorted: Float64Array, p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const a = sorted[lo]!;
  return a + (h - lo) * (sorted[Math.min(lo + 1, sorted.length - 1)]! - a);
}

/**
 * Różnica B − A mediany i p10 wartości w tym samym miesiącu dla dwóch przebiegów na wspólnych liczbach
 * losowych (to samo ziarno ⇒ ścieżka p w A i B ma te same szoki, spec 4.2). Przedział ufności liczony
 * jest na parach (a_p, b_p): bootstrap losuje indeksy ścieżek i bierze obie wartości naraz, więc
 * wspólny szum znosi się z różnicy i przedział jest węższy niż dla niezależnych prób.
 * Dla identycznych przebiegów różnica i przedział to dokładnie 0.
 */
export function pairedDifference(a: RunResult, b: RunResult, o: DiffOptions): PairedDifference {
  const n = Math.min(a.paths, b.paths);
  const horizon = Math.min(a.grid[a.grid.length - 1]!, b.grid[b.grid.length - 1]!);
  const target = o.month === undefined ? horizon : Math.min(o.month, horizon);
  const ja = gridIndex(a.grid, target);
  const jb = gridIndex(b.grid, target);
  const va = valuesAt(a, ja, o).subarray(0, n);
  const vb = valuesAt(b, jb, o).subarray(0, n);

  const point = (p: number): number => q7(Float64Array.from(vb).sort(), p) - q7(Float64Array.from(va).sort(), p);
  const med = point(0.5);
  const p10 = point(0.1);

  const reps = o.reps ?? 300;
  const rnd = mulberry32(0x5eed1234);
  const ra = new Float64Array(n);
  const rb = new Float64Array(n);
  const meds = new Float64Array(reps);
  const p10s = new Float64Array(reps);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rnd() * n);
      ra[i] = va[k]!;
      rb[i] = vb[k]!;
    }
    ra.sort();
    rb.sort();
    meds[r] = q7(rb, 0.5) - q7(ra, 0.5);
    p10s[r] = q7(rb, 0.1) - q7(ra, 0.1);
  }
  meds.sort();
  p10s.sort();
  const ci = (s: Float64Array, d: number): [number, number] => [Math.min(q7(s, 0.025), d), Math.max(q7(s, 0.975), d)];
  return {
    median: { diff: med, ci: ci(meds, med) },
    p10: { diff: p10, ci: ci(p10s, p10) },
    paths: n,
    month: target,
  };
}
