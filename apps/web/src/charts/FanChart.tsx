import { useLingui } from '@lingui/react/macro';
import type { FanChart as FanData } from '@sim/engine';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
import { useId, type PointerEvent } from 'react';
import { DataTable } from './DataTable';

export interface FanChartProps {
  fan: FanData;
  /** Wybrany punkt czasu (miesiące od startu); najbliższy punkt siatki. */
  month: number;
  onMonthChange?: (month: number) => void;
  formatValue: (v: number) => string;
  label: string;
}

const W = 640;
const H = 320;
const M = { top: 12, right: 16, bottom: 34, left: 78 };

/** Etykieta wiersza tabeli: pełne lata jako „Rok N”, reszta jako numer miesiąca. */
export function periodLabel(month: number, year: string, monthWord: string): string {
  return month % 12 === 0 ? `${year} ${month / 12}` : `${monthWord} ${month}`;
}

/** Indeks punktu siatki najbliższego miesiącowi `month`. */
export function nearestIndex(months: Int32Array, month: number): number {
  let best = 0;
  for (let i = 1; i < months.length; i++) if (Math.abs(months[i]! - month) < Math.abs(months[best]! - month)) best = i;
  return best;
}

/**
 * Wachlarz: 7 percentyli (5/10/25/50/75/90/95) jako linie i trzy zagnieżdżone pasma (5–95, 10–90, 25–75).
 * Podpowiedź w częstościach naturalnych oraz tabela z tymi samymi liczbami.
 */
export function FanChart({ fan, month, onMonthChange, formatValue, label }: FanChartProps) {
  const { t } = useLingui();
  const titleId = useId();
  const G = fan.months.length;
  const L = fan.levels.length;
  const at = (l: number, j: number): number => fan.values[l * G + j]!;
  const j = nearestIndex(fan.months, month);

  let max = 0;
  for (let k = 0; k < G; k++) max = Math.max(max, at(L - 1, k));
  const maxYears = fan.months[G - 1]! / 12;
  const x = scaleLinear().domain([0, Math.max(maxYears, 1 / 12)]).range([M.left, W - M.right]);
  const y = scaleLinear().domain([0, max > 0 ? max : 1]).nice().range([H - M.bottom, M.top]);
  const idx = Array.from({ length: G }, (_, k) => k);

  const lineGen = (l: number): string =>
    line<number>().x((k) => x(fan.months[k]! / 12)).y((k) => y(at(l, k)))(idx) ?? '';
  const areaGen = (lo: number, hi: number): string =>
    area<number>().x((k) => x(fan.months[k]! / 12)).y0((k) => y(at(lo, k))).y1((k) => y(at(hi, k)))(idx) ?? '';

  const bands: [number, number, number][] = [
    [0, L - 1, 0.18],
    [1, L - 2, 0.28],
    [2, L - 3, 0.42],
  ];

  function onPointer(e: PointerEvent<SVGSVGElement>): void {
    if (!onMonthChange) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const years = Math.min(maxYears, Math.max(0, x.invert(px)));
    onMonthChange(fan.months[nearestIndex(fan.months, years * 12)]!);
  }

  const mid = Math.floor(L / 2);
  const lines: { l: number; k: number }[] = [
    { l: 1, k: 9 },
    { l: mid, k: 5 },
    { l: L - 2, k: 1 },
  ];
  const yearWord = t`Rok`;
  const monthWord = t`Miesiąc`;
  const xTicks = x.ticks(Math.min(8, Math.max(2, Math.floor(maxYears))));
  const px = x(fan.months[j]! / 12);

  return (
    <figure className="m-0 flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        className="h-auto w-full touch-pan-y"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        <title id={titleId}>
          {t`${label}. Pasma od 5% do 95% możliwych wartości w kolejnych latach; dokładne liczby w tabeli pod wykresem.`}
        </title>
        {y.ticks(5).map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted)">
              {formatValue(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={H - M.bottom + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
            {v}
          </text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">
          {t`lata od dziś`}
        </text>
        {bands.map(([lo, hi, op]) => (
          <path key={lo} data-area={`${fan.levels[lo]}-${fan.levels[hi]}`} d={areaGen(lo, hi)} fill="var(--chart-band)" fillOpacity={op} />
        ))}
        {fan.levels.map((p, l) => (
          <path
            key={p}
            data-level={p}
            d={lineGen(l)}
            fill="none"
            stroke={l === mid ? 'var(--fg)' : 'var(--chart-band)'}
            strokeWidth={l === mid ? 2.5 : 1}
            strokeDasharray={l === 0 || l === L - 1 ? '4 3' : undefined}
          />
        ))}
        <line x1={px} x2={px} y1={M.top} y2={H - M.bottom} stroke="var(--chart-mark)" strokeWidth={2} />
        {lines.map(({ l }) => (
          <circle key={l} cx={px} cy={y(at(l, j))} r={4} fill="var(--chart-mark)" stroke="var(--surface)" strokeWidth={1.5} />
        ))}
      </svg>
      <ul data-testid="fan-readout" className="m-0 list-none p-0 text-sm">
        {lines.map(({ l, k }) => {
          const v = formatValue(at(l, j));
          return <li key={l}>{t`w ${k} na 10 przyszłości więcej niż ${v}`}</li>;
        })}
      </ul>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t`Pokaż dane wachlarza w tabeli`}</summary>
        <DataTable
          caption={t`${label}: dane w tabeli`}
          cornerLabel={t`Okres`}
          columns={fan.levels.map((p) => `${Math.round(p * 100)}%`)}
          rows={idx.map((k) => ({
            label: periodLabel(fan.months[k]!, yearWord, monthWord),
            cells: fan.levels.map((_, l) => formatValue(at(l, k))),
          }))}
        />
      </details>
    </figure>
  );
}
