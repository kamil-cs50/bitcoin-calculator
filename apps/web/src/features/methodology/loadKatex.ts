import type KaTeX from 'katex';

let cached: Promise<typeof KaTeX> | undefined;

/**
 * Ładuje KaTeX (i jego arkusz stylów) dopiero na stronie metodologii: dynamiczny import trzyma
 * bibliotekę poza głównym chunkiem (test na manifeście buildu w methodology.test.tsx).
 */
export function loadKatex(): Promise<typeof KaTeX> {
  cached ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([m]) => m.default,
  );
  cached.catch(() => {
    cached = undefined; // pozwól ponowić po błędzie sieci
  });
  return cached;
}
