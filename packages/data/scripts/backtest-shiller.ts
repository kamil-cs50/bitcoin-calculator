// Backtest modelu (spec T9): 10- i 20-letnie realne zwroty akcji USA z modelu vs okna historyczne (Shiller).
// Użycie: tsx scripts/backtest-shiller.ts --input ie_data-Data.csv [--since 1871-01] [--paths 20000] [--seed 20261113]
//         [--write-md ../../docs/BACKTEST.md]
// Wejście: arkusz „Data” z ie_data.xls (shillerdata.com) wyeksportowany do CSV (np. `soffice --headless --convert-to csv`).
// Dane nie są dołączane do repozytorium (spec 6.5); skrypt czyta plik lokalny. Kod wyjścia 1, gdy T9 nie przechodzi.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadDatasetNode } from '@sim/data/node';
import { arg, fail, parseArgs, printJson } from './lib/io';
import { evaluateT9, modelRealCagr, parseShillerCsv, quantile7, rollingCagr } from './lib/backtest';

const args = parseArgs(process.argv.slice(2));
const input = arg(args, 'input');
if (!input) fail('Brak --input ie_data-Data.csv (arkusz „Data” Shillera zapisany jako CSV)');
const from = arg(args, 'since');
const paths = Number(arg(args, 'paths') ?? 20000);
const seed = Number(arg(args, 'seed') ?? 20261113);
if (!(paths >= 1000)) fail('--paths musi być >= 1000');

const rows = parseShillerCsv(readFileSync(input, 'utf8')).filter((r) => !from || r.date >= from);
if (rows.length < 12 * 21) fail(`Za mało obserwacji (${rows.length}); potrzeba co najmniej 21 lat`);
const levels = rows.map((r) => r.realTr);
const histInflationNote = 'deflator modelu = długookresowa inflacja ze zbioru danych (nie z historii USA)';

const ds = loadDatasetNode('2026.11');
const eq = ds.assets.usEquity;
if (!eq) fail('Zbiór danych nie ma aktywa usEquity');
const reg = ds.market.regime;
const asset = { g: eq.g.value, sigma: eq.sigma.value, se: eq.se.value, alpha: eq.alpha.value, b: eq.b.value };
const market = { nu: ds.market.nu.value, regime: { p01: reg.p01.value, p10: reg.p10.value, kappa1: reg.kappa1.value, delta: reg.delta.value } };
const inflation = ds.inflation.longRun.value;

const YEARS = [10, 20] as const;
const q = (x: ArrayLike<number>, p: number): number => quantile7(Array.from(x), p);

interface Variant {
  name: string;
  uncertaintyScale: number;
}
const variants: Variant[] = [
  { name: 'z niepewnością parametrów (tak jak w aplikacji, skala 1)', uncertaintyScale: 1 },
  { name: 'bez niepewności parametrów (skala 0)', uncertaintyScale: 0 },
];

const result = YEARS.map((y) => {
  const cagr = rollingCagr(levels, y * 12);
  const hist = { windows: cagr.length, p1: q(cagr, 0.01), p5: q(cagr, 0.05), p50: q(cagr, 0.5), p95: q(cagr, 0.95), p99: q(cagr, 0.99) };
  const models = variants.map((v) => {
    const sim = modelRealCagr({ asset, market, inflation, uncertaintyScale: v.uncertaintyScale }, [y], paths, seed).get(y)!;
    const m = { p1: q(sim, 0.01), p5: q(sim, 0.05), p50: q(sim, 0.5), p95: q(sim, 0.95), p99: q(sim, 0.99) };
    const below = cagr.filter((c) => c < m.p1).length / cagr.length;
    const above = cagr.filter((c) => c > m.p99).length / cagr.length;
    return { variant: v.name, ...m, histBelowModelP1: below, histAboveModelP99: above, T9: evaluateT9(hist, m).pass };
  });
  return { years: y, historical: hist, models };
});

const out = {
  script: 'backtest-shiller',
  criterion: 'T9: historyczny p5 i p95 leżą między p1 a p99 modelu',
  window: { from: rows[0]!.date, to: rows[rows.length - 1]!.date, months: rows.length },
  model: { paths, seed, asset, market, inflation, note: histInflationNote, datasetVersion: '2026.11' },
  results: result,
  T9: result.every((r) => r.models[0]!.T9),
};
printJson(out);

const mdPath = arg(args, 'write-md');
if (mdPath) {
  const pct = (v: number): string => `${(v * 100).toFixed(1).replace('.', ',')}%`;
  const lines: string[] = [];
  lines.push(`Wykonano: ${new Date().toISOString().slice(0, 10)}, plik wejściowy: arkusz „Data” ie_data.xls (okno ${out.window.from} do ${out.window.to}, ${rows.length} miesięcy), model: zbiór danych 2026.11, ${paths} ścieżek, ziarno ${seed}.`);
  lines.push('');
  lines.push(`Parametry modelu (aktywo \`usEquity\`): g = ${pct(asset.g)}, σ = ${pct(asset.sigma)}, se = ${pct(asset.se)}, α = ${asset.alpha}, b = ${asset.b}; ν = ${market.nu}; reżimy p01 = ${market.regime.p01}, p10 = ${market.regime.p10}, κ₁ = ${market.regime.kappa1}, Δ = ${market.regime.delta}; deflator ${pct(inflation)} rocznie.`);
  lines.push('');
  lines.push('Roczne zwroty złożone (CAGR), realne, z reinwestowanymi dywidendami; okna historyczne nakładają się (efektywnie mało niezależnych obserwacji).');
  lines.push('');
  lines.push('| Horyzont | Źródło | Okna / ścieżki | p1 | p5 | p50 | p95 | p99 | T9 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of result) {
    const h = r.historical;
    lines.push(`| ${r.years} lat | historia | ${h.windows} | ${pct(h.p1)} | ${pct(h.p5)} | ${pct(h.p50)} | ${pct(h.p95)} | ${pct(h.p99)} | |`);
    for (const m of r.models) lines.push(`| ${r.years} lat | model, ${m.variant} | ${paths} | ${pct(m.p1)} | ${pct(m.p5)} | ${pct(m.p50)} | ${pct(m.p95)} | ${pct(m.p99)} | ${m.T9 ? 'przechodzi' : 'NIE przechodzi'} |`);
  }
  lines.push('');
  lines.push(`Wynik T9 (wariant z niepewnością parametrów, oba horyzonty): **${out.T9 ? 'przechodzi' : 'NIE przechodzi'}**.`);
  const block = `<!-- backtest:begin -->\n${lines.join('\n')}\n<!-- backtest:end -->`;
  if (!existsSync(mdPath)) fail(`Brak pliku ${mdPath}`);
  const cur = readFileSync(mdPath, 'utf8');
  if (!/<!-- backtest:begin -->[\s\S]*<!-- backtest:end -->/.test(cur)) fail(`${mdPath} nie zawiera znaczników backtest:begin/end`);
  writeFileSync(mdPath, cur.replace(/<!-- backtest:begin -->[\s\S]*<!-- backtest:end -->/, () => block));
  process.stderr.write(`Zapisano wynik w ${mdPath}\n`);
}
process.exitCode = out.T9 ? 0 : 1;
