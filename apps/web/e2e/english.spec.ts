import { expect, test, type Page } from '@playwright/test';
import { APP_NAME } from '../src/app/appConfig';

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name });

/** Przełącza język w Ustawieniach (po polsku) na angielski. */
async function switchToEnglish(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Główna nawigacja' }).getByRole('link', { name: 'Ustawienia' }).click();
  await page.getByRole('radio', { name: 'English' }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
}

async function expectNoPolishText(page: Page, where: string): Promise<void> {
  const text = await page.locator('body').innerText();
  // „danina solidarnościowa”, „ryczałt” i „Monitor Polski” zostają w oryginale (terminy PL), nazwa aplikacji bywa polska
  const cleaned = text.replaceAll(APP_NAME, '').replace(/danina solidarnościowa|ryczałt|Monitor Polski/g, '');
  // tytuły źródeł (wiersze „… · accessed: …”) zostają w oryginale, bo to nazwy dokumentów
  const bad = (cleaned.match(/[^\n]*[ąćęłńóśźż][^\n]*/gi) ?? []).filter((l) => !l.includes(' · accessed: '));
  expect(bad, `polskie litery na stronie: ${where}`).toEqual([]);
}

test('przełączenie na angielski: nagłówki, <html lang>, trwałość po przeładowaniu', async ({ page }) => {
  await switchToEnglish(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(nav(page, 'Portfolio')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(nav(page, 'Portfolio')).toBeVisible();
  // z powrotem na polski
  await nav(page, 'Settings').click();
  await page.getByRole('radio', { name: 'Polski' }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Wygląd' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
});

test('pełny przepływ po angielsku: portfel, plan, wynik; format liczb en-GB; brak polskich tekstów', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await switchToEnglish(page);
  await expectNoPolishText(page, 'Settings');

  await nav(page, 'Portfolio').click();
  await expectNoPolishText(page, 'Portfolio (empty, onboarding)');
  await nav(page, 'Comparison').click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoPolishText(page, 'Compare');
  await nav(page, 'Portfolio').click();
  await page.getByRole('button', { name: 'World ETF' }).click();
  await page.getByLabel('Amount').fill('50000');
  await page.getByRole('button', { name: 'Add to portfolio' }).click();
  await page.getByRole('button', { name: 'Bitcoin', exact: true }).click();
  await page.getByLabel('Number of BTC', { exact: true }).fill('0.1');
  await page.getByLabel(/Price of 1 BTC/).fill('400000');
  await page.getByRole('button', { name: 'Add to portfolio' }).click();
  // en-GB: separator tysięcy to przecinek, waluta przed liczbą
  await expect(page.getByText(/Total:/)).toContainText('PLN 90,000');
  await expectNoPolishText(page, 'Portfolio');

  await nav(page, 'Plan').click();
  await page.getByLabel('Horizon (years)').fill('20');
  await page.getByLabel('Monthly contribution').fill('1000');
  await expectNoPolishText(page, 'Plan');

  await nav(page, 'Result').click();
  await expect(page.getByTestId('quality')).toContainText(/10,000 futures/, { timeout: 60_000 });
  await expect(page.getByText('still calculating, the result will get more precise')).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole('img', { name: /Fan of possible portfolio values/ })).toBeVisible();
  await expect(page.getByTestId('kpi-median')).toContainText(/PLN\s?\d/);
  await expect(page.getByTestId('kpi-range')).toContainText(/between/);
  await expect(page.getByRole('heading', { name: /Risk of a fall of more than 30%/ })).toBeVisible();
  await expectNoPolishText(page, 'Result');

  await nav(page, 'Assumptions').click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Expected annual return').first()).toBeVisible();
  await expectNoPolishText(page, 'Assumptions');

  await page.goto('/metodologia');
  await expect(page.getByRole('heading', { level: 1, name: 'Methodology' })).toBeVisible();
  await expectNoPolishText(page, 'Methodology');
  expect(errors).toEqual([]);
});
