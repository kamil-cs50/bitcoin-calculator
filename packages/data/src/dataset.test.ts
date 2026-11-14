import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParamSchema, SourceSchema } from './schema';
import { loadDataset } from './load';

/** Rekurencyjnie zbiera wszystkie obiekty o kształcie Param (mają `value` i `kind`). */
function collectParams(node: unknown, path: string, out: [string, unknown][]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectParams(v, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ('value' in o && 'kind' in o) {
      out.push([path, o]);
      return;
    }
    for (const [k, v] of Object.entries(o)) collectParams(v, `${path}.${k}`, out);
  }
}

describe('zbiór danych 2026.11', () => {
  const d = loadDataset('2026.11');

  it('zawiera wartości z tabel spec 6.2–6.4', () => {
    expect(d.assets.globalEquity!.g.value).toBe(0.065);
    expect(d.assets.globalEquity!.g.range).toEqual([0.059, 0.075]);
    expect(d.crypto.btcBase!.g0.value).toBe(0.15);
    expect(d.crypto.btcBase!.hazard.value).toBe(0.01);
    expect(d.edo.firstYearRate.value).toBe(0.0535);
    expect(d.edo.margin.value).toBe(0.02);
    expect(d.edo.earlyFeePer100.value).toBe(3);
    expect(d.inflation.x0.value).toBe(0.035);
    expect(d.taxPL.ikeLimit2026.value).toBe(28260);
    expect(d.market.regime.p01.verified).toBe('no');
  });

  it('statusy verified są przepisane ze spec (✅ yes, ◐ secondary, ❌ no)', () => {
    expect(d.inflation.x0.verified).toBe('yes');
    expect(d.inflation.prevYoY.verified).toBe('secondary');
    expect(d.edo.firstYearRate.verified).toBe('yes');
    expect(d.edo.earlyFeePer100.verified).toBe('secondary'); // limit opłaty w liście emisyjnym niezweryfikowany
    expect(d.taxPL.ikeLimit2026.verified).toBe('secondary');
    expect(d.assets.wigEquity!.g.kind).toBe('assumption');
    expect(d.assets.wigEquity!.g.verified).toBe('no');
    expect(d.assets.usEquity!.g.verified).toBe('secondary'); // zakres zawiera RA (◐)
    expect(d.assets.globalEquity!.sigma.verified).toBe('no');
  });

  it('presety krypto, fx i lokaty mają wartości z tabel', () => {
    expect(Object.keys(d.crypto).sort()).toEqual(
      ['btcBase', 'btcOptimistic', 'btcPessimistic', 'ethBase'].sort(),
    );
    expect(d.crypto.btcPessimistic!.gInf.value).toBe(0.025);
    expect(d.crypto.btcOptimistic!.tauG.value).toBe(10);
    expect(d.crypto.ethBase!.sigma0.value).toBe(0.7);
    expect(d.crypto.ethBase!.se.value).toBe(0.09);
    expect(d.fx.USD.sigma.value).toBe(0.11);
    expect(d.fx.EUR.sigma.value).toBe(0.07);
    expect(d.fx.USD.halfLifeYears.value).toBe(4);
    expect(d.fx.USD.foreignInflation.value).toBe(0.025);
    expect(d.fx.EUR.foreignInflation.value).toBe(0.02);
    expect(d.assets.deposit!.depositK!.value).toBe(0.15);
    expect(d.assets.deposit!.depositSpread!.value).toBe(-0.005);
    expect(d.market.nu.value).toBe(5);
    expect(d.inflation.cpiLevels).toHaveLength(13);
  });

  it('tablice trwania życia GUS: q_x 0-100 obu płci, wartości kontrolne, q_0, +2 lata jako założenie', () => {
    const lt = d.lifeTables;
    expect(lt.male.qx).toHaveLength(101);
    expect(lt.female.qx).toHaveLength(101);
    expect(lt.male.qx[0]).toBe(0.00333);
    expect(lt.female.qx[0]).toBe(0.00316);
    expect(lt.male.e60.value).toBe(20.04);
    expect(lt.female.e60.value).toBe(24.71);
    expect(lt.male.e60.verified).toBe('yes');
    expect(lt.cohortExtraYears.kind).toBe('assumption');
    expect(lt.cohortExtraYears.verified).toBe('no');
  });

  it('każdy Param w całym zbiorze przechodzi ParamSchema (przejście rekurencyjne)', () => {
    const found: [string, unknown][] = [];
    collectParams(d, 'dataset', found);
    expect(found.length).toBeGreaterThan(150);
    for (const [path, p] of found) {
      const r = ParamSchema.safeParse(p);
      expect(r.success, path).toBe(true);
    }
  });

  it('sources.json to rejestr poprawnych źródeł, a każde źródło parametru jest w rejestrze', () => {
    const url = new URL('../datasets/2026.11/sources.json', import.meta.url);
    const registry = JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
    const known = new Set<string>();
    for (const s of Object.values(registry)) {
      const parsed = SourceSchema.parse(s);
      known.add(`${parsed.url}|${parsed.title}`);
    }
    const found: [string, unknown][] = [];
    collectParams(d, 'dataset', found);
    for (const [path, p] of found) {
      for (const s of ParamSchema.parse(p).sources) {
        expect(known.has(`${s.url}|${s.title}`), `${path}: ${s.title}`).toBe(true);
      }
    }
  });
});
