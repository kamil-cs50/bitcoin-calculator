/* global URL, process */
// Generuje ikony PNG PWA z public/icon.svg (Chromium z Playwright): any 192/512 oraz maskable 512
// (pełne tło, symbol w strefie bezpiecznej 80%). Użycie: PW_CHROMIUM_PATH=... node scripts/generate-icons.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const out = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));
const glyph = '<path d="M32 52 L12 20 Q32 8 52 20 Z" fill="#fff"/>';
const any = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#f7931a"/>${glyph}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f7931a"/><g transform="translate(6.4 6.4) scale(0.8)">${glyph}</g></svg>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
for (const [file, svg, size] of [
  ['icon-192.png', any, 192],
  ['icon-512.png', any, 512],
  ['icon-maskable-512.png', maskable, 512],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: out(file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
