// Kalibracja procesu inflacji (spec 4.6): sd i autokorelacja (lag 12) ln(1+r/r) z szeregu poziomów CPI.
// Użycie: tsx scripts/calibrate-inflation.ts --input cpi.csv [--since 2000-01]
// Wejście: CSV `YYYY-MM;poziom CPI` (np. GUS, bank danych lokalnych). Wypisuje JSON; nie zmienia zbioru danych.
import { calibrateInflation } from '@sim/engine';
import { loadDatasetNode } from '@sim/data/node';
import { autocorr } from './lib/stats';
import { arg, fail, parseArgs, printJson, readCsvSeries, since, toMonthly } from './lib/io';

const args = parseArgs(process.argv.slice(2));
const input = arg(args, 'input');
if (!input) fail('Brak --input cpi.csv (CSV: YYYY-MM;poziom CPI)');

const levels = toMonthly(since(readCsvSeries(input), arg(args, 'since')));
if (levels.length < 36) fail(`Za mało obserwacji (${levels.length}); potrzeba co najmniej 36 miesięcy`);

// ℓ_t = ln(L_t / L_{t−12}) = ln(1 + yy_t)
const ell: number[] = [];
for (let i = 12; i < levels.length; i++) ell.push(Math.log(levels[i]!.value / levels[i - 12]!.value));
const mean = ell.reduce((a, v) => a + v, 0) / ell.length;
const sd = Math.sqrt(ell.reduce((a, v) => a + (v - mean) ** 2, 0) / (ell.length - 1));
const rho12 = autocorr(ell, 12);
const ds = loadDatasetNode('2026.11').inflation;

let calibrated: { phi: number; sigmaEta: number } | { error: string };
try {
  calibrated = calibrateInflation(sd, rho12);
} catch (e) {
  calibrated = { error: e instanceof Error ? e.message : String(e) };
}

printJson({
  script: 'calibrate-inflation',
  window: { from: levels[0]!.date, to: levels[levels.length - 1]!.date, months: levels.length },
  proposed: {
    yoySd: sd,
    yoyAutocorr12: rho12,
    longRun: Math.exp(mean) - 1,
    ...('error' in calibrated ? { calibration: calibrated } : { phi: calibrated.phi, sigmaEta: calibrated.sigmaEta }),
  },
  current: { yoySd: ds.yoySd.value, yoyAutocorr12: ds.yoyAutocorr12.value, longRun: ds.longRun.value },
  note: 'Propozycja; zmiana datasets/2026.11 wymaga akceptacji użytkownika (verified zostaje "no").',
});
