// Parametry dwureżimowe (p01, p10, κ₁, Δ, ν) z miesięcznego szeregu użytkownika (EM + filtr Hamiltona, t-Student).
// Użycie: tsx scripts/calibrate-regimes.ts --input msci.csv [--since 1990-01]
// Plik: CSV `data;poziom`. Wypisuje JSON; nie zmienia zbioru danych.
import { loadDatasetNode } from '@sim/data/node';
import { arg, fail, parseArgs, printJson, readCsvSeries, since, toMonthly } from './lib/io';
import { fitTwoRegime, logReturns } from './lib/stats';

const args = parseArgs(process.argv.slice(2));
const input = arg(args, 'input');
if (!input) fail('Brak --input poziomy.csv');

const lv = toMonthly(since(readCsvSeries(input), arg(args, 'since')));
if (lv.length < 121) fail(`Za mało obserwacji miesięcznych (${lv.length}); potrzeba co najmniej 121 (10 lat)`);
const fit = fitTwoRegime(logReturns(lv.map((p) => p.value)));
const cur = loadDatasetNode('2026.11').market;

printJson({
  script: 'calibrate-regimes',
  window: { from: lv[0]!.date, to: lv[lv.length - 1]!.date, months: lv.length - 1 },
  proposed: fit,
  current: {
    p01: cur.regime.p01.value,
    p10: cur.regime.p10.value,
    kappa1: cur.regime.kappa1.value,
    delta: cur.regime.delta.value,
    nu: cur.nu.value,
  },
  note: 'Propozycja; zmiana datasets/2026.11 wymaga akceptacji użytkownika (verified zostaje "no").',
});
