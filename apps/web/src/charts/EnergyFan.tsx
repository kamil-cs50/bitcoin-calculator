import { useEffect, useId, useMemo, useRef } from 'react';

/*
 * Warstwa graficzna wachlarza „energia” (projekt Claude Design „Wykres przyszłości – energia”):
 * pasma z poziomym gradientem i połyskiem, krawędzie, przerywane 5/95%, linie 10/90%, mediana z poświatą,
 * smuga światła po pasmach, trzy zsynchronizowane „komety” (mediana, 10%, 90%) z iskrami i puls na końcu.
 *
 * To wyłącznie oprawa: dostaje gotowe współrzędne linii percentyli (w jednostkach viewBox rodzica) i nic
 * nie liczy na danych. Rysuje się jako <g> wewnątrz <svg> wykresu; osie, podpisy i obsługę wskaźnika
 * zapewnia komponent nadrzędny. Animacja wyłącza się przy prefers-reduced-motion (zostaje stan statyczny).
 */

export type Pt = [number, number];

export interface EnergyFanProps {
  /** Siedem linii percentyli w kolejności 5, 10, 25, 50, 75, 90, 95% (punkty od lewej do prawej). */
  lines: Pt[][];
  /** Czas jednego przebiegu świateł w sekundach (projekt: 6 s). */
  period?: number;
  /** Siła świateł (projekt: 1). */
  intensity?: number;
  /** Atrybuty data-level na liniach (np. 0.05 … 0.95) dla testów i narzędzi. */
  levels?: number[];
}

