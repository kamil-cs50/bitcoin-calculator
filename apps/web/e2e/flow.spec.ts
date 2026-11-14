import { expect, test } from '@playwright/test';
import { APP_NAME } from '../src/app/appConfig';
import { FOOTER, addPortfolio, expectResultVisible, fullFlow, goTo, showResult, trackForeignRequests, waitForSaved } from './helpers';

test('pełny przepływ: portfel, plan, wynik z wachlarzem i kafelkami KPI (prawdziwy Worker)', async ({ page }) => {
  const foreign = trackForeignRequests(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: APP_NAME })).toBeVisible();
  await fullFlow(page);
  expect(errors).toEqual([]);
  expect(foreign, `żądania poza własnym originem: ${foreign.join(', ')}`).toEqual([]);
});

test('przeładowanie przywraca scenariusz z IndexedDB', async ({ page }) => {
  await page.goto('/');
  await addPortfolio(page);
  await waitForSaved(page, 2);
  await page.reload();
  await goTo(page, 'Portfel');
  await expect(page.getByRole('group', { name: 'ETF na świat' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Bitcoin' })).toBeVisible();
  await expect(page.getByText(/Razem:/)).toContainText(/90\s000/);
  await showResult(page);
  await expectResultVisible(page);
});

test('uszkodzony zapis: karta z kopią danych i „Zacznij od nowa”', async ({ page }) => {
  await page.goto('/');
  await addPortfolio(page);
  await waitForSaved(page, 2);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('portfolio-simulator');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('scenarios', 'readwrite');
          tx.objectStore('scenarios').put({ id: 'current', name: 'x', updatedAt: Date.now(), data: { schemaVersion: 1, zepsute: true } });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  const card = page.getByRole('alert').filter({ hasText: 'Nie udało się wczytać zapisanego planu' });
  await expect(card).toBeVisible();
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Pobierz kopię danych' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await card.getByRole('button', { name: 'Zacznij od nowa' }).click();
  await expect(card).toBeHidden();
  await goTo(page, 'Portfel');
  await expect(page.getByText('Portfel jest pusty')).toBeVisible();
});

test('offline: ten sam przepływ działa po pierwszym załadowaniu (plan: offline.spec.ts)', async ({ page, context }) => {
  const foreign = trackForeignRequests(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: APP_NAME })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // service worker musi przejąć kontrolę nad stroną przed przejściem offline
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: APP_NAME })).toBeVisible();
  await expect(page.getByText(FOOTER)).toBeVisible();
  await fullFlow(page);
  expect(foreign, `żądania poza własnym originem: ${foreign.join(', ')}`).toEqual([]);
});
