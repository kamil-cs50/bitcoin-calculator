import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatasetSchema, type Dataset } from './schema';

// Wariant loadDataset dla czystego Node (skrypty, tsx): czyta pliki z dysku przez fs,
// bez import.meta.glob (który działa tylko w Vite/Vitest). Dostępny jako `@sim/data/node`.
const PARTS = ['assets', 'crypto', 'market', 'inflation', 'fx', 'edo', 'taxPL'] as const;
const DATASETS_DIR = fileURLToPath(new URL('../datasets/', import.meta.url));

/** Wersje, dla których istnieje komplet plików JSON. */
export function availableVersionsNode(): string[] {
  if (!existsSync(DATASETS_DIR)) return [];
  return readdirSync(DATASETS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((v) => PARTS.every((p) => existsSync(`${DATASETS_DIR}${v}/${p}.json`)));
}

export function loadDatasetNode(version: string): Dataset {
  if (!availableVersionsNode().includes(version)) {
    throw new Error(`Brak zbioru danych w wersji ${version}`);
  }
  const raw: Record<string, unknown> = { version };
  for (const p of PARTS) {
    raw[p] = JSON.parse(readFileSync(`${DATASETS_DIR}${version}/${p}.json`, 'utf8')) as unknown;
  }
  return DatasetSchema.parse(raw);
}
