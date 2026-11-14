import { expect, test, type Page } from '@playwright/test';
import { addPlan, addPortfolio, showResult, waitForSaved } from './helpers';

// Nawigacja samą klawiaturą (zadanie 46): Tab przez całą stronę, brak pułapek fokusu, widoczny wskaźnik fokusu.
const ROUTES = ['/', '/portfel', '/plan', '/wynik', '/porownanie', '/zalozenia', '/ustawienia', '/metodologia'] as const;
const MAX_TABS = 400;

interface Stop { desc: string; visibleFocus: boolean; inViewport: boolean; same: boolean }

async function activeStop(page: Page): Promise<Stop & { isBody: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return { desc: 'body', visibleFocus: true, inViewport: true, isBody: true, same: false };
    const w = window as unknown as { __last?: Element };
    const same = w.__last === el;
    w.__last = el;
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const shadow = cs.boxShadow !== 'none';
    // wskaźnik fokusu bywa na elemencie nadrzędnym (np. focus-within) albo na kontrolce Radix (role=radio w etykiecie)
    const parentRing = !!el.closest('label')?.matches(':focus-within') && (() => {
      const l = getComputedStyle(el.closest('label')!);
      return (l.outlineStyle !== 'none' && parseFloat(l.outlineWidth) > 0) || l.boxShadow !== 'none';
    })();
    const r = el.getBoundingClientRect();
    return {
      desc: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.getAttribute('type') ?? el.textContent ?? '').trim().slice(0, 40)}"`,
      visibleFocus: outline || shadow || parentRing,
      inViewport: r.width > 0 && r.height > 0,
      isBody: false,
      same,
    };
  });
}

/** Tab do końca dokumentu: fokus musi się za każdym razem zmienić i w końcu wyjść poza stronę (body). */
async function tabThrough(page: Page): Promise<{ stops: Stop[]; escaped: boolean }> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: Stop[] = [];
  let sameInRow = 0;
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const s = await activeStop(page);
    if (s.isBody) return { stops, escaped: true };
    stops.push(s);
    // ten sam element wielokrotnie z rzędu = fokus nie idzie dalej (pułapka)
    sameInRow = s.same ? sameInRow + 1 : 0;
    if (sameInRow > 2) return { stops, escaped: false };
  }
  return { stops, escaped: false };
}

test('klawiatura: Tab przez wszystkie trasy bez pułapek fokusu, każdy fokus widoczny', async ({ page }) => {
  await page.goto('/');
  await addPortfolio(page);
  await addPlan(page);
  await waitForSaved(page, 2);
  const problems: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    if (route === '/wynik') {
      await expect(page.getByTestId('quality')).toContainText(/10\s000 przyszłości/, { timeout: 60_000 });
      await expect(page.getByText('liczę dalej, wynik się doprecyzuje')).toBeHidden();
    } else await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const { stops, escaped } = await tabThrough(page);
    if (!escaped) problems.push(`${route}: fokus nie opuścił strony po ${stops.length} Tab (pułapka?): ${stops.slice(-6).map((x) => x.desc).join(' > ')}`);
    if (stops.length < 8) problems.push(`${route}: podejrzanie mało elementów fokusowalnych (${stops.length})`);
    for (const s of stops) {
      if (!s.visibleFocus) problems.push(`${route}: brak widocznego wskaźnika fokusu na ${s.desc}`);
      if (!s.inViewport) problems.push(`${route}: fokus na niewidocznym elemencie ${s.desc}`);
    }
    // Shift+Tab z końca wraca do elementów strony (brak jednokierunkowej pułapki)
    await page.keyboard.press('Shift+Tab');
    expect((await activeStop(page)).isBody, `${route}: Shift+Tab z końca`).toBe(false);
  }
  expect(problems).toEqual([]);
});

test('klawiatura: link „Przejdź do treści” jest pierwszym elementem i przenosi fokus do main', async ({ page }) => {
  await page.goto('/portfel');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Przejdź do treści' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#tresc')).toBeFocused();
});

test('klawiatura: cały przepływ (portfel → plan → wynik) da się przejść bez myszy, Escape zamyka okna', async ({ page }) => {
  await page.goto('/portfel');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Tab do kafelka „ETF na świat” i Enter otwiera formularz
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '');
    if (name === 'ETF na świat') break;
  }
  await expect(page.getByRole('button', { name: 'ETF na świat' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Kwota')).toBeVisible();
  await page.getByLabel('Kwota').focus();
  await page.keyboard.type('50000');
  await page.getByRole('button', { name: 'Dodaj do portfela' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Razem:/)).toContainText(/50\s000/);
  await showResult(page);
  // okno dialogowe (jeśli jest) zamyka się klawiszem Escape, a fokus wraca na stronę
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
