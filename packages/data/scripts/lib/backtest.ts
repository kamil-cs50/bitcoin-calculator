// Backtest (spec T9): rozkład realnych 10- i 20-letnich zwrotów akcji USA z modelu vs okna historyczne Shillera.
// Dane Shillera tylko lokalnie, nie są dołączane do repozytorium (spec 6.5).
import type { RiskyAssetParams, Scenario } from '@sim/engine';
import { MarketSimulator } from '../../../engine/src/models/market';

export interface ShillerRow {
  /** YYYY-MM */
  date: string;
  /** Realna cena z reinwestowanymi dywidendami (kolumna „Real Total Return Price”). */
  realTr: number;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Arkusz „Data” z ie_data.xls (Shiller) wyeksportowany do CSV (separator przecinek). Wiersz nagłówka zaczyna się od
 * „Date” (nagłówek sklejany z czterech wierszy); data ma postać `1871.01`, a `1871.1` to październik (ułamek dziesiętny zapisany bez zera końcowego).
 */
export function parseShillerCsv(text: string): ShillerRow[] {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => splitCsvLine(l)[0]?.trim() === 'Date');
  // nagłówek arkusza jest wielowierszowy („Real” / „Total” / „Return” / „Price” w czterech kolejnych wierszach)
  const stack = h >= 0 ? lines.slice(Math.max(0, h - 3), h + 1).map(splitCsvLine) : [];
  const width = Math.max(0, ...stack.map((r) => r.length));
  const header = Array.from({ length: width }, (_, c) => stack.map((r) => (r[c] ?? '').trim()).filter(Boolean).join(' '));
  const col = header.indexOf('Real Total Return Price');
  if (col < 0) throw new Error('Nie znaleziono kolumny „Real Total Return Price” w wierszu nagłówka (zaczyna się od „Date”)');
  const out: ShillerRow[] = [];
  for (let i = h + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const m = /^(\d{4})\.(\d{1,2})$/.exec((cells[0] ?? '').trim());
    if (!m) continue;
    const month = m[2]!.length === 1 ? Number(m[2]) * 10 : Number(m[2]);
    const v = Number((cells[col] ?? '').trim());
    if (!(month >= 1 && month <= 12) || !Number.isFinite(v) || v <= 0) continue;
    out.push({ date: `${m[1]}-${String(month).padStart(2, '0')}`, realTr: v });
  }
  return out;
}

/** Roczne zwroty złożone (CAGR) z nakładających się okien `months` miesięcy po poziomach indeksu. */
export function rollingCagr(levels: readonly number[], months: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + months < levels.length; i++) out.push(Math.pow(levels[i + months]! / levels[i]!, 12 / months) - 1);
  return out;
}

/** Kwantyl typu 7 (jak R i numpy). */
export function quantile7(x: readonly number[], q: number): number {
  const s = [...x].sort((a, b) => a - b);
  const h = (s.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
}

/** T9: historyczne p5 i p95 leżą między p1 a p99 modelu. */
export function evaluateT9(hist: { p5: number; p95: number }, model: { p1: number; p99: number }): { pass: boolean } {
  return { pass: hist.p5 >= model.p1 && hist.p5 <= model.p99 && hist.p95 >= model.p1 && hist.p95 <= model.p99 };
}

export interface ModelInput {
  asset: { g: number; sigma: number; se: number; alpha: number; b: number };
  market: { nu: number; regime: { p01: number; p10: number; kappa1: number; delta: number } };
  /** Deflator: stała roczna inflacja, którą odejmujemy od nominalnego log-zwrotu. */
  inflation: number;
  /** Skala niepewności parametrów (spec 4.5); 0 = brak. */
  uncertaintyScale: number;
}

/**
 * Realne CAGR akcji z modelu dla horyzontów `years` (jeden przebieg symulatora rynku, wspólne ścieżki dla horyzontów).
 * Zwrot nominalny z `MarketSimulator` (aktywo w walucie bazowej, bez kosztów i podatków), realny = nominalny
 * deflowany stałą inflacją `inflation`; model nie zawiera tu szumu inflacji, więc rozkład jest nieco węższy
 * niż realny z historii (test jest przez to surowszy).
 */
export function modelRealCagr(inp: ModelInput, years: readonly number[], paths: number, seed: number): Map<number, Float64Array> {
  const a = inp.asset;
  const risky: RiskyAssetParams = { kind: 'risky', id: 'usEquity', currency: 'PLN', g: a.g, sigma: a.sigma, se: a.se, alpha: a.alpha, b: a.b, ter: 0, costBps: 0, taxForm: 'none' };
  const maxMonths = Math.max(...years) * 12;
  const s: Scenario = {
    schemaVersion: 1,
    datasetVersion: 'backtest',
    baseCurrency: 'PLN',
    startYear: 2026,
    startMonth: 1,
    horizonMonths: maxMonths,
    assets: [risky],
    positions: [{ assetId: 'usEquity', wrapper: 'taxable', value: 1, costBasis: 1, targetWeight: 1 }],
    market: {
      mode: 'realistic',
      nu: inp.market.nu,
      regime: inp.market.regime,
      factorIds: ['usEquity'],
      correlation: [1],
      inflation: { x0: inp.inflation, mean: inp.inflation, meanSe: 0, phi: 0.8, sigmaEta: 0.001, cpiHistory: Array.from({ length: 13 }, (_, i) => 100 * Math.pow(1 + inp.inflation, i / 12)) },
      fx: [],
      uncertaintyScale: inp.uncertaintyScale,
    },
    events: [],
    rebalance: { kind: 'none' },
    tax: { kind: 'none' },
  };
  const sim = new MarketSimulator(s);
  const st = sim.newState();
  const out = new Map(years.map((y) => [y, new Float64Array(paths)]));
  const defl = Math.log1p(inp.inflation) / 12;
  for (let p = 0; p < paths; p++) {
    sim.initPath(seed, p);
    let cum = 0;
    for (let t = 0; t < maxMonths; t++) {
      sim.step(t, st);
      cum += st.assetLogRet[0]! - defl;
      const y = (t + 1) / 12;
      const arr = out.get(y);
      if (arr) arr[p] = Math.expm1(cum / y);
    }
  }
  return out;
}
