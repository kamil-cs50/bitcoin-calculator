import { useId } from 'react';

/*
 * Ozdobny wachlarz na ekranie startowym (oprawa w stylu wykresu wyników v3): kształt jest stały i NIE
 * przedstawia żadnego wyniku ani portfela — to ilustracja idei „wielu możliwych przyszłości”. Dlatego
 * cały rysunek jest ukryty przed czytnikami ekranu i nie ma na nim żadnych liczb.
 */
const W = 600;
const H = 340;
const X0 = 36;
const X1 = 560;
const Y0 = 262;
const N = 40;

// kwantyle rozkładu normalnego dla poziomów 5/10/25/50/75/90/95%
const Z = [-1.645, -1.2816, -0.6745, 0, 0.6745, 1.2816, 1.645];

function pt(k: number, z: number): [number, number] {
  const t = k / N;
  // „log” wartości: dryf w górę i rozrzut rosnący jak pierwiastek z czasu
  const y = Y0 - 90 * t - z * 70 * Math.sqrt(t) * (z > 0 ? 1.1 : 0.6);
  return [X0 + (X1 - X0) * t, y];
}

function smooth(pts: [number, number][], cont = false): string {
  let d = `${cont ? 'L' : 'M'}${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const line = (l: number): [number, number][] => Array.from({ length: N + 1 }, (_, k) => pt(k, Z[l]!));
const LINES = Z.map((_, l) => smooth(line(l)));
const area = (lo: number, hi: number): string => `${smooth(line(hi))} ${smooth(line(lo).reverse(), true)} Z`;
const BANDS: [string, number][] = [
  [area(0, 6), 0.32],
  [area(1, 5), 0.5],
  [area(2, 4), 0.85],
];
const END = pt(N, 0);

const FLOW = [
  { c: '#1f5bff', w: 30, f: 0.3, o: 0.75, b: 18, dl: 0 },
  { c: '#4d7dff', w: 15, f: 0.21, o: 0.75, b: 9, dl: -0.27 },
  { c: '#a9c3ff', w: 6.5, f: 0.13, o: 0.8, b: 4, dl: -0.51 },
  { c: '#ffffff', w: 2.2, f: 0.07, o: 0.9, b: 1.4, dl: -0.69 },
];

export function HeroFan() {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false" className="block h-auto w-full overflow-visible">
      <defs>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: '#7fa8ff', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: '#1d3fff', stopOpacity: 0.02 }} />
        </linearGradient>
        <radialGradient id={`${id}-spot`} gradientUnits="userSpaceOnUse" cx={END[0]} cy={END[1]} r={420}>
          <stop offset="0" style={{ stopColor: '#ffffff' }} />
          <stop offset="0.3" style={{ stopColor: '#b9cdff' }} />
          <stop offset="1" style={{ stopColor: '#4d7dff', stopOpacity: 0.4 }} />
        </radialGradient>
        <radialGradient id={`${id}-bloom`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: '#8fb0ff', stopOpacity: 0.6 }} />
          <stop offset="0.35" style={{ stopColor: '#3d6bff', stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: '#2a55ff', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      {[60, 120, 180, 240, 300].map((y) => (
        <line key={y} x1={X0} x2={X1} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
      ))}
      {BANDS.map(([d, op], i) => (
        <path key={i} d={d} fill={`url(#${id}-band)`} opacity={op} />
      ))}
      <path d={LINES[0]} fill="none" stroke="rgba(255,255,255,0.28)" strokeDasharray="2 5" />
      <path d={LINES[6]} fill="none" stroke="rgba(255,255,255,0.28)" strokeDasharray="2 5" />
      <path d={LINES[1]} fill="none" stroke="#7fa8ff" strokeOpacity={0.55} />
      <path d={LINES[5]} fill="none" stroke="#7fa8ff" strokeOpacity={0.55} />
      <path d={LINES[3]} fill="none" stroke="#2a55ff" strokeWidth={18} strokeLinecap="round" style={{ opacity: 0.22, filter: 'blur(12px)' }} />
      <path d={LINES[3]} fill="none" stroke={`url(#${id}-spot)`} strokeWidth={2.6} strokeLinecap="round" />
      {[1, 5, 3].map((l) =>
        FLOW.map((g) => (
          <path
            key={`${l}-${g.c}`}
            d={LINES[l]}
            pathLength={1}
            className="fv-flow"
            style={{
              stroke: g.c,
              strokeWidth: l === 3 ? g.w : g.w * 0.55,
              strokeDasharray: `${g.f} ${(1 - g.f).toFixed(2)}`,
              opacity: l === 3 ? g.o : g.o * 0.75,
              filter: `blur(${l === 3 ? g.b : g.b * 0.7}px)`,
              animationDelay: `${g.dl}s`,
            }}
          />
        )),
      )}
      <g style={{ transform: `translate(${END[0]}px,${END[1]}px)` }}>
        <circle r={34} fill={`url(#${id}-bloom)`} />
        <circle r={11} fill="none" stroke="#9db9ff" strokeWidth={1} className="fv-ring" />
        <circle r={11} fill="rgba(3,4,9,0.35)" stroke="rgba(225,233,255,0.55)" strokeWidth={1} />
        <circle r={4} fill="#ffffff" />
      </g>
      {[1, 5].map((l) => {
        const p = pt(N, Z[l]!);
        return <circle key={l} cx={p[0]} cy={p[1]} r={3.5} fill="#030409" stroke="#9db9ff" strokeWidth={1.5} />;
      })}
    </svg>
  );
}
