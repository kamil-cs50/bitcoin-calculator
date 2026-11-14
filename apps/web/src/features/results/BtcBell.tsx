import { useId } from 'react';

/*
 * Ozdobna „dzwonowa” krzywa karty Bitcoina z projektu Claude Design (v3): świecąca linia, smugi i znacznik
 * na szczycie. To czysta oprawa graficzna: kształt jest stały i NIE przedstawia obliczonego rozkładu
 * (liczby rozkładu ceny pokazuje tabela obok); z tego powodu cały element jest ukryty przed czytnikami ekranu.
 */
export const BX = (z: number): number => 260 + (z / 4.2) * 250;
const BY = (z: number): number => 192 - 164 * Math.exp(-(z * z) / 2 / 0.55);
/** Odwrotność BX: pozycja w układzie 520 px → z. */
export const zAt = (px: number): number => ((px - 260) / 250) * 4.2;

/** Gładka krzywa przez punkty (Catmull-Rom → Bézier), jak w prototypie. */
function smooth(pts: [number, number][]): string {
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const LINE = smooth(Array.from({ length: 61 }, (_, i) => -4.2 + (8.4 * i) / 60).map((z) => [BX(z), BY(z)] as [number, number]));
const BARS = Array.from({ length: 64 }, (_, i) => {
  const z = -3.6 + (7.2 * i) / 63;
  const y = BY(z) + 7;
  return { z, x: BX(z) - 1, y, h: Math.max(0, 200 - y), op: 0.3 + 0.7 * Math.exp(-(z * z) / 1.2), dl: -(1 - i / 63) * 6 };
});

const FLOW = [
  { c: '#1f5bff', w: 30, f: 0.3, o: 0.75, b: 18, dl: 0 },
  { c: '#4d7dff', w: 15, f: 0.21, o: 0.75, b: 9, dl: -0.27 },
  { c: '#a9c3ff', w: 6.5, f: 0.13, o: 0.8, b: 4, dl: -0.51 },
  { c: '#ffffff', w: 2.2, f: 0.07, o: 0.9, b: 1.4, dl: -0.69 },
];

export interface BtcBellProps {
  /** Wybrany punkt krzywej (z, przesuwanie); null = mediana. */
  z?: number | null;
  /** Przesuwanie po krzywej: z albo null po opuszczeniu. Bez niego krzywa jest tylko ozdobą. */
  onScrub?: (z: number | null) => void;
}

export function BtcBell({ z = null, onScrub }: BtcBellProps) {
  const id = useId().replace(/:/g, '');
  const zz = z ?? 0;
  const mx = BX(zz);
  const my = BY(zz);
  const scrub = (e: { currentTarget: SVGSVGElement; clientX: number }): void => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!onScrub || r.width === 0) return;
    onScrub(zAt(((e.clientX - r.left) / r.width) * 520));
  };
  return (
    <svg
      viewBox="0 0 520 230"
      aria-hidden="true"
      focusable="false"
      className={`block h-auto w-full overflow-visible ${onScrub ? 'cursor-crosshair touch-pan-y' : ''}`}
      onPointerMove={onScrub ? scrub : undefined}
      onPointerDown={onScrub ? scrub : undefined}
      onPointerLeave={onScrub ? () => onScrub(null) : undefined}
    >
      <defs>
        <linearGradient id={`${id}-streak`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: '#dbe5ff', stopOpacity: 0.95 }} />
          <stop offset="0.35" style={{ stopColor: '#4d7dff', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: '#2a55ff', stopOpacity: 0.02 }} />
        </linearGradient>
        <radialGradient id={`${id}-spot`} gradientUnits="userSpaceOnUse" cx={mx} cy={my} r={300}>
          <stop offset="0" style={{ stopColor: '#ffffff' }} />
          <stop offset="0.3" style={{ stopColor: '#b9cdff' }} />
          <stop offset="1" style={{ stopColor: '#4d7dff', stopOpacity: 0.25 }} />
        </radialGradient>
        <radialGradient id={`${id}-bloom`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: '#8fb0ff', stopOpacity: 0.6 }} />
          <stop offset="0.35" style={{ stopColor: '#3d6bff', stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: '#2a55ff', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      {BARS.map((b, i) => (
        <rect
          key={i}
          x={b.x.toFixed(1)}
          y={b.y.toFixed(1)}
          width={2}
          height={b.h.toFixed(1)}
          rx={1}
          fill={`url(#${id}-streak)`}
          opacity={(z === null ? b.op : b.z >= z ? 0.95 : 0.16).toFixed(2)}
          className="fv-shimmer"
          style={{ animationDelay: `${b.dl.toFixed(2)}s`, transition: 'opacity .25s' }}
        />
      ))}
      <line x1={0} x2={520} y1={200} y2={200} stroke="rgba(255,255,255,0.14)" />
      <path d={LINE} fill="none" stroke="#2a55ff" strokeWidth={18} style={{ opacity: 0.25, filter: 'blur(12px)' }} />
      <path d={LINE} fill="none" stroke={`url(#${id}-spot)`} strokeWidth={7} style={{ opacity: 0.45, filter: 'blur(3px)' }} />
      <path d={LINE} fill="none" stroke={`url(#${id}-spot)`} strokeWidth={2.6} strokeLinecap="round" />
      {FLOW.map((g) => (
        <path
          key={g.c}
          d={LINE}
          pathLength={1}
          className="fv-flow"
          style={{
            stroke: g.c,
            strokeWidth: g.w,
            strokeDasharray: `${g.f} ${(1 - g.f).toFixed(2)}`,
            opacity: g.o,
            filter: `blur(${g.b}px)`,
            animationDelay: `${g.dl}s`,
          }}
        />
      ))}
      <g style={{ transform: `translate(${mx}px,${my}px)`, transition: 'transform .18s ease-out' }}>
        <line x1={0} x2={0} y1={12} y2={200 - my} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 4" />
        <circle r={34} fill={`url(#${id}-bloom)`} />
        <circle r={11} fill="none" stroke="#9db9ff" strokeWidth={1} className="fv-ring" />
        <circle r={11} fill="rgba(3,4,9,0.35)" stroke="rgba(225,233,255,0.55)" strokeWidth={1} />
        <circle r={4} fill="#ffffff" />
      </g>
    </svg>
  );
}
