import { loadDataset, type Dataset } from '@sim/data';
import type { Position, Scenario, Wrapper } from '@sim/engine';
import { create } from 'zustand';
import { CURRENT_ID, db } from './db';
import {
  assetFromPreset,
  CURRENT_DATASET_VERSION,
  defaultScenario,
  rebuildMarket,
} from './defaults';
import { migrate } from './migrations';

export type LoadStatus = 'idle' | 'ready' | 'invalid';

export interface NewPosition {
  presetId: string;
  /** Wartość w walucie bazowej. */
  value: number;
  /** Domyślnie równa wartości (brak zysku/straty na starcie). */
  costBasis?: number;
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
  setScenario: (s: Scenario) => void;
  addPosition: (p: NewPosition) => void;
  updatePosition: (index: number, patch: Partial<Position>) => void;
  removePosition: (index: number) => void;
  /** „Zacznij od nowa”: domyślny scenariusz; kolejny zapis nadpisze uszkodzony wpis. */
  resetScenario: () => void;
  loadSaved: () => Promise<void>;
  saveNow: () => Promise<void>;
  /** „Pobierz kopię danych”: surowy, niezmieniony zapis jako tekst JSON. */
  exportRawBackup: () => string;
}

const dataset = loadDataset(CURRENT_DATASET_VERSION);

/** Surowy zapis z nieudanego wczytania (dla kopii); poza stanem, bo nie jest renderowany. */
let rawBackup: unknown = null;

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

  setScenario: (scenario) => set({ scenario }),

  addPosition: (p) =>
    set((st) => {
      const asset = st.scenario.assets.find((a) => a.id === p.presetId) ?? assetFromPreset(st.dataset, p.presetId);
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
        scenario: syncAssets({ ...st.scenario, positions: [...st.scenario.positions, position] }, st.dataset, assets),
      };
    }),

  updatePosition: (index, patch) =>
    set((st) => {
      const cur = st.scenario.positions[index];
      if (!cur) return st;
      const positions = st.scenario.positions.map((x, i) => (i === index ? { ...x, ...patch } : x));
      return { scenario: { ...st.scenario, positions } };
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

  loadSaved: async () => {
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
    if (state.scenario === prev.scenario) return;
    clearTimeout(timer);
    timer = setTimeout(() => void useScenarioStore.getState().saveNow(), delayMs);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
