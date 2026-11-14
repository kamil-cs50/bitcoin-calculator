import { buildScaleTable } from '../math/scaleTable';
import { fxPhi } from '../models/fx';
import { gSum } from '../models/inflation';
import { MarketSimulator } from '../models/market';
import { regimeConstants, sigmaMonthlyFactor } from '../models/regime';
import type { RegimeParams, RiskyAssetParams, Scenario } from '../types';

/**
 * Miesięczna średnia arytmetyczna E[e^r] z reżimami (spec 4.3, R-6):
 * E[e^r] = e^μ · Σ_s π_s e^{ασδ_s} · (1/K) Σ_k exp(σ_m² κ_s² s_k² / 2),
 * ze stacjonarnym rozkładem reżimów i tą samą tabelą skali co symulator. `mu` = miesięczny dryf log-zwrotu,
 * `sigma` = roczna zmienność aktywa; przy p01 = 0 wynik sprowadza się do wzoru bez reżimów.
 * Średnią roczną (reżim skorelowany w czasie) liczymy z symulacji kontrolnej: `arithmeticMeanFromLogReturns`.
 */
export function arithmeticMeanMonthly(p: { mu: number; sigma: number; alpha: number; b: number; nu: number; regime: RegimeParams }): number {
  const c = regimeConstants(p.regime);
  const sm = p.sigma * sigmaMonthlyFactor(p.alpha, p.b, p.regime, c);
  const table = buildScaleTable(p.nu);
  const K = table.length;
  const kap = [1, 1 + p.b * (p.regime.kappa1 - 1)] as const;
  const pi = [c.pi0, c.pi1] as const;
  const delta = [c.delta0, c.delta1] as const;
  let total = 0;
  for (let s = 0; s < 2; s++) {
    const ps = pi[s]!;
    if (!(ps > 0)) continue;
    const half = (sm * kap[s]! * sm * kap[s]!) / 2;
    let acc = 0;
    for (let k = 0; k < K; k++) acc += Math.exp(half * table[k]! * table[k]!);
    total += ps * Math.exp(p.alpha * p.sigma * delta[s]!) * (acc / K);
  }
  return Math.exp(p.mu) * total;
}

/** Średnia arytmetyczna e^x z próby log-zwrotów (np. rocznych z symulacji kontrolnej). */
export function arithmeticMeanFromLogReturns(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.exp(x[i]!);
  return x.length > 0 ? s / x.length : NaN;
}

