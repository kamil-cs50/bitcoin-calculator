import { create } from 'zustand';

const KEY = 'ui:expert';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export interface UiState {
  /** Tryb eksperta: odsłania średnią, kontrolę modelu i 25 000 ścieżek (spec 5.2). */
  expert: boolean;
  setExpert: (v: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  expert: read(),
  setExpert: (expert) => {
    try {
      localStorage.setItem(KEY, expert ? '1' : '0');
    } catch {
      // bez localStorage: preferencja żyje tylko do końca sesji
    }
    set({ expert });
  },
}));
