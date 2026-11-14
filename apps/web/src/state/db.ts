import Dexie, { type Table } from 'dexie';

export interface ScenarioRow {
  id: string;
  name: string;
  updatedAt: number;
  /** Surowe dane: czytane zawsze przez migrate(), nigdy zakładane jako poprawne. */
  data: unknown;
}

/** Zapis lokalny (IndexedDB). Dane portfela zostają na urządzeniu; brak jakiejkolwiek sieci. */
class SimDb extends Dexie {
  scenarios!: Table<ScenarioRow, string>;

  constructor() {
    super('portfolio-simulator');
    this.version(1).stores({ scenarios: 'id, updatedAt' });
  }
}

export const db: Dexie & { scenarios: Table<ScenarioRow, string> } = new SimDb();

/** Id wpisu z bieżącym scenariuszem (jeden aktywny plan; porównania dojdą z własnymi id). */
export const CURRENT_ID = 'current';
