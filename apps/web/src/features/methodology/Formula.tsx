import { useLingui } from '@lingui/react/macro';
import { useEffect, useState, type ReactNode } from 'react';
import { loadKatex } from './loadKatex';
import type { FormulaId } from './formulas';
import { FORMULAS } from './formulas';

/**
 * Jeden wzór z opisem. Do czasu załadowania KaTeX (albo przy błędzie ładowania, np. offline bez
 * cache) pokazuje zapis TeX jako zwykły tekst, więc treść jest zawsze dostępna.
 */
export function Formula({ id, children }: { id: FormulaId; children: ReactNode }) {
  const { t } = useLingui();
  const tex = FORMULAS[id];
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
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
  }, [tex]);

  return (
    <div data-formula={id} className="rounded-xl border border-border bg-surface-2 p-3">
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
