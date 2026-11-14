import { readFileSync } from 'node:fs';

// Nagłówki bezpieczeństwa (CSP itd.) z `vercel.json` (jedno źródło prawdy), używane w `preview.headers`
// w vite.config.ts, żeby lokalny podgląd produkcyjnego buildu miał dokładnie to samo CSP co Vercel.
export function previewSecurityHeaders(): Record<string, string> {
  const cfg = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const entry = cfg.headers.find((h) => h.source === '/(.*)');
  if (!entry) throw new Error('vercel.json: brak wpisu nagłówków dla /(.*)');
  return Object.fromEntries(entry.headers.map((h) => [h.key, h.value]));
}
