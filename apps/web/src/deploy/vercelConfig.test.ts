// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { previewSecurityHeaders } from './vercelHeaders';

// Zadanie 47: konfiguracja wdrożenia (spec 8). Test czyta vercel.json z korzenia repozytorium.
type Header = { key: string; value: string };
type Config = {
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  functions?: unknown;
  headers: { source: string; headers: Header[] }[];
};
const cfg = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as Config;
const headerFor = (source: string, key: string) =>
  cfg.headers.find((h) => h.source === source)?.headers.find((h) => h.key === key)?.value;

describe('vercel.json', () => {
  it('statyczny build z rewrite SPA i bez funkcji serwerowych', () => {
    expect(cfg.outputDirectory).toBe('apps/web/dist');
    expect(cfg.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
    expect(cfg.functions).toBeUndefined();
  });

  it('nagłówki cache', () => {
    expect(headerFor('/sw.js', 'Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(headerFor('/registerSW.js', 'Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(headerFor('/assets/(.*)', 'Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(headerFor('/index.html', 'Cache-Control')).toBe('no-cache');
    expect(headerFor('/manifest.webmanifest', 'Cache-Control')).toBe('no-cache');
  });

  it('Content-Security-Policy i nagłówki bezpieczeństwa', () => {
    const csp = headerFor('/(.*)', 'Content-Security-Policy')!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://api.nbp.pl https://api.coingecko.com");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(headerFor('/(.*)', 'X-Content-Type-Options')).toBe('nosniff');
    expect(headerFor('/(.*)', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerFor('/(.*)', 'Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    expect(headerFor('/(.*)', 'Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('podgląd Vite (preview.headers) używa dokładnie tych samych nagłówków co vercel.json', () => {
    const expected = Object.fromEntries(cfg.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]));
    expect(previewSecurityHeaders()).toEqual(expected);
    const viteConfig = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(viteConfig).toMatch(/preview:\s*\{\s*headers:\s*previewSecurityHeaders\(\)/);
  });
});
