import type { RegimeParams } from '@sim/engine';

/** ln(L_t / L_{t-1}) dla kolejnych poziomów szeregu. */
export function logReturns(levels: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < levels.length; i++) out.push(Math.log(levels[i]! / levels[i - 1]!));
  return out;
}

function mean(x: number[]): number {
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

/** Odchylenie próbkowe (n − 1) miesięcznych log-zwrotów razy √12. */
export function annualizedVol(monthlyLogRet: number[]): number {
  if (monthlyLogRet.length < 2) return 0;
  const m = mean(monthlyLogRet);
  let ss = 0;
  for (const v of monthlyLogRet) ss += (v - m) * (v - m);
  return Math.sqrt((ss / (monthlyLogRet.length - 1)) * 12);
}

/** Autokorelacja próbkowa przy opóźnieniu `lag` (mianownik: suma kwadratów całej próbki). */
export function autocorr(x: number[], lag: number): number {
  const m = mean(x);
  let num = 0;
  let den = 0;
  for (let i = 0; i < x.length; i++) {
    den += (x[i]! - m) * (x[i]! - m);
    if (i + lag < x.length) num += (x[i]! - m) * (x[i + lag]! - m);
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Ściąganie Ledoita–Wolfa (2004) macierzy korelacji w stronę jedności. `returns[t][i]`: obserwacja t,
 * aktywo i. Dane są standaryzowane, więc wynik to poprawna (dodatnio określona) macierz korelacji
 * (1 − δ)·R + δ·I z intensywnością δ ∈ [0, 1] z oszacowania Ledoita–Wolfa.
 */
export function ledoitWolfShrink(returns: number[][]): number[][] {
  const n = returns.length;
  const p = returns[0]?.length ?? 0;
  if (n < 2 || p === 0) throw new RangeError('ledoitWolfShrink wymaga co najmniej 2 obserwacji i 1 aktywa');
  const x = returns.map((r) => r.slice());
  for (let i = 0; i < p; i++) {
    let m = 0;
    for (let t = 0; t < n; t++) m += x[t]![i]!;
    m /= n;
    let v = 0;
    for (let t = 0; t < n; t++) v += (x[t]![i]! - m) ** 2;
    const sd = Math.sqrt(v / n);
    for (let t = 0; t < n; t++) x[t]![i] = sd === 0 ? 0 : (x[t]![i]! - m) / sd;
  }
  const s: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let t = 0; t < n; t++)
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s[i]![j]! += (x[t]![i]! * x[t]![j]!) / n;
  // μ = tr(S)/p = 1 (dla stałych kolumn 0, ale wtedy diagonala = 0; traktujemy jak 1)
  let d2 = 0;
  for (let i = 0; i < p; i++)
    for (let j = 0; j < p; j++) d2 += (s[i]![j]! - (i === j ? 1 : 0)) ** 2;
  d2 /= p;
  let b2 = 0;
  for (let t = 0; t < n; t++)
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++) b2 += (x[t]![i]! * x[t]![j]! - s[i]![j]!) ** 2;
  b2 /= n * n * p;
  const delta = d2 === 0 ? 1 : Math.min(b2, d2) / d2;
  return s.map((row, i) => row.map((v, j) => (i === j ? 1 : (1 - delta) * v)));
}

const NU_GRID = [3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100];

function lgamma(z: number): number {
  // przybliżenie Lanczosa
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  const zz = z - 1;
  let a = c[0]!;
  const t = zz + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (zz + i);
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(a);
}

function logTPdf(z: number, nu: number, logScale: number, lconst: number): number {
  return lconst - logScale - ((nu + 1) / 2) * Math.log(1 + (z * z) / nu);
}

interface Em {
  mu: [number, number];
  scale: [number, number];
  p01: number;
  p10: number;
  logLik: number;
}

function emFixedNu(x: number[], nu: number, init: Em): Em {
  const n = x.length;
  const lconst = lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI);
  let { mu, scale, p01, p10 } = init;
  mu = [...mu];
  scale = [...scale];
  let logLik = -Infinity;
  const alpha = new Float64Array(2 * n);
  const beta = new Float64Array(2 * n);
  const dens = new Float64Array(2 * n);
  const c = new Float64Array(n);
  for (let iter = 0; iter < 300; iter++) {
    // filtr Hamiltona (skalowany)
    const pi1 = p01 / (p01 + p10);
    const prior = [1 - pi1, pi1];
    const trans = [
      [1 - p01, p01],
      [p10, 1 - p10],
    ];
    for (let t = 0; t < n; t++)
      for (let s = 0; s < 2; s++)
        dens[2 * t + s] = Math.exp(logTPdf((x[t]! - mu[s]!) / scale[s]!, nu, Math.log(scale[s]!), lconst));
    let ll = 0;
    for (let t = 0; t < n; t++) {
      let sum = 0;
      for (let s = 0; s < 2; s++) {
        const pred = t === 0 ? prior[s]! : alpha[2 * (t - 1)]! * trans[0]![s]! + alpha[2 * (t - 1) + 1]! * trans[1]![s]!;
        const a = pred * Math.max(dens[2 * t + s]!, 1e-300);
        alpha[2 * t + s] = a;
        sum += a;
      }
      c[t] = sum;
      alpha[2 * t] = alpha[2 * t]! / sum;
      alpha[2 * t + 1] = alpha[2 * t + 1]! / sum;
      ll += Math.log(sum);
    }
    beta[2 * (n - 1)] = 1;
    beta[2 * (n - 1) + 1] = 1;
    for (let t = n - 2; t >= 0; t--)
      for (let i = 0; i < 2; i++) {
        let v = 0;
        for (let j = 0; j < 2; j++) v += trans[i]![j]! * Math.max(dens[2 * (t + 1) + j]!, 1e-300) * beta[2 * (t + 1) + j]!;
        beta[2 * t + i] = v / c[t + 1]!;
      }
    // M-krok
    const sw = [0, 0];
    const swu = [0, 0];
    const swux = [0, 0];
    const xi = [
      [0, 0],
      [0, 0],
    ];
    const gam0 = [0, 0];
    const gam: number[][] = [new Array<number>(n), new Array<number>(n)] as number[][];
    for (let t = 0; t < n; t++) {
      for (let s = 0; s < 2; s++) {
        const g = alpha[2 * t + s]! * beta[2 * t + s]!;
        gam[s]![t] = g;
        const z = (x[t]! - mu[s]!) / scale[s]!;
        const u = (nu + 1) / (nu + z * z);
        sw[s]! += g;
        swu[s]! += g * u;
        swux[s]! += g * u * x[t]!;
        if (t < n - 1) gam0[s]! += g;
      }
      if (t < n - 1)
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++)
            xi[i]![j]! +=
              (alpha[2 * t + i]! * trans[i]![j]! * Math.max(dens[2 * (t + 1) + j]!, 1e-300) * beta[2 * (t + 1) + j]!) / c[t + 1]!;
    }
    const newMu: [number, number] = [swux[0]! / swu[0]!, swux[1]! / swu[1]!];
    const newScale: [number, number] = [0, 0];
    for (let s = 0; s < 2; s++) {
      let v = 0;
      for (let t = 0; t < n; t++) {
        const z = (x[t]! - mu[s]!) / scale[s]!;
        const u = (nu + 1) / (nu + z * z);
        v += gam[s]![t]! * u * (x[t]! - newMu[s]!) ** 2;
      }
      newScale[s] = Math.max(Math.sqrt(v / sw[s]!), 1e-8);
    }
    mu = newMu;
    scale = newScale;
    p01 = Math.min(Math.max(xi[0]![1]! / gam0[0]!, 1e-4), 0.999);
    p10 = Math.min(Math.max(xi[1]![0]! / gam0[1]!, 1e-4), 0.999);
    if (Math.abs(ll - logLik) < 1e-8) {
      logLik = ll;
      break;
    }
    logLik = ll;
  }
  return { mu, scale, p01, p10, logLik };
}

