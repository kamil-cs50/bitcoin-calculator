import type { Scenario } from '@sim/engine';
import { ScenarioSchema } from './scenarioSchema';

export type MigrationResult = { ok: true; scenario: Scenario } | { ok: false; reason: string };

/** Najnowsza wersja schematu zapisu. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Kolejne kroki migracji: klucz N przekształca dane wersji N na wersję N+1. Na razie jest
 * tylko wersja 1, więc tabela jest pusta; nowa wersja schematu dopisuje tu krok i podnosi
 * CURRENT_SCHEMA_VERSION. Wersje starsze niż 1 oraz nowsze niż bieżąca nie są wspierane
 * (zapis z nowszej aplikacji nie może być cicho przycięty).
 */
const STEPS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

/**
 * Wczytuje surowy zapis do Scenario. Nigdy nie rzuca: każdy błąd wraca jako `ok: false`
 * z powodem, żeby UI mogło pokazać propozycję resetu zamiast białego ekranu. Starszy
 * `datasetVersion` nie jest błędem (zapis zachowuje własne parametry); flagę
 * „zbiór danych nieaktualny” ustawia store.
 */
export function migrate(raw: unknown): MigrationResult {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, reason: 'invalid-format' };
    }
    let cur = raw as Record<string, unknown>;
    const v = cur.schemaVersion;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return { ok: false, reason: 'invalid-format' };
    }
    if (v < 1 || v > CURRENT_SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version' };
    for (let ver = v; ver < CURRENT_SCHEMA_VERSION; ver++) {
      const step = STEPS[ver];
      if (!step) return { ok: false, reason: 'unsupported-version' };
      cur = { ...step(cur), schemaVersion: ver + 1 };
    }
    const parsed = ScenarioSchema.safeParse(cur);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.') ?? '';
      return { ok: false, reason: `invalid-data: ${path ? `${path}: ` : ''}${issue?.message ?? ''}` };
    }
    return { ok: true, scenario: parsed.data };
  } catch (e) {
    return { ok: false, reason: `invalid-data: ${e instanceof Error ? e.message : String(e)}` };
  }
}
