import { expect, type Page } from '@playwright/test';

export const FOOTER = 'Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej';

/** Kliknięcie w pozycję głównej nawigacji (nawigacja po stronie klienta, bez przeładowania). */
export async function goTo(page: Page, name: 'Portfel' | 'Plan' | 'Wynik' | 'Założenia' | 'Ustawienia'): Promise<void> {
  await page.getByRole('navigation', { name: 'Główna nawigacja' }).getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** ETF na świat 50 000 zł i 0,1 BTC z ręczną ceną 400 000 zł (łącznie 90 000 zł). */
export async function addPortfolio(page: Page): Promise<void> {
  await goTo(page, 'Portfel');
  await page.getByRole('button', { name: 'ETF na świat' }).click();
  await page.getByLabel('Kwota').fill('50000');
  await page.getByRole('button', { name: 'Dodaj do portfela' }).click();

  await page.getByRole('button', { name: 'Bitcoin', exact: true }).click();
  await page.getByLabel('Liczba BTC').fill('0,1');
  await page.getByLabel(/Cena 1 BTC/).fill('400000');
  await page.getByRole('button', { name: 'Dodaj do portfela' }).click();
  await expect(page.getByText(/Razem:/)).toContainText(/90\s000/);
}

/** Plan: 20 lat, wpłata 1 000 zł miesięcznie. */
export async function addPlan(page: Page): Promise<void> {
  await goTo(page, 'Plan');
  await page.getByLabel('Horyzont (lata)').fill('20');
  await page.getByLabel('Wpłata miesięczna').fill('1000');
}

/** Czeka, aż wynik będzie policzony w całości (10 000 ścieżek, koniec liczenia). */
export async function waitForFullResult(page: Page, timeout = 60_000): Promise<void> {
  await expect(page.getByTestId('quality')).toContainText(/10\s000 przyszłości/, { timeout });
  await expect(page.getByText('liczę dalej, wynik się doprecyzuje')).toBeHidden({ timeout });
}

export async function showResult(page: Page): Promise<void> {
  await goTo(page, 'Wynik');
  await waitForFullResult(page);
}

/** Cały przepływ użytkownika: portfel, plan, wynik z wachlarzem i kafelkami KPI. */
export async function fullFlow(page: Page): Promise<void> {
  await addPortfolio(page);
  await addPlan(page);
  await showResult(page);
  await expectResultVisible(page);
}

export async function expectResultVisible(page: Page): Promise<void> {
  await expect(page.getByRole('img', { name: 'Wachlarz możliwych wartości portfela' })).toBeVisible();
  await expect(page.getByTestId('kpi-median')).toContainText(/\d/);
  await expect(page.getByTestId('kpi-range')).toContainText(/między/);
  await expect(page.getByRole('heading', { name: /Ryzyko spadku o ponad 30%/ })).toBeVisible();
}

/** Liczba pozycji w zapisie `current` w IndexedDB (null, gdy brak wpisu lub bazy). */
async function savedPositions(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('portfolio-simulator');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('scenarios')) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction('scenarios').objectStore('scenarios').get('current');
          get.onsuccess = () => {
            const len = (get.result as { data?: { positions?: unknown[] } } | undefined)?.data?.positions?.length;
            db.close();
            resolve(len ?? null);
          };
          get.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
}

/** Czeka, aż autozapis (z opóźnieniem 500 ms) trafi do IndexedDB z oczekiwaną liczbą pozycji. */
export async function waitForSaved(page: Page, positions = 2): Promise<void> {
  await expect.poll(() => savedPositions(page), { timeout: 15_000, intervals: [100] }).toBe(positions);
}

/** Zbiera żądania spoza własnego originu (data: i blob: to nie sieć). */
export function trackForeignRequests(page: Page): string[] {
  const foreign: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== new URL(page.url() === 'about:blank' ? req.url() : page.url()).origin) foreign.push(req.url());
  });
  return foreign;
}
