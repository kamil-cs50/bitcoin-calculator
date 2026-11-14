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
}

const W = 640;
const H = 220;
const M = { top: 8, right: 12, bottom: 30, left: 12 };

/** Histogram wartości (słupki SVG) z tabelą liczności; „liczność” = liczba przyszłości w koszu. */
export function Histogram({ values, bins = 30, formatValue, label }: HistogramProps) {
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

  return (
    <figure className="m-0 flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} className="h-auto w-full">
        <title id={titleId}>{t`${label}. Słupki pokazują, ile przyszłości kończy w danym przedziale; liczby w tabeli pod wykresem.`}</title>
        {Array.from(h.counts, (c, i) => (
          <rect
            key={i}
            data-bar={i}
            x={x(h.edges[i]!) + 0.5}
            y={y(c)}
            width={Math.max(0, x(h.edges[i + 1]!) - x(h.edges[i]!) - 1)}
            height={H - M.bottom - y(c)}
            fill="var(--chart-band)"
            fillOpacity={0.75}
          />
        ))}
        <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--border-strong)" />
        {ticks.map((v) => (
          <text key={v} x={x(v)} y={H - M.bottom + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
            {formatValue(v)}
          </text>
        ))}
      </svg>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t`Pokaż dane rozkładu w tabeli`}</summary>
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
