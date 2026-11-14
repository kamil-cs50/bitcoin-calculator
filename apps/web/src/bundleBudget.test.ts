// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Budżet rozmiaru (zadanie 46): każdy chunk wejściowy ≤ 250 kB gzip. Test działa na zbudowanym dist/
// (pomijany, gdy brak buildu; CI uruchamia go po `pnpm build`).
const DIST = new URL('../dist/', import.meta.url);
const BUDGET = 250 * 1000;

describe.skipIf(!existsSync(new URL('index.html', DIST)))('budżet rozmiaru dist', () => {
  const html = existsSync(new URL('index.html', DIST)) ? readFileSync(new URL('index.html', DIST), 'utf8') : '';
  const gz = (rel: string) => gzipSync(readFileSync(new URL(rel, DIST)), { level: 9 }).length;

  it('główny chunk JS ≤ 250 kB gzip', () => {
    const src = /<script[^>]+type="module"[^>]+src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(src).toBeTruthy();
    expect(gz(src!)).toBeLessThanOrEqual(BUDGET);
  });

  it('cały JS ładowany na starcie (wpis + modulepreload) ≤ 250 kB gzip', () => {
    const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThan(0);
    const total = files.reduce((sum, f) => sum + gz(f), 0);
    expect(total, `JS na starcie: ${files.join(', ')}`).toBeLessThanOrEqual(BUDGET);
  });

  it('żaden chunk JS w assets/ nie przekracza 250 kB gzip', () => {
    const files = readdirSync(new URL('assets/', DIST)).filter((f) => f.endsWith('.js'));
    for (const f of files) expect(gz(`assets/${f}`), f).toBeLessThanOrEqual(BUDGET);
  });
});

describe.skipIf(!existsSync(new URL('manifest.webmanifest', DIST)))('manifest PWA (instalowalność)', () => {
  const m = existsSync(new URL('manifest.webmanifest', DIST))
    ? (JSON.parse(readFileSync(new URL('manifest.webmanifest', DIST), 'utf8')) as {
        name: string; start_url: string; display: string;
        icons: { src: string; sizes: string; type: string; purpose?: string }[];
      })
    : null;

  it('ma nazwę, start_url, tryb standalone', () => {
    expect(m!.name).toBeTruthy();
    expect(m!.start_url).toBeTruthy();
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m!.display);
  });

  it('ma ikony PNG 192 i 512 oraz maskable, pliki istnieją', () => {
    const has = (size: string, purpose: string) =>
      m!.icons.some((i) => i.type === 'image/png' && i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose));
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const i of m!.icons) expect(existsSync(new URL(i.src.replace(/^\//, ''), DIST)), i.src).toBe(true);
  });

  it('service worker istnieje', () => {
    expect(existsSync(new URL('sw.js', DIST))).toBe(true);
  });
});
