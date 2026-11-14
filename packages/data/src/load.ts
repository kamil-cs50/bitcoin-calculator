import { DatasetSchema, type Dataset } from './schema';

// Pliki JSON są importowane przez import.meta.glob (Vite i Vitest), więc działają
// w bundlu przeglądarkowym bez fs. Gdy plików jeszcze nie ma, glob jest pusty.
const FILES = import.meta.glob('../datasets/*/*.json', { eager: true, import: 'default' });

const PARTS = ['assets', 'crypto', 'market', 'inflation', 'fx', 'edo', 'taxPL'] as const;

export type DatasetVersion = '2026.11';

/** Wersje, dla których istnieje komplet plików JSON. */
export function availableVersions(): string[] {
  const versions = new Set<string>();
  for (const path of Object.keys(FILES)) {
    const m = /\/datasets\/([^/]+)\//.exec(path);
    if (m?.[1]) versions.add(m[1]);
  }
  return [...versions].filter((v) =>
    PARTS.every((p) => `../datasets/${v}/${p}.json` in FILES),
  );
}

export function loadDataset(version: DatasetVersion): Dataset {
  if (!availableVersions().includes(version)) {
    throw new Error(`Brak zbioru danych w wersji ${String(version)}`);
  }
  const raw: Record<string, unknown> = { version };
  for (const p of PARTS) raw[p] = FILES[`../datasets/${version}/${p}.json`];
  return DatasetSchema.parse(raw);
}
