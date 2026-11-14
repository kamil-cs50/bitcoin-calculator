import { describe, expect, it } from 'vitest';
import { runBatch } from './runner';
import { summarize } from './stats/summary';
import { referenceScenarios } from './testing/referenceScenarios';
import { validateScenario } from './validate';

const SEED = 1;
const PATHS = 2000;

/** Rekurencyjnie zaokrągla liczby do 6 cyfr znaczących (stabilność migawek między platformami). */
function round6(x: unknown): unknown {
  if (typeof x === 'number') return Number.isFinite(x) && x !== 0 ? Number(x.toPrecision(6)) : x;
  if (Array.isArray(x)) return x.map(round6);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round6(v)]));
  return x;
}

describe('regresja (T8): scenariusze wzorcowe, ziarno 1, 2000 ścieżek', () => {
  for (const [name, s] of Object.entries(referenceScenarios)) {
    it(`${name}: scenariusz jest poprawny`, () => {
      expect(validateScenario(s).ok).toBe(true);
    });
    it(`${name}: summarize zgodne z migawką`, () => {
      const r = runBatch(s, { seed: SEED, paths: PATHS });
      const sum = summarize(r, s, { month: s.horizonMonths, real: true, afterTax: true });
      expect(round6(sum)).toMatchSnapshot();
    });
  }
});
