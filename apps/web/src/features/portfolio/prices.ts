/**
 * Ceny z sieci: wyłącznie na żądanie użytkownika (przycisk „Pobierz cenę”), nigdy w tle.
 * Dozwolone hosty to dokładnie te z CSP (connect-src). Cache 24 h w localStorage: regulamin
 * CoinGecko dopuszcza cache do 24 h i zakazuje trwałego przechowywania cen. Aplikacja działa
 * w pełni bez tego modułu (cena wpisana ręcznie).
 */

export const ALLOWED_HOSTS = ['https://api.nbp.pl', 'https://api.coingecko.com'] as const;

const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const KEY_PREFIX = 'price-cache:';

function readCache(key: string): number | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const c: unknown = JSON.parse(raw);
    if (typeof c !== 'object' || c === null) return null;
    const { v, t } = c as { v?: unknown; t?: unknown };
    if (typeof v !== 'number' || typeof t !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    const age = Date.now() - t;
    return age >= 0 && age < CACHE_MS ? v : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, v: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify({ v, t: Date.now() }));
  } catch {
    // Brak dostępu do localStorage: działamy bez cache.
  }
}

async function getJson(url: string): Promise<unknown> {
  const origin = new URL(url).origin;
  if (!(ALLOWED_HOSTS as readonly string[]).includes(origin)) throw new Error(`Host niedozwolony: ${origin}`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function positive(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) throw new Error('Niepoprawna odpowiedź API');
  return x;
}

/** Kurs średni NBP (tabela A) waluty w PLN. */
export async function fetchNbpRate(c: 'USD' | 'EUR'): Promise<number> {
  const key = `nbp:${c}`;
  const hit = readCache(key);
  if (hit !== null) return hit;
  const body = (await getJson(`https://api.nbp.pl/api/exchangerates/rates/a/${c.toLowerCase()}/?format=json`)) as {
    rates?: { mid?: unknown }[];
  };
  const v = positive(body?.rates?.[0]?.mid);
  writeCache(key, v);
  return v;
}

/** Cena bieżąca kryptowaluty (CoinGecko, wymagana atrybucja „Powered by CoinGecko”). */
export async function fetchCryptoPrice(id: 'bitcoin' | 'ethereum', vs: 'usd' | 'pln'): Promise<number> {
  const key = `cg:${id}:${vs}`;
  const hit = readCache(key);
  if (hit !== null) return hit;
  const body = (await getJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vs}`,
  )) as Record<string, Record<string, unknown> | undefined>;
  const v = positive(body?.[id]?.[vs]);
  writeCache(key, v);
  return v;
}
