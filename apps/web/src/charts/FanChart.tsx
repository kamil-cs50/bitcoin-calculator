import { useLingui } from '@lingui/react/macro';
import type { FanChart as FanData } from '@sim/engine';
import { scaleLinear, scaleLog } from 'd3-scale';
import { useId, type PointerEvent } from 'react';
import { DataTable } from './DataTable';
import { EnergyFan, EnergyLegend, FanReadoutCards, type Pt } from './EnergyFan';

export interface FanChartProps {
  fan: FanData;
  /** Wybrany punkt czasu (miesiące od startu); najbliższy punkt siatki. */
  month: number;
  onMonthChange?: (month: number) => void;
  formatValue: (v: number) => string;
  label: string;
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
  scale = 'log',
  windowMonths,
  startYear,
  startMonth = 1,
}: FanChartProps) {
  const { t } = useLingui();
  const titleId = useId();
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

  // współrzędne linii percentyli (5…95%) w oknie czasu; rysuje je warstwa „energia”
  const pts = (l: number): Pt[] => idx.map((k): Pt => [x(fan.months[k]! / 12), y(at(l, k))]);
  const energyLines = fan.levels.map((_, l) => pts(l));

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
  const yTicks = useLog ? logTicks(logLo, logHi) : yLin.ticks(5);
  const yearAt = (m: number): number | string =>
    startYear === undefined ? m / 12 : startYear + Math.floor((startMonth - 1 + m) / 12);

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
          {yTicks.map((v) => (
            <line key={v} x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}
          <EnergyFan lines={energyLines} levels={Array.from(fan.levels)} />
          {/* wybrany rok: pionowa linia i kropki 90% / mediana / 10% (jak najechanie w projekcie „energia”) */}
          <g style={{ transform: `translate(${px}px,0px)`, transition: 'transform .18s ease-out' }}>
            <line x1={0} x2={0} y1={M.top} y2={H - M.bottom} style={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }} />
          </g>
          {[L - 2, mid, 1].map((l) => (
            <g key={l} style={{ transform: `translate(${px}px,${y(at(l, j))}px)`, transition: 'transform .18s ease-out' }}>
              <circle r={l === mid ? 5 : 3.5} style={{ fill: l === mid ? '#ffffff' : '#9db9ff', stroke: '#0a0e1e', strokeWidth: 2 }} />
            </g>
          ))}
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
      </div>
      <div className="mt-[22px]">
        <FanReadoutCards
          items={lines
            .slice()
            .map(({ l, k }) => ({
              head: t`${k} na 10 · ${yearAt(fan.months[j]!)}`,
              lead: t`więcej niż`,
              value: formatValue(at(l, j)),
              strong: l === mid,
            }))}
        />
      </div>
      <div className="mt-[22px] flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <EnergyLegend median={t`Mediana`} />
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