/**
 * Dwureżimowy model zwrotów (spec 4.4) dopasowany EM z filtrem Hamiltona i rozkładem t-Studenta
 * (nu wybierane z siatki po logLik). Reżim 0 = spokojny (κ₀ = 1), reżim 1 = kryzysowy (σ₁ = κ₁σ₀).
 * `delta` (Δ): różnica średnich μ₀ − μ₁ w jednostkach rocznej zmienności całej próbki
 * (przesunięcie średniej reżimu to ασδ_s, α = 1), zgodnie z konwencją δ₁ − δ₀ = −Δ.
 */
export function fitTwoRegime(monthly: number[]): RegimeParams & { nu: number; logLik: number } {
  if (monthly.length < 50) throw new RangeError('fitTwoRegime wymaga co najmniej 50 obserwacji');
  const m = mean(monthly);
  const sd = Math.sqrt(monthly.reduce((a, v) => a + (v - m) ** 2, 0) / monthly.length);
  let init: Em = { mu: [m, m], scale: [0.7 * sd, 2 * sd], p01: 0.05, p10: 0.2, logLik: -Infinity };
  let best: (Em & { nu: number }) | undefined;
  for (const nu of NU_GRID) {
    const fit = emFixedNu(monthly, nu, init);
    if (!best || fit.logLik > best.logLik) best = { ...fit, nu };
    init = fit;
  }
  let { mu, scale, p01, p10 } = best!;
  if (scale[1] < scale[0]) {
    // etykiety: reżim 1 to ten o większej zmienności
    mu = [mu[1], mu[0]];
    scale = [scale[1], scale[0]];
    [p01, p10] = [p10, p01];
  }
  // scale t-Studenta → odchylenie standardowe (ν > 2); κ₁ to iloraz odchyleń, więc czynnik się skraca
  const sigmaA = annualizedVol(monthly);
  return {
    p01,
    p10,
    kappa1: scale[1] / scale[0],
    delta: sigmaA > 0 ? (mu[0] - mu[1]) / sigmaA : 0,
    nu: best!.nu,
    logLik: best!.logLik,
  };
}
