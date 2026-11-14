import { useLingui } from '@lingui/react/macro';
import { useMemo, useState, type PointerEvent } from 'react';
import { EnergyFan, EnergyLegend, FanReadoutCards, type Pt } from '../../charts/EnergyFan';
import { numberLocale } from '../../i18n';

/*
 * Ilustracja „Możliwe przyszłości” na ekranie startowym (projekt „Wykres przyszłości – energia”).
 * To PRZYKŁAD z projektu, nie wynik użytkownika: 250 tys. zł na 20 lat, prosty rozkład log-normalny
 * (6% dryfu, 16% zmienności). Liczby służą tylko pokazaniu, jak czytać wachlarz; karta jest
 * podpisana „Ilustracja”, a prawdziwe wyniki liczy silnik na stronie Wynik.
 */
const T = 20;
const V0 = 250_000;
const MU = 0.06;
const SG = 0.16;
const VM = 3e6;
const N = 80;
const Z = [-1.645, -1.2816, -0.6745, 0, 0.6745, 1.2816, 1.645];
const X = (t: number): number => 78 + (546 * t) / T;
const Y = (v: number): number => 286 - (274 * v) / VM;
const qz = (t: number, z: number): number => V0 * Math.exp(MU * t + z * SG * Math.sqrt(t));

export function HeroFan() {
  const { t } = useLingui();
  const [hover, setHover] = useState<number | null>(null);
  const year0 = new Date().getFullYear();
  const lines = useMemo(
    () => Z.map((z) => Array.from({ length: N + 1 }, (_, i): Pt => [X((T * i) / N), Y(qz((T * i) / N, z))])),
    [],
  );
  const short = (v: number): string => {
    const nf = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 });
    return v >= 1e6 ? t`${nf.format(Math.round(v / 1e5) / 10)} mln zł` : t`${nf.format(Math.round(v / 1e3))} tys. zł`;
  };
  const tr = hover ?? T;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    const vx = ((e.clientX - r.left) / r.width) * 640;
    setHover(Math.max(1, Math.min(T, Math.round(((vx - 78) / 546) * T))));
  };
  const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5, fill: 'rgba(220,228,245,0.55)' };
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow">{t`Możliwe przyszłości`}</span>
        <span className="eyebrow-sm rounded-full border border-white/14 px-[15px] py-[7px]">{t`ilustracja`}</span>
      </div>
      <svg
        viewBox="0 0 640 320"
        aria-hidden="true"
        focusable="false"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        className="block h-auto w-full cursor-crosshair touch-pan-y overflow-visible"
      >
        <g style={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}>
          {[0, 1e6, 2e6, 3e6].map((v) => (
            <line key={v} x1={78} x2={624} y1={Y(v)} y2={Y(v)} />
          ))}
        </g>
        <g dominantBaseline="middle" style={{ ...mono, textAnchor: 'end' }}>
          {[0, 1e6, 2e6, 3e6].map((v) => (
            <text key={v} x={68} y={Y(v)}>
              {v ? t`${v / 1e6} mln` : '0'}
            </text>
          ))}
        </g>
        <g style={{ ...mono, textAnchor: 'middle' }}>
          {[0, 5, 10, 15, 20].map((s) => (
            <text key={s} x={X(s)} y={304}>
              {year0 + s}
            </text>
          ))}
        </g>
        <EnergyFan lines={lines} />
        {hover !== null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={12} y2={286} style={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }} />
            {[5, 3, 1].map((l) => (
              <circle
                key={l}
                cx={X(hover)}
                cy={Y(qz(hover, Z[l]!))}
                r={l === 3 ? 5 : 3.5}
                style={{ fill: l === 3 ? '#ffffff' : '#9db9ff', stroke: '#0a0e1e', strokeWidth: 2 }}
              />
            ))}
          </g>
        )}
      </svg>
      <FanReadoutCards
        items={[
          { k: 9, l: 1 },
          { k: 5, l: 3 },
          { k: 1, l: 5 },
        ].map(({ k, l }) => ({
          head: t`${k} na 10 · ${year0 + tr}`,
          lead: t`więcej niż`,
          value: short(qz(tr, Z[l]!)),
          strong: k === 5,
        }))}
      />
      <EnergyLegend median={t`Mediana`} />
    </div>
  );
}
