import { expect, test } from '@playwright/test';

// Instalowalność PWA (zadanie 46): w Lighthouse 12+ nie ma kategorii PWA, więc własna asercja:
// manifest podlinkowany z HTML, ikony PNG 192/512 + maskable osiągalne, service worker aktywny i kontroluje stronę.
test('PWA: manifest, ikony PNG (w tym maskable) i aktywny service worker', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as { name: string; start_url: string; display: string; icons: { src: string; sizes: string; type: string; purpose?: string }[] };
  expect(m.name).toBeTruthy();
  expect(m.display).toBe('standalone');
  const png = (size: string, purpose: string) =>
    m.icons.find((i) => i.type === 'image/png' && i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose));
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']] as const) {
    const icon = png(size, purpose);
    expect(icon, `ikona ${size} ${purpose}`).toBeTruthy();
    const r = await request.get(new URL(icon!.src, page.url()).toString());
    expect(r.ok(), icon!.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
    const [w, h] = size.split('x').map(Number);
    const buf = await r.body();
    expect(buf.readUInt32BE(16), `${icon!.src} szerokość`).toBe(w);
    expect(buf.readUInt32BE(20), `${icon!.src} wysokość`).toBe(h);
  }
  // service worker: rejestracja aktywna
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null), { timeout: 15_000 })
    .toBe('activated');
});
