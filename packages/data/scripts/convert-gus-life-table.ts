// Konwersja tablic trwania życia GUS (spec 4.12, 6.4) do datasets/<wersja>/lifeTables.json.
// Użycie: tsx scripts/convert-gus-life-table.ts --input tablica_a.xlsx [--output ścieżka.json] [--accessed YYYY-MM-DD]
// Wejście: plik XLSX „Tablica A” pobrany ręcznie ze strony GUS (stat.gov.pl, „Trwanie życia w 2025 r.”).
// Domyślne wyjście: datasets/2026.11/lifeTables.json; `--output -` wypisuje JSON na stdout.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { arg, fail, parseArgs } from './lib/io';
import { parseGusLifeTableXlsx, type LifeTableSheet } from './lib/lifeTable';

const SOURCE = {
  title: 'Trwanie życia w 2025 r., tablice trwania życia',
  publisher: 'GUS',
  year: 2026,
  url: 'https://stat.gov.pl/obszary-tematyczne/ludnosc/trwanie-zycia/trwanie-zycia-w-2025-r-,2,20.html',
};

const args = parseArgs(process.argv.slice(2));
const input = arg(args, 'input');
if (!input) fail('Brak --input tablica_a.xlsx (XLSX „Tablica A” z GUS)');
const accessed = arg(args, 'accessed') ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(accessed)) fail('--accessed oczekuje formatu YYYY-MM-DD');
const output =
  arg(args, 'output') ??
  fileURLToPath(new URL('../datasets/2026.11/lifeTables.json', import.meta.url));

const bytes = new Uint8Array(readFileSync(input));
const tables = parseGusLifeTableXlsx(bytes);

const param = (value: number, note: string) => ({
  value,
  kind: 'data' as const,
  verified: 'yes' as const,
  sources: [{ ...SOURCE, accessed }],
  note,
});
const sex = (t: LifeTableSheet, label: string) => ({
  qx: t.qx,
  e0: param(t.e0, `Opublikowane e_0, ${label}; punkt kontrolny dla q_x (GUS, Tablica A).`),
  e60: param(t.e60, `Opublikowane e_60, ${label}; punkt kontrolny dla q_x (GUS, Tablica A).`),
  e65: param(t.e65, `Opublikowane e_65, ${label}; punkt kontrolny dla q_x (GUS, Tablica A).`),
});

const result = {
  male: sex(tables.male, 'mężczyźni ogółem'),
  female: sex(tables.female, 'kobiety ogółem'),
  cohortExtraYears: {
    value: 2,
    kind: 'assumption' as const,
    verified: 'no' as const,
    sources: [],
    note: 'Tablice okresowe zaniżają długość życia kohort; opcja „+2 lata” przesuwa ryzyko zgonu o 2 lata wieku (założenie, spec 4.12).',
  },
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (output === '-') process.stdout.write(json);
else {
  writeFileSync(output, json);
  process.stderr.write(`Zapisano ${output} (q_x 0-100, M i K)\n`);
}
