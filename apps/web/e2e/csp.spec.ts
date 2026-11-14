import { expect, test } from '@playwright/test';
import { fullFlow, goTo } from './helpers';

// Zadanie 47: build produkcyjny z CSP z vercel.json (preview.headers) nie generuje naruszeń CSP:
// Worker (blob:), KaTeX (style inline), service worker, fonty, wykresy d3, Lingui.
test('CSP: brak naruszeń w pełnym przepływie, na stronie metodologii i po wejściu bezpośrednim', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /content security policy|refused to/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI.slice(0, 60)} @ ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${e.sample}`);
    });
  });

  const res = await page.goto('/');
  const csp = res!.headers()['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("'unsafe-eval'");

  await fullFlow(page);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null), { timeout: 15_000 })
    .toBe('activated');

  await page.goto('/metodologia');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.mouse.wheel(0, 100_000);
  await expect(page.locator('.katex').first()).toBeVisible({ timeout: 15_000 });

  await page.goto('/wynik');
  await goTo(page, 'Ustawienia');
  await page.goto('/zalozenia');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});
