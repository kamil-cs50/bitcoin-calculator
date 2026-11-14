import { useEffect, useRef } from 'react';

/*
 * Tło „żyjące” z projektu Claude Design (v3): shader WebGL (fbm) rysowany w 60% rozdzielczości,
 * z poświatą podążającą za wskaźnikiem (w bezruchu dryfuje po torze Lissajous), plus nakładka szumu.
 * Wyłącznie oprawa: kanwa nie niesie żadnych danych. Wartości z Tweaks: motion 1, glow 1.
 */
const MOTION = 1;
const GLOW = 1;

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float k;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
void main(){vec2 uv=gl_FragCoord.xy/r;float asp=r.x/r.y;vec2 p=vec2(uv.x*asp,uv.y);
float w=fbm(vec2(p.x*.6+t*.02,t*.05))*.8;
float c1=fbm(vec2((p.x+w)*1.8,t*.06));
float c2=n(vec2((p.x+w)*8.,t*.1));
float col=smoothstep(.38,.85,c1)*.8+c2*c2*.25;
vec2 mp=vec2(m.x*asp,m.y);vec2 d=(p-mp)*vec2(1.,1.5);
float glow=exp(-dot(d,d)*2.4);
float reach=.12+col*.6;
float v=1.-smoothstep(0.,reach,uv.y);v=pow(v,1.5);
float I=(v*(.16+col)*.8+glow*.6*(.55+.45*c1))*k;
I*=.9+.1*n(vec2((p.x+w)*40.,uv.y*1.4+t*.08));
vec3 c0=vec3(.014,.014,.04),cA=vec3(.016,.03,.19),cB=vec3(.05,.16,.82),cC=vec3(.35,.52,1.);
vec3 o=mix(c0,cA,smoothstep(0.,.4,I));o=mix(o,cB,smoothstep(.36,1.,I));o=mix(o,cC,smoothstep(1.05,1.7,I)*.4);
o*=1.-.38*length((uv-vec2(.5,.45))*vec2(1.,1.15));
o+=(h(gl_FragCoord.xy)-.5)/255.;
gl_FragColor=vec4(o,1.);}`;

/** Uruchamia shader na kanwie; zwraca funkcję sprzątającą. Bez WebGL zostaje gradient z CSS. */
function start(c: HTMLCanvasElement): () => void {
  const gl = c.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return () => undefined;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return () => undefined;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {
    r: gl.getUniformLocation(pr, 'r'),
    t: gl.getUniformLocation(pr, 't'),
    m: gl.getUniformLocation(pr, 'm'),
    k: gl.getUniformLocation(pr, 'k'),
  };
  const resize = () => {
    const s = Math.min(1, window.devicePixelRatio) * 0.6;
    c.width = Math.max(2, (window.innerWidth * s) | 0);
    c.height = Math.max(2, (window.innerHeight * s) | 0);
    gl.viewport(0, 0, c.width, c.height);
  };
  resize();
  window.addEventListener('resize', resize);
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let lastMove = -1e9;
  const onMove = (e: PointerEvent) => {
    mouse.tx = e.clientX / window.innerWidth;
    mouse.ty = 1 - e.clientY / window.innerHeight;
    lastMove = performance.now();
  };
  window.addEventListener('pointermove', onMove);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tm = 0;
  let last = performance.now();
  let raf = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tm += dt * MOTION * (reduce ? 0.1 : 1);
    if (now - lastMove > 2500) {
      mouse.tx = 0.5 + 0.34 * Math.sin(tm * 0.19);
      mouse.ty = 0.32 + 0.2 * Math.sin(tm * 0.27 + 1.3);
    }
    mouse.x += (mouse.tx - mouse.x) * 0.018;
    mouse.y += (mouse.ty - mouse.y) * 0.018;
    gl.uniform2f(U.r, c.width, c.height);
    gl.uniform1f(U.t, tm + 40);
    gl.uniform2f(U.m, mouse.x, mouse.y);
    gl.uniform1f(U.k, GLOW);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
  };
}

export function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // refrakcja szkła (filtr SVG w backdrop-filter) działa tylko w Chromium; reszta dostaje samo nasycenie
    const chromium = 'chrome' in window && !/Firefox/.test(navigator.userAgent);
    if (chromium) document.documentElement.dataset.engine = 'chromium';
    const c = ref.current;
    if (!c || /jsdom/i.test(navigator.userAgent)) return;
    try {
      return start(c);
    } catch {
      return undefined;
    }
  }, []);
  return (
    <>
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="pointer-events-none absolute size-0">
        <filter id="lgx" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="7" result="warp" />
          <feGaussianBlur in="warp" stdDeviation="4" result="warpB" />
          <feDisplacementMap in="SourceGraphic" in2="warpB" scale="10" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div aria-hidden="true" className="ambient">
        <canvas ref={ref} />
        <div className="noise" />
      </div>
    </>
  );
}
