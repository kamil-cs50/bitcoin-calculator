import { readFileSync } from 'node:fs';

export interface Point {
  /** YYYY-MM-DD albo YYYY-MM */
  date: string;
  value: number;
}

/** Wczytuje CSV `data;wartość` (separator `,` lub `;`, nagłówek opcjonalny, przecinek dziesiętny przy `;`). */
export function parseCsvSeries(text: string): Point[] {
  const out: Point[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const sep = t.includes(';') ? ';' : ',';
    const cells = t.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const date = cells[0] ?? '';
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(date)) continue; // nagłówek, komentarz
    const raw = (cells[1] ?? '').replace(sep === ';' ? ',' : '', sep === ';' ? '.' : '');
    const value = Number(raw);
    if (raw !== '' && Number.isFinite(value)) out.push({ date, value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function readCsvSeries(path: string): Point[] {
  return parseCsvSeries(readFileSync(path, 'utf8'));
}

/** Ostatnia obserwacja każdego miesiąca; klucz `YYYY-MM`. */
export function toMonthly(points: Point[]): Point[] {
  const byMonth = new Map<string, number>();
  for (const p of points) byMonth.set(p.date.slice(0, 7), p.value);
  return [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

/** Zostawia obserwacje od miesiąca `since` (YYYY-MM) włącznie. */
export function since(points: Point[], from: string | undefined): Point[] {
  return from ? points.filter((p) => p.date.slice(0, 7) >= from) : points;
}

export interface Args {
  flags: Map<string, string[]>;
}

/** `--klucz wartość` (powtarzalne); `--flaga` bez wartości daje „true”. */
export function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    const val = next !== undefined && !next.startsWith('--') ? (i++, next) : 'true';
    flags.set(key, [...(flags.get(key) ?? []), val]);
  }
  return { flags };
}

export function arg(a: Args, key: string): string | undefined {
  return a.flags.get(key)?.[a.flags.get(key)!.length - 1];
}

export function argAll(a: Args, key: string): string[] {
  return a.flags.get(key) ?? [];
}

export function printJson(v: unknown): void {
  process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
}

export function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}
