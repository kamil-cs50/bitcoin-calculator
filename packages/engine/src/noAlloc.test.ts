import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { Kernel } from './kernel';
import type { PathSink } from './kernel';
import { referenceScenarios } from './testing/referenceScenarios';
import type { Scenario } from './types';

/**
 * Brak alokacji w pętli miesięcznej (Global Constraint). Dwie metody (JS nie pozwala policzyć alokacji wprost):
 *  1. licznik konstruktorów: po rozgrzaniu podczas `simulate` nie wolno wołać `new` na typowanych tablicach,
 *     `Array`, `Map`, `Set` ani `ArrayBuffer` (bufory powstają w konstruktorze Kernela); ścieżki PL też, bo
 *     `closeYear` używa literałów, nie konstruktorów;
 *  2. nachylenie sterty: po `gc()` mierzymy `heapUsed` przed i po jednej ścieżce, bierzemy minimum z kilku prób
 *     i sprawdzamy bajty na miesiąc (V8 pudełkuje zmiennoprzecinkowe argumenty/wyniki, ok. 250 B/mies.; tablica
 *     alokowana co miesiąc dałaby wyraźnie więcej, a wynik nie może rosnąć z horyzontem szybciej niż liniowo ze stałą).
 */
const noopSink: PathSink = { onGrid() {}, onEnd() {} };

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

const CTORS = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint8Array', 'Uint32Array', 'Array', 'Map', 'Set', 'ArrayBuffer'] as const;

function countConstructions(fn: () => void): number {
  const g = globalThis as unknown as Record<string, unknown>;
  const original: Record<string, unknown> = {};
  let n = 0;
  for (const name of CTORS) {
    original[name] = g[name];
    g[name] = new Proxy(g[name] as object, {
      construct(target, args, newTarget) {
        n++;
        return Reflect.construct(target as new (...a: unknown[]) => object, args, newTarget);
      },
    });
  }
  try {
    fn();
  } finally {
    for (const name of CTORS) g[name] = original[name];
  }
  return n;
}

function scenarioWith(s: Scenario, horizonMonths: number): Scenario {
  return { ...s, horizonMonths, goal: undefined, events: s.events.filter((e) => e.month < horizonMonths) };
}

describe('kernel: brak alokacji w pętli miesięcznej', () => {
  it('licznik konstruktorów wykrywa `new Float64Array` (kontrola testu)', () => {
    expect(countConstructions(() => void new Float64Array(3))).toBe(1);
  });

  for (const [name, ref] of Object.entries(referenceScenarios)) {
    it(`${name}: zero konstrukcji tablic/map w simulate po rozgrzaniu`, () => {
      const k = new Kernel(scenarioWith(ref, 360));
      for (let p = 0; p < 50; p++) k.simulate(1, p, noopSink);
      expect(countConstructions(() => k.simulate(1, 500, noopSink))).toBe(0);
    });

    it(`${name}: bajty na miesiąc ograniczone (minimum z prób po gc)`, () => {
      const k = new Kernel(scenarioWith(ref, 600));
      for (let p = 0; p < 100; p++) k.simulate(1, p, noopSink);
      let min = Infinity;
      for (let p = 0; p < 30; p++) {
        gc();
        const h0 = process.memoryUsage().heapUsed;
        k.simulate(1, 300 + p, noopSink);
        min = Math.min(min, process.memoryUsage().heapUsed - h0);
      }
      expect(min / 600).toBeLessThan(512);
    });
  }
});
