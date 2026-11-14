import { useLingui } from '@lingui/react/macro';
import type { FanChart as FanData } from '@sim/engine';
import { scaleLinear, scaleLog } from 'd3-scale';
import { area, line } from 'd3-shape';
import { useId, type PointerEvent } from 'react';
import { Roll } from '../components/ui/Roll';
import { DataTable } from './DataTable';

export interface FanChartProps {
  fan: FanData;
  /** Wybrany punkt czasu (miesiące od startu); najbliższy punkt siatki. */
  month: number;
  onMonthChange?: (month: number) => void;
  formatValue: (v: number) => string;
  label: string;
  /** Nagłówek podpowiedzi przy wskaźniku (np. „Za 20 lat · 2046”); bez niego podpowiedź go pomija. */
  tipTitle?: string;
  /** Oś wartości: logarytmiczna (domyślnie, jak w projekcie v3) albo liniowa. */
  scale?: 'log' | 'linear';
  /** Pokazuje tylko pierwsze `windowMonths` miesięcy (przyciski 5L/10L/20L); dane się nie zmieniają. */
  windowMonths?: number;
  /** Rok kalendarzowy startu: oś czasu pokazuje „Dziś” i lata kalendarzowe zamiast lat od dziś. */
  startYear?: number;
  startMonth?: number;
}

// układ z projektu v3: viewBox 1000×360, pole wykresu x 92–985, y 20–320; podpisy osi są elementami HTML
const W = 1000;
const H = 360;
const M = { top: 20, right: 15, bottom: 40, left: 92 };

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

/** Krok podpisów osi czasu (lata) jak w projekcie: 1 rok do 5 lat, 2 do 10, 5 do 25, dalej 10. */
export function yearStep(maxYears: number): number {
  return maxYears <= 5 ? 1 : maxYears <= 10 ? 2 : maxYears <= 25 ? 5 : 10;
}

/** Podziałka 1–2–5 w granicach [lo, hi] (oś logarytmiczna); przy nadmiarze co druga. */
export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  if (!(lo > 0) || !(hi > lo)) return out;
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      const lv = Math.log(v);
      if (lv > Math.log(lo) + 0.04 && lv < Math.log(hi) - 0.02) out.push(v);
    }
  }
  return out.length > 6 ? out.filter((_, i) => i % 2 === 0) : out;
}

/**
 * Wachlarz: 7 percentyli (5/10/25/50/75/90/95) jako linie i trzy zagnieżdżone pasma (5–95, 10–90, 25–75).
 * Podpowiedź w częstościach naturalnych oraz tabela z tymi samymi liczbami.
 */