/** Korelacja próbkowa Pearsona (panel „Kontrola modelu”: korelacja roczna par z udziałem inflacji/kursu, R-1). */
export function sampleCorrelation(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

export interface ModelCheckRow {
  id: string;
  metric: 'meanLog' | 'vol' | 'corr' | 'inflationSd' | 'crisisShare';
  input: number;
  simulated: number;
  se: number;
  ok: boolean;
}

const BLOCKS = 20;

function meanOf(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return a.length > 0 ? s / a.length : NaN;
}

function sdOf(a: ArrayLike<number>): number {
  const m = meanOf(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - m) * (a[i]! - m);
  return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN;
}

/** Statystyka z bloków: wartość = średnia z bloków, SE = rozrzut między blokami / √liczby bloków. */
function fromBlocks(vals: number[]): { v: number; se: number } {
  return { v: meanOf(vals), se: sdOf(vals) / Math.sqrt(vals.length) };
}

/** Skumulowane momenty pary (online) w jednym bloku. */
class PairAcc {
  n = 0;
  sx = 0;
  sy = 0;
  sxx = 0;
  syy = 0;
  sxy = 0;
  add(x: number, y: number): void {
    this.n++;
    this.sx += x;
    this.sy += y;
    this.sxx += x * x;
    this.syy += y * y;
    this.sxy += x * y;
  }
  corr(): number {
    const { n } = this;
    const cxy = this.sxy - (this.sx * this.sy) / n;
    const cxx = this.sxx - (this.sx * this.sx) / n;
    const cyy = this.syy - (this.sy * this.sy) / n;
    return cxy / Math.sqrt(cxx * cyy);
  }
}

/**
 * „Kontrola modelu” (spec 4.x, T3, R-1, R-2): osobny przebieg samego rynku (bez przepływów i podatków,
 * bez niepewności parametrów i bez upadków krypto), porównujący statystyki symulacji z wejściem:
 * średnia rocznego log-zwrotu, zmienność, korelacje, odchylenie inflacji r/r, odchylenie 12-mies. zmiany
 * realnego kursu, udział miesięcy kryzysowych. Statystyki liczone w walucie notowania aktywa (bez kursu).
 * SE = rozrzut między 20 blokami ścieżek; `ok` ⇔ |simulated − input| ≤ 4·se.
 * Korelacje par z udziałem cpi/fx (R-1): wiersz „A~cpi” to korelacja SZOKÓW miesięcznych w miesiącach spokoju
 * (sprawdzana), a wiersz „A~cpi (roczna)” to korelacja roczna z symulacji, pokazywana informacyjnie (`ok` = true).
 * Okno roczne to ostatnie 12 miesięcy po wypaleniu (stacjonarność AR kursu i inflacji).
 */
export function modelCheck(s: Scenario, o: { seed: number; paths: number }): ModelCheckRow[] {
  const nb = Math.min(BLOCKS, Math.floor(o.paths / 2));
  if (nb < 2) throw new RangeError('modelCheck: za mało ścieżek (min. 4)');
  const m = s.market;
  const sc: Scenario = {
    ...s,
    market: { ...m, uncertaintyScale: 0 },
    assets: s.assets.map((a) => (a.kind === 'risky' && a.collapse ? { ...a, collapse: undefined } : a)),
  };
  const sim = new MarketSimulator(sc);
  const st = sim.newState();
  const ids = sim.riskyIds;
  const nr = ids.length;
  const nfx = m.fx.length;
  const nf = m.factorIds.length;
  const cpiFactor = m.factorIds.indexOf('cpi');
  const hasCpi = cpiFactor >= 0;
  const riskyById = new Map(s.assets.map((a) => [a.id, a]));
  const rho = (i: number, j: number): number => m.correlation[i * nf + j]!;
  const fxIdx = (cur: string): number => (cur === 'PLN' ? -1 : m.fx.findIndex((f) => f.currency === cur));
  const assetFx = ids.map((id) => fxIdx((riskyById.get(id) as RiskyAssetParams).currency));
  const baseFx = fxIdx(s.baseCurrency);
  const maxH = nfx > 0 ? Math.max(...m.fx.map((f) => f.halfLifeYears)) : 0;
  const burn = Math.min(600, Math.max(120, Math.round(60 * maxH)));
  const T = burn + 12;
  const w0 = T - 12; // początek okna rocznego
  const phiQ = m.fx.map((f) => fxPhi(f.halfLifeYears));
  const phiX = m.inflation.phi;
  const meanX = m.inflation.mean;

  // wektor szoków miesiąca: [zwroty własne aktywów..., innowacje q..., innowacja x]
  const nv = nr + nfx + (hasCpi ? 1 : 0);
  const vec = new Float64Array(nv);
  const factorOf = (v: number): number => (v < nr ? m.factorIds.indexOf(ids[v]!) : v < nr + nfx ? m.factorIds.indexOf(`fx:${m.fx[v - nr]!.currency}`) : cpiFactor);
  const label = (v: number): string => (v < nr ? ids[v]! : v < nr + nfx ? `fx:${m.fx[v - nr]!.currency}` : 'cpi');
  const pairs: [number, number][] = [];
  for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) if (j >= nr) pairs.push([i, j]);
  const acc = pairs.map(() => Array.from({ length: nb }, () => new PairAcc()));

  const annual = Array.from({ length: nr }, () => new Float64Array(o.paths)); // roczny log-zwrot własny w oknie
  const dq = Array.from({ length: nfx }, () => new Float64Array(o.paths)); // 12-mies. zmiana q
  const dcpi = new Float64Array(o.paths); // ln CPI_T − ln CPI_{T−12}
  const lnYy = new Float64Array(o.paths);
  const crisis = new Float64Array(o.paths);
  const prevFx = new Float64Array(nfx);
  const qPrev = new Float64Array(nfx);
  const qWin = new Float64Array(nfx);

  for (let p = 0; p < o.paths; p++) {
    const b = Math.floor((p * nb) / o.paths);
    sim.initPath(o.seed, p);
    prevFx.fill(0);
    qPrev.fill(0);
    let xPrev = m.inflation.x0;
    let cpiWin = 0;
    let prevRegime = -1;
    let crisisMonths = 0;
    for (let t = 0; t < T; t++) {
      sim.step(t, st);
      if (st.regime === 1) crisisMonths++;
      for (let i = 0; i < nr; i++) {
        let r = st.assetLogRet[i]!;
        if (assetFx[i]! >= 0) r -= st.fxLog[assetFx[i]!]! - prevFx[assetFx[i]!]!;
        if (baseFx >= 0) r += st.fxLog[baseFx]! - prevFx[baseFx]!;
        vec[i] = r;
        if (t >= w0) annual[i]![p]! += r;
      }
      for (let k = 0; k < nfx; k++) {
        const qNow = st.fxLog[k]! - st.cpiLog + (m.fx[k]!.foreignInflation * (t + 1)) / 12;
        vec[nr + k] = qNow - phiQ[k]! * qPrev[k]!;
        qPrev[k] = qNow;
        prevFx[k] = st.fxLog[k]!;
        if (t === w0 - 1) qWin[k] = qNow;
        if (t === T - 1) dq[k]![p] = qNow - qWin[k]!;
      }
      if (hasCpi) {
        vec[nv - 1] = st.x - meanX - phiX * (xPrev - meanX);
        xPrev = st.x;
        if (t === w0 - 1) cpiWin = st.cpiLog;
        if (t === T - 1) dcpi[p] = st.cpiLog - cpiWin;
      }
      if (t === T - 1) lnYy[p] = Math.log1p(st.yy);
      if (prevRegime === 0) pairs.forEach(([i, j], u) => acc[u]![b]!.add(vec[i]!, vec[j]!));
      prevRegime = st.regime;
    }
    crisis[p] = crisisMonths / T;
  }

  const blockIdx = (b: number): [number, number] => [Math.floor((b * o.paths) / nb), Math.floor(((b + 1) * o.paths) / nb)];
  const blockStat = (f: (lo: number, hi: number) => number): { v: number; se: number } => {
    const vals: number[] = [];
    for (let b = 0; b < nb; b++) vals.push(f(...blockIdx(b)));
    return fromBlocks(vals);
  };
  const sdBlock = (x: Float64Array) => blockStat((lo, hi) => sdOf(x.subarray(lo, hi)));
  const corrBlock = (x: Float64Array, y: Float64Array) =>
    blockStat((lo, hi) => sampleCorrelation(x.subarray(lo, hi), y.subarray(lo, hi)));
  const row = (id: string, metric: ModelCheckRow['metric'], input: number, r: { v: number; se: number }, info = false): ModelCheckRow => ({
    id,
    metric,
    input,
    simulated: r.v,
    se: r.se,
    ok: info || Math.abs(r.v - input) <= 4 * r.se,
  });

  const rows: ModelCheckRow[] = [];
  for (let i = 0; i < nr; i++) {
    let lg = 0;
    let vr = 0;
    for (let t = w0; t < T; t++) {
      lg += Math.log1p(sim.gAt(i, t)) / 12;
      const sg = sim.sigmaAt(i, t);
      vr += (sg * sg) / 12;
    }
    rows.push(row(ids[i]!, 'meanLog', lg, blockStat((lo, hi) => meanOf(annual[i]!.subarray(lo, hi)))));
    rows.push(row(ids[i]!, 'vol', Math.sqrt(vr), sdBlock(annual[i]!)));
  }
  for (let i = 0; i < nr; i++)
    for (let j = i + 1; j < nr; j++)
      rows.push(row(`${ids[i]}~${ids[j]}`, 'corr', rho(factorOf(i), factorOf(j)), corrBlock(annual[i]!, annual[j]!)));
  pairs.forEach(([i, j], u) => {
    const cs = acc[u]!.map((a) => a.corr());
    rows.push(row(`${label(i)}~${label(j)}`, 'corr', rho(factorOf(i), factorOf(j)), fromBlocks(cs)));
  });
  // roczne korelacje par z fx/cpi: informacyjnie (R-1)
  const annualSeries = (v: number): Float64Array => (v < nr ? annual[v]! : v < nr + nfx ? dq[v - nr]! : dcpi);
  for (const [i, j] of pairs) {
    rows.push(row(`${label(i)}~${label(j)} (roczna)`, 'corr', rho(factorOf(i), factorOf(j)), corrBlock(annualSeries(i), annualSeries(j)), true));
  }
  for (let k = 0; k < nfx; k++) rows.push(row(`fx:${m.fx[k]!.currency}`, 'vol', m.fx[k]!.sigma, sdBlock(dq[k]!)));
  if (hasCpi && m.inflation.sigmaEta > 0) {
    const vx = (m.inflation.sigmaEta * m.inflation.sigmaEta) / (1 - phiX * phiX);
    rows.push(row('cpi', 'inflationSd', Math.sqrt((vx * gSum(phiX)) / 144), sdBlock(lnYy)));
  }
  const pi1 = regimeConstants(sc.market.mode === 'gbm' ? { ...m.regime, p01: 0 } : m.regime).pi1;
  rows.push(row('regime', 'crisisShare', pi1, blockStat((lo, hi) => meanOf(crisis.subarray(lo, hi)))));
  return rows;
}
