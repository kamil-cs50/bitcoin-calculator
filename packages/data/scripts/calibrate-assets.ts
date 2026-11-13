// Statystyki aktywów z plików użytkownika (indeksy akcji itp., poziomy cen lub total return).
// Użycie: tsx scripts/calibrate-assets.ts --input globalEquity=msci.csv --input wigEquity=wig.csv [--since 2000-01]
// Plik: CSV `data;poziom` (dzienny lub miesięczny). Wypisuje JSON; nie zmienia zbioru danych.
import { loadDatasetNode } from '@sim/data/node';
import { argAll, arg, fail, parseArgs, printJson, readCsvSeries, since, toMonthly } from './lib/io';
import { annualizedVol, autocorr, ledoitWolfShrink, logReturns } from './lib/stats';

const args = parseArgs(process.argv.slice(2));
const inputs = argAll(args, 'input').map((s) => {
  const i = s.indexOf('=');
  if (i <= 0) fail(`--input oczekuje formatu id=ścieżka.csv, otrzymano: ${s}`);
  return [s.slice(0, i), s.slice(i + 1)] as const;
});
if (inputs.length === 0) fail('Brak --input id=ścieżka.csv');

const ds = loadDatasetNode('2026.11');
const series = new Map<string, Map<string, number>>(); // id → (miesiąc → log-zwrot)
const stats: Record<string, unknown> = {};
for (const [id, path] of inputs) {
  const lv = toMonthly(since(readCsvSeries(path), arg(args, 'since')));
  if (lv.length < 25) fail(`${id}: za mało obserwacji miesięcznych (${lv.length})`);
  const r = logReturns(lv.map((p) => p.value));
  series.set(id, new Map(r.map((v, i) => [lv[i + 1]!.date, v])));
  const meanM = r.reduce((a, v) => a + v, 0) / r.length;
  const cur = ds.assets[id];
  stats[id] = {
    months: r.length,
    window: { from: lv[0]!.date, to: lv[lv.length - 1]!.date },
    proposed: { sigma: annualizedVol(r), meanLogReturnAnnual: meanM * 12, autocorr1: autocorr(r, 1) },
    current: cur && 'sigma' in cur ? { sigma: cur.sigma.value } : null,
  };
}

let correlation: unknown = null;
if (series.size >= 2) {
  const ids = [...series.keys()];
  const months = [...series.get(ids[0]!)!.keys()].filter((m) => ids.every((id) => series.get(id)!.has(m)));
  if (months.length >= 24) {
    correlation = {
      ids,
      commonMonths: months.length,
      matrix: ledoitWolfShrink(months.map((m) => ids.map((id) => series.get(id)!.get(m)!))),
    };
  }
}

printJson({
  script: 'calibrate-assets',
  assets: stats,
  correlationLedoitWolf: correlation,
  note: 'Propozycja; zmiana datasets/2026.11 wymaga akceptacji użytkownika (verified zostaje "no").',
});
