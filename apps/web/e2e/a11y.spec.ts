import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addPlan, addPortfolio, goTo, showResult, waitForSaved } from './helpers';

const ROUTES = ['/', '/portfel', '/plan', '/wynik', '/porownanie', '/zalozenia', '/ustawienia', '/metodologia', '/nie-ma-takiej-trasy'] as const;

async function violations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
}

for (const [scheme, lang] of [['light', 'pl'], ['dark', 'pl'], ['light', 'en'], ['dark', 'en']] as const) {
  test(`axe: brak naruszeń serious/critical na każdej trasie (motyw ${scheme}, język ${lang})`, async ({ page }) => {
    // reduced-motion: axe nie może trafić w środek przejścia koloru (przycisk po najechaniu myszą)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await addPortfolio(page);
    await addPlan(page);
    await waitForSaved(page, 2);
    if (lang === 'en') {
      await goTo(page, 'Ustawienia');
      await page.getByRole('radio', { name: 'English' }).click({ force: true });
      await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    }
    const found: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      if (route === '/wynik') await showResultReady(page, lang);
      else await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (route === '/portfel') {
        await page.getByRole('button', { name: 'Bitcoin', exact: true }).click();
        await expect(page.getByLabel(lang === 'en' ? 'Number of BTC' : 'Liczba BTC', { exact: true })).toBeVisible();
      }
      for (const v of await violations(page)) found.push(`${route}: ${v}`);
    }
    expect(found).toEqual([]);
  });
}

async function showResultReady(page: Page, lang: 'pl' | 'en'): Promise<void> {
  await expect(page.getByTestId('quality')).toContainText(lang === 'en' ? /10,000 futures/ : /10\s000 przyszłości/, { timeout: 60_000 });
  await expect(page.getByText(lang === 'en' ? 'still calculating, the result will get more precise' : 'liczę dalej, wynik się doprecyzuje')).toBeHidden();
}

test('nawigacja i strony nie wychodzą poza szerokość ekranu', async ({ page }) => {
  await page.goto('/');
  await addPortfolio(page);
  await addPlan(page);
  await showResult(page);
  const width = page.viewportSize()!.width;
  for (const name of ['Portfel', 'Plan', 'Wynik', 'Założenia', 'Ustawienia'] as const) {
    await goTo(page, name);
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      right: Math.max(...[...document.querySelectorAll('nav a')].map((a) => a.getBoundingClientRect().right)),
      left: Math.min(...[...document.querySelectorAll('nav a')].map((a) => a.getBoundingClientRect().left)),
    }));
    expect(m.scroll, `${name}: przewijanie poziome`).toBeLessThanOrEqual(m.inner);
    expect(m.right, `${name}: nawigacja poza prawą krawędzią`).toBeLessThanOrEqual(width);
    expect(m.left).toBeGreaterThanOrEqual(0);
  }
});
