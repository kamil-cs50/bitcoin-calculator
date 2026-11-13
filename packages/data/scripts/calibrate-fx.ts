// Kalibracja realnego kursu walutowego (spec 4.7, R-2): σ 12-mies. zmiany ln q i półokres powrotu do PPP.
// Użycie:
//   tsx scripts/calibrate-fx.ts --input usd.csv [--cpi-pl cpi_pl.csv --cpi-foreign cpi_us.csv] [--since 2002-01]
//   tsx scripts/calibrate-fx.ts --fetch USD --from 2002-01-02 --to 2026-11-12 [...]   (NBP, tabela A, okna po 93 dni)
// Kurs: CSV `data;PLN za 1 jednostkę`. Poziomy CPI: CSV `YYYY-MM;poziom`. Bez CPI liczony jest kurs nominalny
// (σ nominalna, brak półokresu). Wypisuje JSON; nie zmienia zbioru danych.
import { fxPhi } from '@sim/engine';
import { loadDatasetNode } from '@sim/data/node';
import { fetchNbpTableA } from './lib/fetch';
import { arg, fail, parseArgs, printJson, readCsvSeries, since, toMonthly, type Point } from './lib/io';
import { annualizedVol, autocorr } from './lib/stats';

const args = parseArgs(process.argv.slice(2));
const input = arg(args, 'input');
const currency = arg(args, 'fetch');
let rate: Point[];
if (input) rate = readCsvSeries(input);
else if (currency) {
  try {
    rate = await fetchNbpTableA(currency, arg(args, 'from') ?? '2002-01-02', arg(args, 'to') ?? new Date().toISOString().slice(0, 10));
  } catch (e) {
    fail(`Pobranie z NBP nie powiodło się: ${e instanceof Error ? e.message : String(e)}. Użyj --input.`);
  }
} else fail('Podaj --input kursy.csv albo --fetch USD|EUR');

const monthlyRate = toMonthly(since(rate, arg(args, 'since')));
const cpiPlPath = arg(args, 'cpi-pl');
const cpiFPath = arg(args, 'cpi-foreign');
const real = Boolean(cpiPlPath && cpiFPath);
const cpiPl = new Map(cpiPlPath ? toMonthly(readCsvSeries(cpiPlPath)).map((p) => [p.date, p.value]) : []);
const cpiF = new Map(cpiFPath ? toMonthly(readCsvSeries(cpiFPath)).map((p) => [p.date, p.value]) : []);

// ln q_t = ln S_t − ln CPI_PL,t + ln CPI_F,t (realny kurs PLN za jednostkę waluty)
const logQ: number[] = [];
for (const p of monthlyRate) {
  if (!real) logQ.push(Math.log(p.value));
  else {
    const a = cpiPl.get(p.date);
    const b = cpiF.get(p.date);
    if (a !== undefined && b !== undefined) logQ.push(Math.log(p.value) - Math.log(a) + Math.log(b));
  }
}
if (logQ.length < 48) fail(`Za mało wspólnych obserwacji miesięcznych (${logQ.length}); potrzeba co najmniej 48`);

const change12 = logQ.slice(12).map((v, i) => v - logQ[i]!);
const mean12 = change12.reduce((a, v) => a + v, 0) / change12.length;
const sigma12 = Math.sqrt(change12.reduce((a, v) => a + (v - mean12) ** 2, 0) / (change12.length - 1));
const phi = autocorr(logQ, 1);
// φ = 2^(−1/(12H)) ⇒ H = −1/(12·log₂φ); sensowne tylko dla 0 < φ < 1 na szeregu realnym
const halfLife = real && phi > 0 && phi < 1 ? -1 / (12 * Math.log2(phi)) : null;
const cur = loadDatasetNode('2026.11').fx[currency?.toUpperCase() as 'USD' | 'EUR'] ?? loadDatasetNode('2026.11').fx.USD;

printJson({
  script: 'calibrate-fx',
  series: real ? 'realny kurs q (z CPI)' : 'NOMINALNY kurs (brak CPI; σ zawyżona względem realnej, półokres niedostępny)',
  window: { months: logQ.length },
  proposed: {
    sigma12m: sigma12,
    sigmaMonthlyLogChangeAnnualized: annualizedVol(logQ.slice(1).map((v, i) => v - logQ[i]!)),
    monthlyPhi: phi,
    halfLifeYears: halfLife,
    phiCheck: halfLife === null ? null : fxPhi(halfLife),
  },
  current: cur ? { sigma: cur.sigma.value, halfLifeYears: cur.halfLifeYears.value } : null,
  note: 'Propozycja; zmiana datasets/2026.11 wymaga akceptacji użytkownika (verified zostaje "no").',
});
