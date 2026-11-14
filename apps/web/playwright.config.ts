import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH wskazuje własną binarkę Chromium (środowiska bez `playwright install`);
// bez zmiennej Playwright używa przeglądarki pobranej domyślnie (tak jest w CI).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  // Jeden worker: pomiary wydajności i service worker nie lubią równoległej rywalizacji o CPU.
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    launchOptions,
  },
  projects: [
    { name: 'Pixel 7', use: { ...devices['Pixel 7'], launchOptions } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'], launchOptions } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
