import { loadDataset, type Dataset } from '@sim/data';
import { defaultWrapperSettings, type Position, type Scenario, type Wrapper } from '@sim/engine';
import { create } from 'zustand';
import { COMPARE_ID, CURRENT_ID, db } from './db';
import {
  assetFromPreset,
  CURRENT_DATASET_VERSION,
  defaultScenario,
  etfId,
  rebuildMarket,
} from './defaults';
import { migrate } from './migrations';

/** Wiek zakładany do czasu, aż użytkownik wpisze własny (reguły IKE od 60 lat, IKZE od 65). */
const DEFAULT_AGE = 35;

/** Pierwsze opakowanie IKE/IKZE w scenariuszu włącza limity wpłat i reguły wypłat z ustawieniami domyślnymi. */
function withWrappers(sc: Scenario, wrapper: Wrapper | undefined): Scenario {
  if (!wrapper || wrapper === 'taxable' || sc.wrappers) return sc;
  return { ...sc, wrappers: defaultWrapperSettings(sc.startYear, DEFAULT_AGE, sc.market.inflation.mean + 0.01) };
}

/** Najwyżej tyle scenariuszy naraz w porównaniu (spec 4.15). */
export const MAX_COMPARE = 3;

export interface CompareEntry {
  id: string;
  name: string;
  scenario: Scenario;
}

export type LoadStatus = 'idle' | 'ready' | 'invalid';

export interface NewPosition {
  presetId: string;
  /** Wartość w walucie bazowej. */
  value: number;
  /** Domyślnie równa wartości (brak zysku/straty na starcie). */
  costBasis?: number;
  /** Wariant ETF/ETP tego samego instrumentu (osobne aktywo z podatkiem papieru wartościowego). */
  etf?: boolean;
  wrapper?: Wrapper;
  /** Wagi są względne (rebalans je normalizuje); domyślnie wartość pozycji. */
  targetWeight?: number;
}

export interface ScenarioState {
  scenario: Scenario;
  dataset: Dataset;
  /** `invalid`: zapis w IndexedDB nie dał się wczytać; UI pokazuje kartę z propozycją resetu. */
  loadStatus: LoadStatus;
  loadError: string | null;
  /** Zapis z innej wersji zbioru danych niż dołączona do aplikacji (parametry zachowane). */
  datasetOutdated: boolean;
  /** Błąd samego zapisu lokalnego (np. IndexedDB niedostępne); aplikacja działa dalej. */
  storageError: string | null;
  /** Migawki scenariuszy do porównania na wspólnych liczbach losowych (maks. `MAX_COMPARE`). */
  compareList: CompareEntry[];
  /** Dodaje migawkę bieżącego scenariusza; `false`, gdy lista jest pełna. */
  addToCompare: (name: string) => boolean;
  removeFromCompare: (id: string) => void;
  setScenario: (s: Scenario) => void;
  addPosition: (p: NewPosition) => void;
  updatePosition: (index: number, patch: Partial<Position>) => void;
  removePosition: (index: number) => void;
  /** „Zacznij od nowa”: domyślny scenariusz; kolejny zapis nadpisze uszkodzony wpis. */
  resetScenario: () => void;
  /**
   * „Zaktualizuj parametry”: aktywa z presetów i rynek odbudowane z bieżącego zbioru danych; pozycje, plan
   * i aktywa własne zostają, tryb rynku i mnożnik niepewności też. Gasi flagę `datasetOutdated`.
   */
  updateDataset: () => void;
  loadSaved: () => Promise<void>;
  saveNow: () => Promise<void>;
  /** „Pobierz kopię danych”: surowy, niezmieniony zapis jako tekst JSON. */
  exportRawBackup: () => string;
}

const dataset = loadDataset(CURRENT_DATASET_VERSION);

/** Surowy zapis z nieudanego wczytania (dla kopii); poza stanem, bo nie jest renderowany. */
let rawBackup: unknown = null;

let compareSeq = 0;
const newCompareId = (): string => `cmp-${Date.now().toString(36)}-${compareSeq++}`;

