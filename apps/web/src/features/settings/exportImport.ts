import type { Scenario } from '@sim/engine';
import { migrate } from '../../state/migrations';

export type ImportResult = { ok: true; scenario: Scenario } | { ok: false; reason: string };

/** Plik eksportu = sam scenariusz (z `schemaVersion`), czytelny JSON. */
export function exportScenario(s: Scenario): string {
  return JSON.stringify(s, null, 2);
}

/** Wczytuje tekst pliku przez te same migracje i schemat co zapis lokalny; nigdy nie rzuca. */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  return migrate(raw);
}

/** Pobranie pliku tekstowego w przeglądarce (bez serwera). */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
