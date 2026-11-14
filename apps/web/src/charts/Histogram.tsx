import { useLingui } from '@lingui/react/macro';
import { histogram } from '@sim/engine';
import { scaleLinear } from 'd3-scale';
import { useId, useMemo, useState } from 'react';
import { Roll } from '../components/ui/Roll';
import { numberLocale } from '../i18n';
import { DataTable } from './DataTable';

export interface HistogramProps {
  values: ArrayLike<number>;
  bins?: number;
  formatValue: (v: number) => string;
  label: string;
  /** Dopisek pod wykresem (np. o połączeniu najwyższego 1% w ostatnim słupku). */
  note?: string;
  /** Odczyt nad wykresem (mediana, po najechaniu przedział słupka i liczba przyszłości), jak w projekcie v3. */
  readout?: boolean;
}

// układ z projektu v3: viewBox 640×240, linia bazowa y = 208, podpisy osi jako elementy HTML
const W = 640;
const H = 240;
const M = { top: 12, right: 12, bottom: 32, left: 12 };

export interface Bins {
  edges: number[];
  counts: number[];
  /** Kosze równej szerokości w skali logarytmicznej (jak w projekcie) albo liniowej. */
  log: boolean;
}

/**
 * Kosze histogramu do wyświetlenia. Dla dodatnich wartości o dużej rozpiętości (max/min > 10) kosze są
 * równe w skali logarytmicznej (rozkład wartości portfela jest prawoskośny; tak rysuje go projekt).
 * Liczności to dalej liczby przyszłości: to ten sam `histogram` z silnika, liczony na logarytmach wartości.
 * Przy wartościach ≤ 0 (wyczerpany portfel) zostają kosze liniowe.
 */
export function displayBins(values: ArrayLike<number>, bins: number): Bins {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (values.length > 0 && min > 0 && max / min > 10) {
    const logs = Float64Array.from({ length: values.length }, (_, i) => Math.log(values[i]!));
    const h = histogram(logs, bins);
    return { edges: Array.from(h.edges, (e) => Math.exp(e)), counts: Array.from(h.counts), log: true };
  }
  const h = histogram(values, bins);
  return { edges: Array.from(h.edges), counts: Array.from(h.counts), log: false };
}

