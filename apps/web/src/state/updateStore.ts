import { create } from 'zustand';

export interface UpdateState {
  /** Service worker z nową wersją czeka na zatwierdzenie (registerType 'prompt'). */
  needRefresh: boolean;
  /** Pierwsze wejście: zasoby są w cache, aplikacja działa offline. */
  offlineReady: boolean;
  /** Aktywuje czekającego workera i przeładowuje stronę. */
  apply: (() => void) | null;
  setNeedRefresh: (apply: () => void) => void;
  setOfflineReady: () => void;
}

export const useUpdateStore = create<UpdateState>()((set) => ({
  needRefresh: false,
  offlineReady: false,
  apply: null,
  setNeedRefresh: (apply) => set({ needRefresh: true, apply }),
  setOfflineReady: () => set({ offlineReady: true }),
}));
