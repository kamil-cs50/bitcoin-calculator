import { expect, test } from '@playwright/test';
import { addPlan, addPortfolio, goTo } from './helpers';

// Budżet wydajności (spec 4.14): pierwszy etap < 1 s, 10 000 ścieżek < 5 s od kliknięcia „Wynik”.
const FIRST_STAGE_MS = 1000;
const FULL_MS = 5000;

test('wynik: pierwszy etap < 1 s, 10 000 ścieżek < 5 s', async ({ page }, info) => {
  await page.goto('/');
  await addPortfolio(page);
  await addPlan(page);

  await page.evaluate(() => {
    const w = window as unknown as { __t: { click: number; first?: number; full?: number } };
    w.__t = { click: 0 };
    const tick = () => {
      const q = document.querySelector('[data-testid="quality"]')?.textContent ?? '';
      const n = Number((q.match(/^([\d\s]+) przyszłości/)?.[1] ?? '0').replace(/\D/g, ''));
      if (w.__t.click && n > 0 && w.__t.first === undefined) w.__t.first = performance.now() - w.__t.click;
      if (w.__t.click && n >= 10000 && w.__t.full === undefined) w.__t.full = performance.now() - w.__t.click;
      if (w.__t.full === undefined) requestAnimationFrame(tick);
    };
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a[href="/wynik"]')) {
        w.__t.click = performance.now();
        requestAnimationFrame(tick);
      }
    }, { capture: true, once: true });
  });
  await goTo(page, 'Wynik');
  await page.waitForFunction(() => (window as unknown as { __t: { full?: number } }).__t.full !== undefined, null, { timeout: 60_000 });
  const t = await page.evaluate(() => (window as unknown as { __t: { first: number; full: number } }).__t);
  const line = `${info.project.name}: pierwszy etap ${t.first.toFixed(0)} ms, 10 000 ścieżek ${t.full.toFixed(0)} ms`;
  console.log(line);
  info.annotations.push({ type: 'perf', description: line });
  expect(t.first, line).toBeLessThan(FIRST_STAGE_MS);
  expect(t.full, line).toBeLessThan(FULL_MS);
});