/** Mediana próbki (kopia posortowana; oryginał bez zmian). */
export function sampleMedian(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return NaN;
  const s = Float64Array.from(values).sort();
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Histogram wartości (słupki SVG) z tabelą liczności; „liczność” = liczba przyszłości w koszu. */
export function Histogram({ values, bins = 48, formatValue, label, note, readout = false }: HistogramProps) {
  const { t } = useLingui();
  const titleId = useId();
  const h = useMemo(() => displayBins(values, bins), [values, bins]);
  const median = useMemo(() => sampleMedian(values), [values]);
  const [hover, setHover] = useState(-1);
  const n = h.edges.length - 1;
  // oś x w indeksie kosza: równe kosze (log albo liniowe) mają równą szerokość
  const x = scaleLinear().domain([0, n]).range([M.left, W - M.right]);
  const pos = (v: number): number => {
    const lo = h.edges[0]!;
    const hi = h.edges[n]!;
    if (!(hi > lo)) return x(0);
    const f = h.log ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo);
    return x(Math.min(n, Math.max(0, f * n)));
  };
  let top = 0;
  let total = 0;
  for (const c of h.counts) {
    top = Math.max(top, c);
    total += c;
  }
  const y = scaleLinear().domain([0, (top || 1) * 1.04]).range([H - M.bottom, M.top]);
  const medBin = Math.min(n - 1, Math.max(0, Math.floor(((pos(median) - M.left) / (W - M.left - M.right)) * n)));
  const tickIdx = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * n));
  const gid = `${useId().replace(/:/g, '')}-hist`;
  const nf = (v: number) => new Intl.NumberFormat(numberLocale()).format(v);
  const slot = (W - M.left - M.right) / Math.max(1, n);

  return (
    <figure className="m-0 flex flex-1 flex-col gap-3.5">
      {readout && (
        <p aria-hidden="true" className="m-0 flex min-h-[1.5em] flex-wrap items-baseline gap-x-2 text-[14px] font-light text-fg/70">
          {hover >= 0 ? (
            <>
              <span className="text-fg tabular-nums">
                <Roll text={`${formatValue(h.edges[hover]!)} – ${formatValue(h.edges[hover + 1]!)}`} />
              </span>
              <span>{t`· w ${nf(h.counts[hover]!)} z ${nf(total)} przyszłości`}</span>
            </>
          ) : (
            <>
              <span className="text-fg tabular-nums">
                <Roll text={formatValue(median)} />
              </span>
              <span>{t`· mediana — najedź na słupek`}</span>
            </>
          )}
        </p>
      )}
      <div className="relative mt-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          className="block h-auto w-full overflow-visible"
          onPointerLeave={() => setHover(-1)}
        >
          <title id={titleId}>{t`${label}. Słupki pokazują, ile przyszłości kończy w danym przedziale; liczby w tabeli pod wykresem.`}</title>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: '#a9c3ff', stopOpacity: 1 }} />
              <stop offset="1" style={{ stopColor: '#1d3fff', stopOpacity: 0.1 }} />
            </linearGradient>
          </defs>
          {h.counts.map((c, i) => {
            const x0 = x(i);
            const w = Math.max(0, slot * 0.42);
            const op = hover >= 0 ? (i === hover ? 1 : 0.28) : 0.35 + 0.65 * Math.exp(-(((i - medBin) / 6) ** 2));
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
                opacity={op.toFixed(2)}
                className="fv-shimmer"
                style={{ animationDelay: `${(-(1 - i / n) * 6).toFixed(2)}s`, transition: 'opacity .25s' }}
              />
            );
          })}
          <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="rgba(255,255,255,0.18)" />
          {Number.isFinite(median) && (
            <g aria-hidden="true" style={{ transform: `translate(${pos(median)}px,0px)`, transition: 'transform .6s cubic-bezier(.2,.8,.2,1)' }}>
              <line x1={0} x2={0} y1={M.top - 4} y2={H - M.bottom} stroke="rgba(255,255,255,0.55)" strokeDasharray="2 4" />
            </g>
          )}
          {/* strefy najechania: cała wysokość kosza, przezroczyste */}
          {readout &&
            h.counts.map((_, i) => (
              <rect
                key={`hit-${i}`}
                aria-hidden="true"
                x={x(i)}
                y={M.top}
                width={slot}
                height={H - M.bottom - M.top}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
              />
            ))}
        </svg>
        {tickIdx.map((i, k) => (
          <span
            key={k}
            aria-hidden="true"
            className="pointer-events-none absolute top-[95%] font-mono text-[11px] whitespace-nowrap text-label"
            style={{
              left: `${(x(i) / W) * 100}%`,
              transform: k === 0 ? 'translate(0,-50%)' : k === tickIdx.length - 1 ? 'translate(-100%,-50%)' : 'translate(-50%,-50%)',
            }}
          >
            {formatValue(h.edges[i]!)}
          </span>
        ))}
      </div>
      {note && <p className="eyebrow-sm m-0">{note}</p>}
      <details>
        <summary className="eyebrow-sm min-h-11 cursor-pointer py-2.5">{t`Pokaż dane rozkładu w tabeli`}</summary>
        <DataTable
          caption={t`${label}: dane w tabeli`}
          cornerLabel={t`Przedział`}
          columns={[t`Liczba przyszłości`]}
          rows={h.counts.map((c, i) => ({
            label: `${formatValue(h.edges[i]!)} – ${formatValue(h.edges[i + 1]!)}`,
            cells: [String(c)],
          }))}
        />
      </details>
    </figure>
  );
}
