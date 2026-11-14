import { expect, test, type Page } from '@playwright/test';
import { addPortfolio, goTo } from './helpers';

// Emulacja słabszego telefonu (zadanie 46, krok 4): Pixel 7 + CDP CPUThrottlingRate 4, scenariusz
// 10 000 ścieżek × 30 lat × 6 aktywów. To NIE jest pomiar na realnym urządzeniu (patrz docs/PERFORMANCE.md);
// służy do wykrycia regresji i do ustalenia rzędu wielkości. Liczby trafiają do adnotacji testu i konsoli.
const THROTTLE = Number(process.env.PERF_THROTTLE ?? 4);
const CORES = process.env.PERF_CORES ? Number(process.env.PERF_CORES) : undefined;
// Bramka regresji, NIE budżet: budżet (podgląd < 300 ms, 10 000 ścieżek < 2 s) dotyczy realnego telefonu,
// a emulacja na współdzielonych 4 vCPU jest od niego wyraźnie gorsza (patrz docs/PERFORMANCE.md).
const PREVIEW_GUARD_MS = 2000;
const FULL_GUARD_MS = 6000;

async function sixAssets(page: Page): Promise<void> {
  await addPortfolio(page); // ETF na świat + Bitcoin
  for (const [tile, amount] of [['S&P 500', '20000'], ['Obligacje EDO', '10000'], ['Lokata', '10000'], ['Złoto', '10000']] as const) {
    await page.getByRole('button', { name: tile, exact: true }).click();
    await page.getByLabel('Kwota').fill(amount);
    await page.getByRole('button', { name: 'Dodaj do portfela' }).click();
  }
  await expect(page.getByRole('group')).toHaveCount(6);
  await goTo(page, 'Plan');
  await page.getByLabel('Horyzont (lata)').fill('30');
  await page.getByLabel('Wpłata miesięczna').fill('1000');
}

test(`emulowany telefon (CPU ×${THROTTLE}${CORES ? `, ${CORES} rdzenie` : ''}): podgląd 1000 ścieżek i 10 000 ścieżek × 30 lat × 6 aktywów`, async ({ page, context }, info) => {
  test.skip(info.project.name !== 'Pixel 7', 'pomiar tylko na profilu Pixel 7');
  if (CORES) await page.addInitScript((n) => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => n }), CORES);
  await page.goto('/');
  await sixAssets(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.evaluate(() => {
    const w = window as unknown as { __t: { click: number; first?: number; full?: number; stages: Record<number, number> } };
    w.__t = { click: 0, stages: {} };
    (window as unknown as { __lt: { start: number; dur: number }[] }).__lt = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) (window as unknown as { __lt: { start: number; dur: number }[] }).__lt.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
    const tick = () => {
      const q = document.querySelector('[data-testid="quality"]')?.textContent ?? '';
      const n = Number((q.match(/^([\d\s ]+) przyszłości/)?.[1] ?? '0').replace(/\D/g, ''));
      if (w.__t.click && n > 0 && w.__t.stages[n] === undefined) w.__t.stages[n] = performance.now() - w.__t.click;
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
  await page.getByRole('navigation', { name: 'Główna nawigacja' }).getByRole('link', { name: 'Wynik' }).click();
  await page.waitForFunction(() => (window as unknown as { __t: { full?: number } }).__t.full !== undefined, null, { timeout: 120_000 });
  const t = await page.evaluate(() => (window as unknown as { __t: { first: number; full: number; stages: Record<number, number> } }).__t);
  const lt = await page.evaluate(() => (window as unknown as { __lt: { start: number; dur: number }[] }).__lt);
  console.log('longtasks(main):', lt.map((x) => `${x.start.toFixed(0)}+${x.dur.toFixed(0)}`).join(' '));
  const hc = await page.evaluate(() => navigator.hardwareConcurrency);
  const line = `Pixel 7, CPU ×${THROTTLE}, hardwareConcurrency=${hc}: podgląd 1000 ścieżek ${t.first.toFixed(0)} ms, 10 000 ścieżek ${t.full.toFixed(0)} ms (etapy od kliknięcia, z debounce 250 ms: ${Object.entries(t.stages).map(([n, ms]) => `${n}: ${ms.toFixed(0)} ms`).join(', ')})`;
  console.log(line);
  info.annotations.push({ type: 'perf', description: line });
  expect(t.first, line).toBeLessThan(PREVIEW_GUARD_MS);
  expect(t.full, line).toBeLessThan(FULL_GUARD_MS);
});
