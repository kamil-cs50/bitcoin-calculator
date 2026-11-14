import type { CSSProperties } from 'react';

/*
 * Licznik „odometr” z projektu Claude Design (v3): każda cyfra to kolumna 0–9 przesuwana w pionie,
 * więc zmiana wartości płynnie „przewija” cyfry. Wyłącznie oprawa: dostaje gotowy napis.
 * Pełny napis czyta czytnik ekranu (sr-only), kolumny cyfr są ukryte przed technologiami asystującymi.
 */
const BOX: CSSProperties = { display: 'inline-block', height: '1.1em', lineHeight: '1.1em' };
const MASK = 'linear-gradient(180deg,transparent 0,#000 10%,#000 90%,transparent 100%)';

export function Roll({ text }: { text: string }) {
  const ch = [...text];
  const n = ch.length;
  // długie opisy („W mniej niż 1 na 100 przyszłości”) zostają zwykłym, zawijanym tekstem
  if (n > 18) return <span className="text-pretty">{text}</span>;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {ch.map((c, i) => {
          const key = `p${n - i}`;
          if (!/\d/.test(c)) {
            return (
              <span key={`${key}s${c}`} style={{ whiteSpace: 'pre', ...BOX }}>
                {c}
              </span>
            );
          }
          return (
            <span key={key} style={{ overflow: 'hidden', WebkitMaskImage: MASK, maskImage: MASK, ...BOX }}>
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  transform: `translateY(${-Number(c) * 1.1}em)`,
                  transition: 'transform .85s cubic-bezier(.22,1,.36,1)',
                  willChange: 'transform',
                }}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
                  <span key={k} style={BOX}>
                    {k}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </>
  );
}
