import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initLocale } from './state/localeStore';
import { startAutosave, useScenarioStore } from './state/scenarioStore';
import { applyTheme, useThemeStore } from './state/themeStore';
import { useUpdateStore } from './state/updateStore';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';

applyTheme(useThemeStore.getState().theme);

// registerType 'prompt': nowy service worker czeka na zgodę użytkownika (baner w Layout i Ustawieniach).
const updateSW = registerSW({
  onNeedRefresh: () => useUpdateStore.getState().setNeedRefresh(() => void updateSW(true)),
  onOfflineReady: () => useUpdateStore.getState().setOfflineReady(),
});

// Najpierw wczytujemy zapis z IndexedDB (bez błyskania pustym planem), potem włączamy autozapis.
// loadSaved sam łapie błędy IndexedDB (ustawia storageError), więc render nigdy nie czeka w nieskończoność.
// Język zapisany w Ustawieniach (np. angielski, ładowany leniwie) jest aktywny przed pierwszym renderem.
void Promise.all([useScenarioStore.getState().loadSaved(), initLocale().catch(() => undefined)])
  .finally(() => {
    startAutosave();
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
