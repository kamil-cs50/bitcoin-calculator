import { useEffect, useRef, useState, type CSSProperties } from 'react';

/*
 * Zegar „split-flap” z projektu Claude Design (v3): każda cyfra to klapka z dwóch połówek, która
 * odwraca się przy zmianie. Wyłącznie oprawa: komponent dostaje gotowy napis i niczego nie liczy.
 * Rozmiar steruje font-size rodzica (wszystko w em). Klapki są ukryte przed czytnikiem ekranu (aria-hidden):
 * pełną wartość musi podać wywołujący, np. w elemencie sr-only.
 */
const GAP = 560;

interface FlapState {
  cur: string[];
  prev: string[];
  gen: number[];
  delay: number[];
}

const init = (text: string): FlapState => {
  const cur = [...text];
  return { cur, prev: cur.slice(), gen: cur.map(() => 0), delay: [] };
};

function advance(s: FlapState, text: string): FlapState {
  const ch = [...text];
  const delay: number[] = [];
  let k = 0;
  const gen = ch.map((c, i) => {
    const g = s.gen[i] ?? 0;
    if (c !== s.cur[i]) {
      delay[i] = k++ * 60;
      return g + 1;
    }
    return g;
  });
  return { cur: ch, prev: ch.map((_, i) => s.cur[i] ?? ' '), gen, delay };
}

const half = (char: string, top: boolean, extra?: CSSProperties) => (
  <span
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      height: '50%',
      top: top ? 0 : '50%',
      overflow: 'hidden',
      background: top
        ? 'linear-gradient(180deg,rgba(30,35,56,0.94) 0%,rgba(19,23,39,0.96) 100%)'
        : 'linear-gradient(180deg,rgba(14,17,30,0.97) 0%,rgba(22,27,45,0.95) 100%)',
      borderRadius: top ? '0.075em 0.075em 0 0' : '0 0 0.075em 0.075em',
      transformOrigin: top ? '50% 100%' : '50% 0%',
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      ...extra,
    }}
  >
    <span
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: top ? 0 : '-100%',
        height: '200%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.84em',
        fontWeight: 300,
        color: '#f3f5fb',
        letterSpacing: 0,
      }}
    >
      {char}
    </span>
  </span>
);

export function Flap({ text }: { text: string }) {
  const [s, setS] = useState(() => init(text));
  const at = useRef(0);
  const joined = s.cur.join('');
  useEffect(() => {
    if (text === joined) return;
    const apply = () => {
      at.current = performance.now();
      setS((p) => advance(p, text));
    };
    const wait = GAP - (performance.now() - at.current);
    if (wait <= 0) {
      apply();
      return;
    }
    const id = setTimeout(apply, wait + 16);
    return () => clearTimeout(id);
  }, [text, joined]);

  return (
    <>
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'stretch' }}>
        {s.cur.map((c, i) => {
          if (!/\d/.test(c)) {
            return (
              <span
                key={`s${i}${c}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  width: /\s/.test(c) ? '0.18em' : '0.26em',
                  height: '1.16em',
                  paddingBottom: '0.08em',
                  fontSize: '0.84em',
                  color: '#eef1f8',
                }}
              >
                {c}
              </span>
            );
          }
          const old = s.prev[i] ?? c;
          const anim = old !== c;
          const d = (s.delay[i] ?? 0) / 1000;
          return (
            <span
              key={`${i}-${s.gen[i] ?? 0}`}
              style={{
                position: 'relative',
                display: 'inline-block',
                width: '0.7em',
                height: '1.16em',
                margin: '0 0.03em',
                perspective: '2.4em',
                borderRadius: '0.075em',
                boxShadow: '0 0.12em 0.3em rgba(0,0,0,0.55), 0 0.02em 0 rgba(0,0,0,0.6)',
              }}
            >
              {half(c, true)}
              {half(anim ? old : c, false)}
              {anim && half(old, true, { animation: `fv-flap-top .26s cubic-bezier(.55,.05,.85,.4) ${d}s both`, zIndex: 2 })}
              {anim && half(c, false, { animation: `fv-flap-bot .34s cubic-bezier(.2,.9,.35,1.15) ${d + 0.26}s both`, zIndex: 2 })}
              <span style={{ position: 'absolute', left: 0, right: 0, top: 'calc(50% - 1px)', height: 2, background: 'rgba(2,3,8,0.9)', boxShadow: '0 1px 0 rgba(255,255,255,0.05)', zIndex: 3 }} />
              <span style={{ position: 'absolute', left: '-0.02em', top: 'calc(50% - 0.07em)', width: '0.05em', height: '0.14em', borderRadius: '0.02em', background: '#05060c', zIndex: 3 }} />
              <span style={{ position: 'absolute', right: '-0.02em', top: 'calc(50% - 0.07em)', width: '0.05em', height: '0.14em', borderRadius: '0.02em', background: '#05060c', zIndex: 3 }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: '0.075em', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.12)', pointerEvents: 'none', zIndex: 4 }} />
            </span>
          );
        })}
      </span>
    </>
  );
}

/** Dzieli sformatowaną kwotę na część liczbową (do zegara) i jednostkę (np. „530 000” + „zł”). */
export function splitAmount(text: string): [string, string] | null {
  const m = /^(.*\d)[\s\u00a0\u202f]*(\D*)$/.exec(text);
  return m && m[1] ? [m[1], m[2] ?? ''] : null;
}
