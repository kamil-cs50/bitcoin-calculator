import { useLingui } from '@lingui/react/macro';
import { histogram } from '@sim/engine';
import { scaleLinear } from 'd3-scale';
import { useId, useMemo } from 'react';
import { DataTable } from './DataTable';

export interface HistogramProps {
  values: ArrayLike<number>;
  bins?: number;
  formatValue: (v: number) => string;
  label: string;
  /** Dopisek pod wykresem (np. o połączeniu najwyższego 1% w ostatnim słupku). */
  note?: string;
}

// układ z projektu v3: viewBox 640×240, linia bazowa y = 208, podpisy osi jako elementy HTML
const W = 640;
const H = 240;
const M = { top: 12, right: 12, bottom: 32, left: 12 };

/** Histogram wartości (słupki SVG) z tabelą liczności; „liczność” = liczba przyszłości w koszu. */
export function Histogram({ values, bins = 30, formatValue, label, note }: HistogramProps) {
  const { t } = useLingui();
  const titleId = useId();
  const h = useMemo(() => histogram(values, bins), [values, bins]);
  const lo = h.edges[0]!;
  const hi = h.edges[bins]!;
  const x = scaleLinear().domain([lo, hi > lo ? hi : lo + 1]).range([M.left, W - M.right]);
  let top = 0;
  for (const c of h.counts) top = Math.max(top, c);
  const y = scaleLinear().domain([0, top || 1]).range([H - M.bottom, M.top]);
  const ticks = x.ticks(5);

  const gid = `${useId().replace(/:/g, '')}-hist`;

  return (
    <figure className="m-0 flex flex-1 flex-col gap-3.5">
      <div className="relative mt-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} className="block h-auto w-full overflow-visible">
          <title id={titleId}>{t`${label}. Słupki pokazują, ile przyszłości kończy w danym przedziale; liczby w tabeli pod wykresem.`}</title>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: '#a9c3ff', stopOpacity: 1 }} />
              <stop offset="1" style={{ stopColor: '#1d3fff', stopOpacity: 0.1 }} />
            </linearGradient>
          </defs>
          {Array.from(h.counts, (c, i) => {
            const x0 = x(h.edges[i]!);
            const slot = x(h.edges[i + 1]!) - x0;
            const w = Math.max(0, slot * 0.42);
            return (
              <rect
                key={i}
                data-bar={i}
                x={x0 + slot * 0.29}
                y={y(c)}
                width={w}
                height={H - M.bottom - y(c)}
                rx={w / 2}
                fill={`url(#${gid})`}
                opacity={(0.35 + 0.65 * (c / (top || 1))).toFixed(2)}
                className="fv-shimmer"
                style={{ animationDelay: `${(-(1 - i / bins) * 6).toFixed(2)}s` }}
              />
            );
          })}
          <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="rgba(255,255,255,0.18)" />
        </svg>
        {ticks.map((v) => {
          const pos = (x(v) / W) * 100;
          return (
            <span
              key={v}
              aria-hidden="true"
              className="pointer-events-none absolute top-[95%] font-mono text-[11px] whitespace-nowrap text-label"
              style={{ left: `${pos}%`, transform: pos < 8 ? 'translate(0,-50%)' : pos > 92 ? 'translate(-100%,-50%)' : 'translate(-50%,-50%)' }}
            >
              {formatValue(v)}
            </span>
          );
        })}
      </div>
      {note && <p className="eyebrow-sm m-0">{note}</p>}
      <details>
        <summary className="eyebrow-sm min-h-11 cursor-pointer py-2.5">{t`Pokaż dane rozkładu w tabeli`}</summary>
        <DataTable
          caption={t`${label}: dane w tabeli`}
          cornerLabel={t`Przedział`}
          columns={[t`Liczba przyszłości`]}
          rows={Array.from(h.counts, (c, i) => ({
            label: `${formatValue(h.edges[i]!)} – ${formatValue(h.edges[i + 1]!)}`,
            cells: [String(c)],
          }))}
        />
      </details>
    </figure>
  );
}