/** Wpis porównań z bazy: każdy scenariusz przechodzi migrate(); uszkodzone są pomijane. */
function parseCompare(data: unknown): CompareEntry[] {
  const raw = (data as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(raw)) return [];
  const out: CompareEntry[] = [];
  for (const e of raw) {
    const r = migrate((e as { scenario?: unknown } | null)?.scenario);
    const id = (e as { id?: unknown } | null)?.id;
    const name = (e as { name?: unknown } | null)?.name;
    if (r.ok && typeof id === 'string' && typeof name === 'string') out.push({ id, name, scenario: r.scenario });
  }
  return out.slice(0, MAX_COMPARE);
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Usuwa aktywa bez pozycji i odbudowuje czynniki/kursy/korelacje rynku. */
function syncAssets(s: Scenario, d: Dataset, assets: Scenario['assets']): Scenario {
  const used = new Set(s.positions.map((p) => p.assetId));
  const kept = assets.filter((a) => used.has(a.id));
  return { ...s, assets: kept, market: rebuildMarket(d, s.market, kept, s.baseCurrency) };
}

export const useScenarioStore = create<ScenarioState>()((set, get) => ({
  scenario: defaultScenario(dataset),
  dataset,
  loadStatus: 'idle',
  loadError: null,
  datasetOutdated: false,
  storageError: null,

  compareList: [],

  addToCompare: (name) => {
    if (get().compareList.length >= MAX_COMPARE) return false;
    set((st) => ({ compareList: [...st.compareList, { id: newCompareId(), name, scenario: st.scenario }] }));
    return true;
  },

  removeFromCompare: (id) => set((st) => ({ compareList: st.compareList.filter((e) => e.id !== id) })),

  setScenario: (scenario) => set({ scenario }),

  addPosition: (p) =>
    set((st) => {
      const id = p.etf ? etfId(p.presetId) : p.presetId;
      const asset = st.scenario.assets.find((a) => a.id === id) ?? assetFromPreset(st.dataset, id);
      const position: Position = {
        assetId: asset.id,
        wrapper: p.wrapper ?? 'taxable',
        value: p.value,
        costBasis: p.costBasis ?? p.value,
        targetWeight: p.targetWeight ?? p.value,
      };
      const assets = st.scenario.assets.some((a) => a.id === asset.id)
        ? st.scenario.assets
        : [...st.scenario.assets, asset];
      return {
        scenario: withWrappers(
          syncAssets({ ...st.scenario, positions: [...st.scenario.positions, position] }, st.dataset, assets),
          position.wrapper,
        ),
      };
    }),

  updatePosition: (index, patch) =>
    set((st) => {
      const cur = st.scenario.positions[index];
      if (!cur) return st;
      const positions = st.scenario.positions.map((x, i) => (i === index ? { ...x, ...patch } : x));
      return { scenario: withWrappers({ ...st.scenario, positions }, patch.wrapper) };
    }),

  removePosition: (index) =>
    set((st) => {
      if (!st.scenario.positions[index]) return st;
      const positions = st.scenario.positions.filter((_, i) => i !== index);
      return { scenario: syncAssets({ ...st.scenario, positions }, st.dataset, st.scenario.assets) };
    }),

  resetScenario: () => {
    rawBackup = null;
    set((st) => ({
      scenario: defaultScenario(st.dataset),
      loadStatus: 'ready',
      loadError: null,
      datasetOutdated: false,
    }));
  },

  updateDataset: () =>
    set((st) => {
      const assets = st.scenario.assets.map((a) => {
        if (a.id.startsWith('custom:')) return a;
        try {
          return assetFromPreset(st.dataset, a.id);
        } catch {
          return a; // nieznany preset: zostawiamy parametry zapisu
        }
      });
      const fresh = rebuildMarket(st.dataset, defaultScenario(st.dataset).market, assets, st.scenario.baseCurrency);
      const { mode, uncertaintyScale } = st.scenario.market;
      return {
        scenario: {
          ...st.scenario,
          datasetVersion: st.dataset.version,
          assets,
          market: { ...fresh, mode, uncertaintyScale },
        },
        datasetOutdated: false,
      };
    }),

  loadSaved: async () => {
    try {
      const cmp = await db.scenarios.get(COMPARE_ID);
      set({ compareList: cmp ? parseCompare(cmp.data) : [] });
    } catch {
      // brak IndexedDB: obsłuży to poniższe wczytanie bieżącego scenariusza
    }
    let row;
    try {
      row = await db.scenarios.get(CURRENT_ID);
    } catch (e) {
      // IndexedDB niedostępne (tryb prywatny, zablokowane dane): działamy bez zapisu.
      set({ loadStatus: 'ready', storageError: errMsg(e) });
      return;
    }
    if (!row) {
      set({ loadStatus: 'ready', loadError: null, storageError: null });
      return;
    }
    const r = migrate(row.data);
    if (!r.ok) {
      rawBackup = row.data;
      set({ loadStatus: 'invalid', loadError: r.reason, storageError: null });
      return;
    }
    rawBackup = null;
    set({
      scenario: r.scenario,
      loadStatus: 'ready',
      loadError: null,
      storageError: null,
      datasetOutdated: r.scenario.datasetVersion !== CURRENT_DATASET_VERSION,
    });
  },

  saveNow: async () => {
    // Dopóki użytkownik nie zdecyduje, co zrobić z uszkodzonym wpisem, nie nadpisujemy go.
    if (get().loadStatus === 'invalid') return;
    try {
      await db.scenarios.put({
        id: CURRENT_ID,
        name: 'Bieżący plan',
        updatedAt: Date.now(),
        data: get().scenario,
      });
      const cmp = get().compareList;
      if (cmp.length > 0) {
        await db.scenarios.put({ id: COMPARE_ID, name: 'Porównanie', updatedAt: Date.now(), data: { entries: cmp } });
      } else {
        await db.scenarios.delete(COMPARE_ID);
      }
      set({ storageError: null });
    } catch (e) {
      set({ storageError: errMsg(e) });
    }
  },

  exportRawBackup: () => JSON.stringify(rawBackup ?? get().scenario, null, 2),
}));

/**
 * Automatyczny zapis po zmianie scenariusza (z opóźnieniem). Zwraca funkcję odpinającą.
 * Do wywołania raz po `loadSaved()`; zapisuje tylko, gdy wczytywanie się powiodło.
 */
export function startAutosave(delayMs = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useScenarioStore.subscribe((state, prev) => {
    if (state.scenario === prev.scenario && state.compareList === prev.compareList) return;
    clearTimeout(timer);
    timer = setTimeout(() => void useScenarioStore.getState().saveNow(), delayMs);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
