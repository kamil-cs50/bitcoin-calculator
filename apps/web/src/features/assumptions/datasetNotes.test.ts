import { loadDataset } from '@sim/data';
import { afterEach, describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n';
import { CURRENT_DATASET_VERSION } from '../../state/defaults';
import { DATASET_NOTES } from './datasetNotes';
import { noteText } from './ParamRow';

/** Zbiera wszystkie pola `note` z drzewa zbioru danych. */
function collectNotes(o: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(o)) o.forEach((v) => collectNotes(v, out));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'note' && typeof v === 'string') out.add(v);
      else collectNotes(v, out);
    }
  }
  return out;
}

afterEach(() => activateLocale('pl'));

describe('notatki zbioru danych', () => {
  it('każda notatka zbioru danych ma wpis do tłumaczenia (nowa notatka bez wpisu czerwieni test)', () => {
    const missing = [...collectNotes(loadDataset(CURRENT_DATASET_VERSION))].filter((n) => !(n in DATASET_NOTES));
    expect(missing).toEqual([]);
  });

  it('po polsku zwraca oryginał, po angielsku tłumaczenie, a nieznaną notatkę bez zmian', async () => {
    const note = 'Założenie.';
    expect(noteText(note)).toBe(note);
    await activateLocale('en');
    expect(noteText(note)).toBe('Assumption.');
    expect(noteText('Nieznana notatka')).toBe('Nieznana notatka');
  });
});