/** Ścieżka przez punkty: przy rzadkich danych gładka (Catmull-Rom → Bézier), przy gęstych łamana. */
export function pathOf(pts: Pt[], cont = false): string {
  if (pts.length === 0) return '';
  const f = (n: number) => n.toFixed(1);
  if (pts.length > 40) return `${cont ? 'L' : 'M'}${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`;
  let d = `${cont ? 'L' : 'M'}${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

const bandOf = (lo: Pt[], hi: Pt[]): string => `${pathOf(hi)} ${pathOf([...lo].reverse(), true)} Z`;

interface Arc {
  a: [number, number, number][];
  L: number;
}
/** Tablica długości łuku (do prowadzenia iskier po linii). */
export function arcOf(pts: Pt[]): Arc {
  const a: [number, number, number][] = [];
  let L = 0;
  pts.forEach(([x, y], i) => {
    if (i) L += Math.hypot(x - a[i - 1]![0], y - a[i - 1]![1]);
    a.push([x, y, L]);
  });
  return { a, L };
}
/** Położenie i kierunek na ułamku `p` długości łuku. */
export function pointAt(g: Arc, p: number): { x: number; y: number; tx: number; ty: number } {
  const a = g.a;
  if (a.length < 2) return { x: a[0]?.[0] ?? 0, y: a[0]?.[1] ?? 0, tx: 1, ty: 0 };
  const T = Math.min(1, Math.max(0, p)) * g.L;
  let i = 1;
  while (i < a.length - 1 && a[i]![2] < T) i++;
  const [x0, y0, l0] = a[i - 1]!;
  const [x1, y1, l1] = a[i]!;
  const k = l1 > l0 ? (T - l0) / (l1 - l0) : 0;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, tx: (x1 - x0) / len, ty: (y1 - y0) / len };
}

const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const COL = ['#ffffff', '#e6f0ff', '#a9ccff', '#6fa8ff', '#3d7fff'];
const NS = 'http://www.w3.org/2000/svg';
// komety: [klucz, długość smugi, krycie]; mediana cztery warstwy, 10/90% po trzy
const MED: [string, number, number][] = [
  ['m0', 0.42, 0.5],
  ['m1', 0.32, 0.95],
  ['m2', 0.18, 1],
  ['m3', 0.08, 1],
];
const SIDE: [string, number, number][] = [
  ['a', 0.26, 0.75],
  ['c', 0.14, 0.9],
  ['b', 0.07, 1],
];

export function EnergyFan({ lines, period = 6, intensity = 1, levels }: EnergyFanProps) {
  const id = useId().replace(/:/g, '');
  const u = (k: string) => `${id}-${k}`;
  const refs = useRef<Record<string, SVGElement | null>>({});
  const set = (k: string) => (el: SVGElement | null) => {
    refs.current[k] = el;
  };
  const sparkRef = useRef<SVGGElement | null>(null);

  const [l5, l10, l25, l50, l75, l90, l95] = lines as [Pt[], Pt[], Pt[], Pt[], Pt[], Pt[], Pt[]];
  const d = useMemo(
    () => ({
      b95: bandOf(l5, l95),
      b90: bandOf(l10, l90),
      b50: bandOf(l25, l75),
      l5: pathOf(l5),
      l10: pathOf(l10),
      l25: pathOf(l25),
      l50: pathOf(l50),
      l75: pathOf(l75),
      l90: pathOf(l90),
      l95: pathOf(l95),
    }),
    [l5, l10, l25, l50, l75, l90, l95],
  );
  // geometria komet i smugi światła (tylko do animacji)
  const geo = useMemo(() => ({ m: arcOf(l50), u: arcOf(l90), d: arcOf(l10) }), [l50, l90, l10]);
  const start = l50[0] ?? [0, 0];
  const end = l50[l50.length - 1] ?? [0, 0];
  const e90 = l90[l90.length - 1] ?? end;
  const e10 = l10[l10.length - 1] ?? end;
  const x0 = start[0];
  const x1 = end[0];
  const mid = l50[Math.round((l50.length - 1) * 0.6)] ?? end;

  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    let last = t0;
    let raf = 0;
    const pool: { el: SVGCircleElement; x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }[] = [];
    const acc = [0, 0, 0];
    const setDash = (k: string, off: number, op: number) => {
      const el = refs.current[k];
      if (!el) return;
      el.style.strokeDashoffset = String(off);
      el.style.opacity = String(Math.min(1, op));
    };
    const spawn = (h: ReturnType<typeof pointAt>, sp: number) => {
      let s = pool.find((q) => q.life <= 0);
      if (!s) {
        const g = sparkRef.current;
        if (pool.length >= 220 || !g) return;
        const el = document.createElementNS(NS, 'circle');
        g.appendChild(el);
        s = { el, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 1 };
        pool.push(s);
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = (12 + Math.random() * 46) * sp;
      const back = (8 + Math.random() * 34) * sp;
      s.x = h.x;
      s.y = h.y;
      s.vx = -h.tx * back + -h.ty * out * side;
      s.vy = -h.ty * back + h.tx * out * side;
      s.max = s.life = 0.45 + Math.random() * 0.75;
      s.r = 0.5 + Math.random() * 1.5;
      s.el.setAttribute('fill', COL[(Math.random() * COL.length) | 0]!);
    };
    const tick = (now: number) => {
      const P = period * 1000;
      const I = intensity;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cyc = ((now - t0) % P) / P;
      const c = Math.min(1, cyc / 0.82);
      const p = ease(c);
      const fade = Math.sin(Math.PI * c);
      for (const [k, L, o] of MED) setDash(k, L - p, o * fade * I);
      for (const line of ['u', 'd']) for (const [k, L, o] of SIDE) setDash(`${line}${k}`, L - p, o * fade * 0.8 * I);
      if (!reduce && fade > 0.12) {
        ([
          [geo.m, 95, 1.1],
          [geo.u, 38, 0.8],
          [geo.d, 38, 0.8],
        ] as const).forEach(([g, rate, sp], gi) => {
          acc[gi]! += rate * dt * fade * I;
          const h = pointAt(g, p);
          while (acc[gi]! >= 1) {
            acc[gi]! -= 1;
            spawn(h, sp);
          }
        });
      }
      for (const s of pool) {
        if (s.life <= 0) {
          if (s.el.style.opacity !== '0') s.el.style.opacity = '0';
          continue;
        }
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.94;
        s.vy *= 0.94;
        const k = Math.max(0, s.life / s.max);
        s.el.setAttribute('cx', s.x.toFixed(1));
        s.el.setAttribute('cy', s.y.toFixed(1));
        s.el.setAttribute('r', (s.r * (0.4 + 0.6 * k)).toFixed(2));
        s.el.style.opacity = Math.min(1, k * k * 1.4 * I).toFixed(3);
      }
      const sw = refs.current.sweep;
      if (sw) {
        sw.setAttribute('cx', (x0 + (x1 - x0) * p).toFixed(1));
        sw.style.opacity = (fade * 0.9 * I).toFixed(3);
      }
      const arr = Math.max(0, 1 - Math.abs(cyc - 0.82) / 0.14);
      const ring = refs.current.ring;
      const halo = refs.current.halo;
      if (ring) {
        ring.setAttribute('r', (12 + arr * 6).toFixed(2));
        ring.style.opacity = (0.45 + arr * 0.5).toFixed(3);
      }
      if (halo) {
        halo.setAttribute('r', (14 + arr * 8).toFixed(2));
        halo.style.opacity = (0.25 + arr * 0.45 * I).toFixed(3);
      }
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    if (reduce) tick(t0 + 0.6 * period * 1000);
    else raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const s of pool) s.el.remove();
    };
  }, [geo, period, intensity, x0, x1]);

  const lv = (i: number) => (levels ? { 'data-level': levels[i] } : {});
  const comet = (k: string, dPath: string, stroke: string, w: number, dash: number, filter: string) => (
    <path
      key={k}
      ref={set(k)}
      d={dPath}
      pathLength={1}
      filter={`url(#${u(filter)})`}
      style={{ fill: 'none', stroke, strokeWidth: w, strokeLinecap: 'round', strokeDasharray: `${dash} 3`, strokeDashoffset: 1, opacity: 0 }}
    />
  );

  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={u('b95')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: '#2f6bff', stopOpacity: 0.015 }} />
          <stop offset="1" style={{ stopColor: '#3d78ff', stopOpacity: 0.08 }} />
        </linearGradient>
        <linearGradient id={u('b90')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: '#3d78ff', stopOpacity: 0.02 }} />
          <stop offset="1" style={{ stopColor: '#4f8bff', stopOpacity: 0.12 }} />
        </linearGradient>
        <linearGradient id={u('b50')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: '#5a92ff', stopOpacity: 0.05 }} />
          <stop offset="1" style={{ stopColor: '#6fa2ff', stopOpacity: 0.24 }} />
        </linearGradient>
        <linearGradient id={u('med')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: '#8fb8ff', stopOpacity: 0.7 }} />
          <stop offset="1" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id={u('sheen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: '#ffffff', stopOpacity: 0.08 }} />
          <stop offset="0.35" style={{ stopColor: '#ffffff', stopOpacity: 0.015 }} />
          <stop offset="1" style={{ stopColor: '#ffffff', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={u('edge')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: '#ffffff', stopOpacity: 0.05 }} />
          <stop offset="1" style={{ stopColor: '#ffffff', stopOpacity: 0.45 }} />
        </linearGradient>
        <radialGradient id={u('sweepG')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: '#7fb0ff', stopOpacity: 0.5 }} />
          <stop offset="0.55" style={{ stopColor: '#2f6bff', stopOpacity: 0.16 }} />
          <stop offset="1" style={{ stopColor: '#2f6bff', stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={u('fan')}>
          <path d={d.b95} />
        </clipPath>
        <filter id={u('L')} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={u('M')} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id={u('XL')} x="-30%" y="-300%" width="160%" height="700%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
        <filter id={u('S')} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
        <filter id={u('X')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id={u('spark')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path data-area="0.05-0.95" d={d.b95} style={{ fill: `url(#${u('b95')})` }} />
      <path data-area="0.1-0.9" d={d.b90} style={{ fill: `url(#${u('b90')})` }} />
      <path data-area="0.25-0.75" d={d.b50} style={{ fill: `url(#${u('b50')})` }} />
      <path d={d.b95} style={{ fill: `url(#${u('sheen')})` }} />
      <path d={d.b90} style={{ fill: `url(#${u('sheen')})` }} />
      <path d={d.b50} style={{ fill: `url(#${u('sheen')})` }} />
      <path {...lv(4)} d={d.l75} style={{ fill: 'none', stroke: `url(#${u('edge')})`, strokeWidth: 0.8 }} />
      <path {...lv(2)} d={d.l25} style={{ fill: 'none', stroke: `url(#${u('edge')})`, strokeWidth: 0.6, opacity: 0.5 }} />
      <g style={{ clipPath: `url(#${u('fan')})`, mixBlendMode: 'screen' }}>
        <ellipse
          ref={set('sweep')}
          cx={-200}
          cy={mid[1]}
          rx={70}
          ry={170}
          filter={`url(#${u('X')})`}
          style={{ fill: `url(#${u('sweepG')})`, opacity: 0 }}
        />
      </g>
      <path {...lv(6)} d={d.l95} style={{ fill: 'none', stroke: 'rgba(157,185,255,0.42)', strokeWidth: 1, strokeDasharray: '1.5 4', strokeLinecap: 'round' }} />
      <path {...lv(0)} d={d.l5} style={{ fill: 'none', stroke: 'rgba(157,185,255,0.42)', strokeWidth: 1, strokeDasharray: '1.5 4', strokeLinecap: 'round' }} />
      <path {...lv(5)} d={d.l90} style={{ fill: 'none', stroke: 'rgba(157,185,255,0.62)', strokeWidth: 1 }} />
      <path {...lv(1)} d={d.l10} style={{ fill: 'none', stroke: 'rgba(157,185,255,0.62)', strokeWidth: 1 }} />
      <path d={d.l50} filter={`url(#${u('M')})`} style={{ fill: 'none', stroke: '#3d78ff', strokeWidth: 6, opacity: 0.45 }} />
      <path {...lv(3)} d={d.l50} style={{ fill: 'none', stroke: `url(#${u('med')})`, strokeWidth: 2, strokeLinecap: 'round' }} />
      <g style={{ mixBlendMode: 'screen' }}>
        {comet('ua', d.l90, '#2f6bff', 10, 0.26, 'L')}
        {comet('uc', d.l90, '#7fb4ff', 3.5, 0.14, 'M')}
        {comet('ub', d.l90, '#f2f7ff', 1.6, 0.07, 'S')}
        {comet('da', d.l10, '#2f6bff', 10, 0.26, 'L')}
        {comet('dc', d.l10, '#7fb4ff', 3.5, 0.14, 'M')}
        {comet('db', d.l10, '#f2f7ff', 1.6, 0.07, 'S')}
        {comet('m0', d.l50, '#1f5bff', 34, 0.42, 'XL')}
        {comet('m1', d.l50, '#3d7fff', 15, 0.32, 'L')}
        {comet('m2', d.l50, '#8cc0ff', 6, 0.18, 'M')}
        {comet('m3', d.l50, '#ffffff', 3, 0.08, 'S')}
      </g>
      <g ref={sparkRef} filter={`url(#${u('spark')})`} style={{ mixBlendMode: 'screen' }} />
      <circle cx={start[0]} cy={start[1]} r={3} style={{ fill: '#9db9ff' }} />
      <circle cx={e90[0]} cy={e90[1]} r={4} style={{ fill: 'rgba(255,255,255,0.14)', stroke: 'rgba(220,230,255,0.85)', strokeWidth: 1.2 }} />
      <circle cx={e10[0]} cy={e10[1]} r={4} style={{ fill: 'rgba(255,255,255,0.14)', stroke: 'rgba(220,230,255,0.85)', strokeWidth: 1.2 }} />
      <circle ref={set('halo')} cx={end[0]} cy={end[1]} r={14} filter={`url(#${u('M')})`} style={{ fill: '#3d7fff', opacity: 0.3 }} />
      <circle ref={set('ring')} cx={end[0]} cy={end[1]} r={12} style={{ fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(220,230,255,0.5)', strokeWidth: 1 }} />
      <circle cx={end[0]} cy={end[1]} r={4.5} style={{ fill: '#ffffff' }} />
    </g>
  );
}

/** Odczyt pod wykresem: trzy szklane karty „9 na 10 · 2046 / więcej niż …” (bez blur, szkło aplikacji). */
export function FanReadoutCards({ items }: { items: { head: string; lead: string; value: string; strong?: boolean }[] }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-3">
      {items.map((r) => (
        <div key={r.head} className="glass flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5">
          <span className={`font-mono text-[10.5px] tracking-[0.06em] uppercase ${r.strong ? 'text-fg' : 'text-label'}`}>{r.head}</span>
          <span className="text-[14px] font-light text-fg/85">
            {r.lead} <span className="font-normal whitespace-nowrap text-fg tabular-nums">{r.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Legenda wachlarza „energia”: mediana i trzy pasma z obramowaniem jak w projekcie. */
export function EnergyLegend({ median }: { median: string }) {
  return (
    <div aria-hidden="true" className="eyebrow flex flex-wrap gap-x-[26px] gap-y-3">
      <span className="flex items-center gap-2.5">
        <span className="h-0.5 w-6 rounded-sm bg-white shadow-[0_0_10px_#3d7fff]" />
        {median}
      </span>
      <span className="flex items-center gap-2.5">
        <span className="h-[11px] w-[18px] rounded-[3px] border-t border-white/50 bg-[rgba(111,162,255,0.32)]" />
        25–75%
      </span>
      <span className="flex items-center gap-2.5">
        <span className="h-[11px] w-[18px] rounded-[3px] border-y border-[rgba(157,185,255,0.7)] bg-[rgba(79,139,255,0.18)]" />
        10–90%
      </span>
      <span className="flex items-center gap-2.5">
        <span className="h-[11px] w-[18px] rounded-[3px] border-y border-dotted border-[rgba(157,185,255,0.6)] bg-[rgba(61,120,255,0.11)]" />
        5–95%
      </span>
    </div>
  );
}
