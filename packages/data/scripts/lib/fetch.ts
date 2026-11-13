import type { Point } from './io';

const DAY = 86_400_000;

/** Dzieli [from, to] (YYYY-MM-DD) na okna po najwyżej 93 dni (limit NBP Web API). */
export function nbpWindows(from: string, to: string, maxDays = 93): [string, string][] {
  const out: [string, string][] = [];
  let start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (start <= end) {
    const stop = Math.min(start + (maxDays - 1) * DAY, end);
    out.push([new Date(start).toISOString().slice(0, 10), new Date(stop).toISOString().slice(0, 10)]);
    start = stop + DAY;
  }
  return out;
}

export async function fetchJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.json();
}

interface NbpResponse {
  rates: { effectiveDate: string; mid: number }[];
}

/** Kursy średnie tabeli A NBP (PLN za 1 jednostkę waluty), okna po 93 dni. 404 = brak notowań w oknie. */
export async function fetchNbpTableA(currency: string, from: string, to: string): Promise<Point[]> {
  const out: Point[] = [];
  for (const [a, b] of nbpWindows(from, to)) {
    const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${a}/${b}/?format=json`;
    try {
      const body = (await fetchJson(url)) as NbpResponse;
      for (const r of body.rates) out.push({ date: r.effectiveDate, value: r.mid });
    } catch (e) {
      if (e instanceof Error && /HTTP 404/.test(e.message)) continue;
      throw e;
    }
  }
  return out;
}
