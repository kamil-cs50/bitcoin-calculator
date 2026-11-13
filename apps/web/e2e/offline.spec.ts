import { expect, test } from '@playwright/test';

test('aplikacja działa offline po pierwszym załadowaniu', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wachlarz' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // service worker musi przejąć kontrolę nad stroną przed przejściem offline
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Wachlarz' })).toBeVisible();
  await expect(
    page.getByText('Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej'),
  ).toBeVisible();
});