export function FanChart({
  fan,
  month,
  onMonthChange,
  formatValue,
  label,
  tipTitle,
  scale = 'log',
  windowMonths,
  startYear,
  startMonth = 1,
}: FanChartProps) {
  const { t } = useLingui();
  const titleId = useId();
  // id bez dwukropków z useId: używany w odwołaniu url(#…) filtra poświaty
  const glowId = `${useId().replace(/:/g, '')}-glow`;
  const G = fan.months.length;
  const L = fan.levels.length;
  const at = (l: number, j: number): number => fan.values[l * G + j]!;
  // okno czasu (5L/10L/20L): punkty siatki do `windowMonths` włącznie, zawsze co najmniej dwa
  let Gv = G;
  if (windowMonths !== undefined) {
    Gv = 0;
    while (Gv < G && fan.months[Gv]! <= windowMonths) Gv++;
    Gv = Math.min(G, Math.max(2, Gv));
  }
  const idx = Array.from({ length: Gv }, (_, k) => k);
  const j = Math.min(nearestIndex(fan.months, month), Gv - 1);

  let max = 0;
  let minPos = Infinity;
  for (let k = 0; k < Gv; k++) {
    max = Math.max(max, at(L - 1, k));
    const lo = at(0, k);
    if (lo > 0) minPos = Math.min(minPos, lo);
  }
  const maxYears = fan.months[Gv - 1]! / 12;
  const x = scaleLinear().domain([0, Math.max(maxYears, 1 / 12)]).range([M.left, W - M.right]);
  // oś logarytmiczna jak w projekcie (zapas 0,82× / 1,15×); wartości ≤ 0 (wyczerpany portfel) przy dolnej krawędzi.
  // Dolna granica najwyżej 4 rzędy wielkości pod maksimum, żeby pojedyncze bliskie zera ścieżki nie spłaszczały wykresu.
  const useLog = scale === 'log' && max > 0 && Number.isFinite(minPos);
  const logLo = useLog ? Math.max(minPos, max / 1e4) * 0.82 : 1;
  const logHi = max * 1.15;
  const yLog = scaleLog().domain([logLo, logHi]).range([H - M.bottom, M.top]).clamp(true);
  const yLin = scaleLinear().domain([0, max > 0 ? max : 1]).nice().range([H - M.bottom, M.top]);
  const y = (v: number): number => (useLog ? yLog(Math.max(v, logLo)) : yLin(v));

  const lineGen = (l: number): string =>
    line<number>().x((k) => x(fan.months[k]! / 12)).y((k) => y(at(l, k)))(idx) ?? '';
  const areaGen = (lo: number, hi: number): string =>
    area<number>().x((k) => x(fan.months[k]! / 12)).y0((k) => y(at(lo, k))).y1((k) => y(at(hi, k)))(idx) ?? '';

  const bands: [number, number, number][] = [
    [0, L - 1, 0.32],
    [1, L - 2, 0.5],
    [2, L - 3, 0.85],
  ];

  function onPointer(e: PointerEvent<SVGSVGElement>): void {
    if (!onMonthChange) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const years = Math.min(maxYears, Math.max(0, x.invert(px)));
    // tylko w obrębie okna (nearestIndex po całej siatce mógłby wybrać punkt tuż za oknem)
    onMonthChange(fan.months[Math.min(nearestIndex(fan.months, years * 12), Gv - 1)]!);
  }

  const mid = Math.floor(L / 2);
  const lines: { l: number; k: number }[] = [
    { l: 1, k: 9 },
    { l: mid, k: 5 },
    { l: L - 2, k: 1 },
  ];
  const yearWord = t`Rok`;
  const monthWord = t`Miesiąc`;
  const step = yearStep(maxYears);
  const xTicks: number[] = [];
  for (let v = 0; v <= maxYears + 1e-9; v += step) xTicks.push(v);
  const xLabel = (v: number): string =>
    startYear === undefined ? String(v) : v === 0 ? t`Dziś` : String(startYear + Math.floor((startMonth - 1 + v * 12) / 12));
  const px = x(fan.months[j]! / 12);
  const pyMed = y(at(mid, j));
  const yTicks = useLog ? logTicks(logLo, logHi) : yLin.ticks(5);
  const pct = (l: number): number => Math.round(fan.levels[l]! * 100);
  const ease = 'd .8s cubic-bezier(.2,.8,.2,1)';
  const glowLayers = (l: number, strong: boolean) => {
    const d = lineGen(l);
    // cztery warstwy od szerokiej, miękkiej poświaty do białego rdzenia; wspólny rytm 6 s (opóźnienia stałe)
    const base = strong
      ? [
          { c: '#1f5bff', w: 30, f: 0.3, o: 0.75, b: 18, dl: 0 },
          { c: '#4d7dff', w: 15, f: 0.21, o: 0.75, b: 9, dl: -0.27 },
          { c: '#a9c3ff', w: 6.5, f: 0.13, o: 0.8, b: 4, dl: -0.51 },
          { c: '#ffffff', w: 2.2, f: 0.07, o: 0.9, b: 1.4, dl: -0.69 },
        ]
      : [
          { c: '#1f5bff', w: 16.5, f: 0.3, o: 0.55, b: 12.6, dl: 0 },
          { c: '#4d7dff', w: 8.3, f: 0.21, o: 0.6, b: 6.3, dl: -0.27 },
          { c: '#a9c3ff', w: 3.6, f: 0.13, o: 0.65, b: 2.8, dl: -0.51 },
          { c: '#ffffff', w: 1.2, f: 0.07, o: 0.7, b: 1, dl: -0.69 },
        ];
    return base.map((g) => (
      <path
        key={`${l}-${g.c}`}
        d={d}
        pathLength={1}
        aria-hidden="true"
        className="fv-flow"
        style={{
          stroke: g.c,
          strokeWidth: g.w,
          strokeDasharray: `${g.f} ${(1 - g.f).toFixed(2)}`,
          opacity: g.o,
          filter: `blur(${g.b}px)`,
          animationDelay: `${g.dl}s`,
          transition: ease,
        }}
      />
    ));
  };

  return (
    <figure className="m-0 flex flex-col gap-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          className="block h-auto w-full cursor-crosshair touch-pan-y overflow-visible"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
        >
          <title id={titleId}>
            {t`${label}. Pasma od 5% do 95% możliwych wartości w kolejnych latach; dokładne liczby w tabeli pod wykresem.`}
          </title>
          <defs>
            <linearGradient id={`${glowId}-band`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: '#7fa8ff', stopOpacity: 0.55 }} />
              <stop offset="1" style={{ stopColor: '#1d3fff', stopOpacity: 0.02 }} />
            </linearGradient>
            <linearGradient id={`${glowId}-past`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: '#ffffff', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: '#ffffff', stopOpacity: 0.05 }} />
            </linearGradient>
            <radialGradient id={`${glowId}-spot`} gradientUnits="userSpaceOnUse" cx={px} cy={pyMed} r={340}>
              <stop offset="0" style={{ stopColor: '#ffffff' }} />
              <stop offset="0.28" style={{ stopColor: '#b9cdff' }} />
              <stop offset="1" style={{ stopColor: '#4d7dff', stopOpacity: 0.45 }} />
            </radialGradient>
            <radialGradient id={`${glowId}-bloom`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" style={{ stopColor: '#8fb0ff', stopOpacity: 0.6 }} />
              <stop offset="0.35" style={{ stopColor: '#3d6bff', stopOpacity: 0.22 }} />
              <stop offset="1" style={{ stopColor: '#2a55ff', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <rect x={M.left} y={M.top} width={Math.max(0, px - M.left)} height={H - M.bottom - M.top} fill={`url(#${glowId}-past)`} style={{ transition: 'width .18s ease-out' }} />
          {yTicks.map((v) => (
            <line key={v} x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
          ))}
          {bands.map(([lo, hi, op]) => (
            <path
              key={lo}
              data-area={`${fan.levels[lo]}-${fan.levels[hi]}`}
              d={areaGen(lo, hi)}
              fill={`url(#${glowId}-band)`}
              opacity={op}
              style={{ transition: ease }}
            />
          ))}
          {fan.levels.map((p, l) => {
            const outer = l === 0 || l === L - 1;
            const near = l === 1 || l === L - 2;
            if (l === mid) return null;
            return (
              <path
                key={p}
                data-level={p}
                d={lineGen(l)}
                fill="none"
                stroke={outer ? 'rgba(255,255,255,0.28)' : near ? '#7fa8ff' : 'none'}
                strokeOpacity={near ? 0.55 : undefined}
                strokeWidth={1}
                strokeDasharray={outer ? '2 5' : undefined}
                style={{ transition: ease }}
              />
            );
          })}
          {/* mediana: szeroka niebieska poświata, miękki środek i cienka linia z gradientem podążającym za znacznikiem */}
          <path d={lineGen(mid)} aria-hidden="true" fill="none" stroke="#2a55ff" strokeWidth={18} strokeLinecap="round" style={{ opacity: 0.22, filter: 'blur(12px)', transition: ease }} />
          <path d={lineGen(mid)} aria-hidden="true" fill="none" stroke={`url(#${glowId}-spot)`} strokeWidth={7} strokeLinecap="round" style={{ opacity: 0.45, filter: 'blur(3px)', transition: ease }} />
          <path data-level={fan.levels[mid]} d={lineGen(mid)} fill="none" stroke={`url(#${glowId}-spot)`} strokeWidth={2.6} strokeLinecap="round" style={{ transition: ease }} />
          {/* światło płynące po liniach: wszystkie warstwy na jednej osi czasu (6 s) */}
          {glowLayers(1, false)}
          {glowLayers(L - 2, false)}
          {glowLayers(mid, true)}
          <g style={{ transform: `translate(${px}px,0px)`, transition: 'transform .18s ease-out' }}>
            <line x1={0} x2={0} y1={M.top} y2={H - M.bottom} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="2 4" />
          </g>
          {[1, L - 2].map((l) => (
            <g key={l} style={{ transform: `translate(${px}px,${y(at(l, j))}px)`, transition: 'transform .18s ease-out' }}>
              <circle r={3.5} fill="#030409" stroke="#9db9ff" strokeWidth={1.5} />
            </g>
          ))}
          <g style={{ transform: `translate(${px}px,${pyMed}px)`, transition: 'transform .18s ease-out' }}>
            <circle r={34} fill={`url(#${glowId}-bloom)`} />
            <circle r={11} fill="none" stroke="#9db9ff" strokeWidth={1} className="fv-ring" aria-hidden="true" />
            <circle r={11} fill="rgba(3,4,9,0.35)" stroke="rgba(225,233,255,0.55)" strokeWidth={1} />
            <circle r={4} fill="#ffffff" />
          </g>
        </svg>
        {yTicks.map((v) => (
          <span
            key={v}
            aria-hidden="true"
            className="pointer-events-none absolute font-mono text-[10.5px] whitespace-nowrap text-label"
            style={{ left: `${((M.left - 11) / W) * 100}%`, top: `${(y(v) / H) * 100}%`, transform: 'translate(-100%,-50%)' }}
          >
            {formatValue(v)}
          </span>
        ))}
        {xTicks.map((v, i) => (
          <span
            key={v}
            aria-hidden="true"
            className="pointer-events-none absolute font-mono text-[11px] whitespace-nowrap text-label"
            style={{
              left: `${(x(v) / W) * 100}%`,
              top: '95.5%',
              transform: i === 0 ? 'translate(-20%,-50%)' : i === xTicks.length - 1 ? 'translate(-100%,-50%)' : 'translate(-50%,-50%)',
            }}
          >
            {xLabel(v)}
          </span>
        ))}
        {/* podpowiedź przy wskaźniku: odczyt w częstościach naturalnych (ta sama treść jest niżej dla czytników ekranu) */}
        <div
          aria-hidden="true"
          className="glass glass-tip pointer-events-none absolute top-[3%] flex min-w-[190px] flex-col gap-1.5 rounded-[18px] px-3.5 py-3 transition-[left] duration-[180ms] ease-out"
          style={{ left: `${(px / W) * 100}%`, transform: px > W * 0.56 ? 'translate(calc(-100% - 22px),0)' : 'translate(22px,0)' }}
        >
          {tipTitle && <span className="eyebrow !text-[10px]">{tipTitle}</span>}
          {[...lines].reverse().map(({ l, k }) => (
            <div key={l} className="flex justify-between gap-4 text-[13px] whitespace-nowrap">
              <span className="text-fg/70">{l === mid ? t`Mediana` : t`${k} na 10 więcej niż`}</span>
              <span className={`tabular-nums ${l === mid ? 'text-fg' : 'text-accent-text'}`}>
                <Roll text={formatValue(at(l, j))} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap justify-between gap-x-6 gap-y-2.5 border-t border-hairline pt-3.5">
        <div className="eyebrow flex flex-wrap gap-x-5 gap-y-2" aria-hidden="true">
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-[18px] rounded-sm bg-white shadow-[0_0_8px_#4d7dff]" />
            {t`Mediana`}
          </span>
          {[
            { lo: 2, hi: L - 3, a: 0.55 },
            { lo: 1, hi: L - 2, a: 0.3 },
            { lo: 0, hi: L - 1, a: 0.14 },
          ].map(({ lo, hi, a }) => (
            <span key={lo} className="flex items-center gap-2">
              <span className="h-2.5 w-3.5 rounded-[3px]" style={{ background: `rgba(127,168,255,${a})` }} />
              {pct(lo)}–{pct(hi)}%
            </span>
          ))}
        </div>
        <span className="eyebrow">{t`Lata od dziś — przesuń po wykresie`}</span>
      </div>
      <ul data-testid="fan-readout" className="sr-only m-0 list-none p-0">
        {lines.map(({ l, k }) => {
          const v = formatValue(at(l, j));
          return <li key={l}>{t`w ${k} na 10 przyszłości więcej niż ${v}`}</li>;
        })}
      </ul>
      <details className="mt-3.5">
        <summary className="eyebrow-sm min-h-11 cursor-pointer py-2.5">{t`Pokaż dane wachlarza w tabeli`}</summary>
        <DataTable
          caption={t`${label}: dane w tabeli`}
          cornerLabel={t`Okres`}
          columns={fan.levels.map((p) => `${Math.round(p * 100)}%`)}
          rows={Array.from({ length: G }, (_, k) => k).map((k) => ({
            label: periodLabel(fan.months[k]!, yearWord, monthWord),
            cells: fan.levels.map((_, l) => formatValue(at(l, k))),
          }))}
        />
      </details>
    </figure>
  );
}
