import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadKatex } from './loadKatex';
import type { FormulaId } from './formulas';
import { formulaTex } from './formulas';

/**
 * Jeden wzór z opisem. Do czasu załadowania KaTeX (albo przy błędzie ładowania, np. offline bez
 * cache) pokazuje zapis TeX jako zwykły tekst, więc treść jest zawsze dostępna.
 */
export function Formula({ id, children }: { id: FormulaId; children: ReactNode }) {
  const { t } = useLingui();
  const tex = formulaTex(id);
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Wzory poza ekranem renderujemy dopiero w pobliżu widoku (38 wzorów naraz blokowało główny
  // wątek na słabszym telefonie). Bez IntersectionObserver (jsdom) renderujemy od razu.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    loadKatex()
      .then((katex) => {
        if (!alive) return;
        setHtml(
          katex.renderToString(tex, {
            displayMode: true,
            throwOnError: false,
            output: 'htmlAndMathml',
          }),
        );
      })
      .catch(() => {
        /* zostaje tekst zastępczy */
      });
    return () => {
      alive = false;
    };
  }, [tex, near]);

  return (
    <div ref={ref} data-formula={id} className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="text-sm text-muted">{children}</div>
      {html ? (
        <div
          role="region"
          aria-label={t`Wzór matematyczny (przewijany poziomo)`}
          tabIndex={0}
          className="overflow-x-auto py-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <code className="block whitespace-pre-wrap break-words py-2 text-sm">{tex}</code>
      )}
    </div>
  );
}
