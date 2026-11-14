import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
