import { MarketSimulator } from '../models/market';
import type { Scenario } from '../types';

/**
 * Wkład aktywów w ryzyko (spec 4.13): `RC_i = w_i (Σw)_i / (wᵀΣw)`; suma wkładów = 1.
 * `cov` to macierz n×n wierszami. Przy zerowej wariancji portfela zwraca same zera.
 */
export function riskContributions(weights: ArrayLike<number>, cov: ArrayLike<number>): number[] {
  const n = weights.length;
  const sw = new Array<number>(n).fill(0);
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) sw[i]! += cov[i * n + j]! * weights[j]!;
    total += weights[i]! * sw[i]!;
  }
  if (!(total > 0)) return new Array<number>(n).fill(0);
  return sw.map((v, i) => (weights[i]! * v) / total);
}

/**
 * Kowariancja rocznych log-zwrotów aktywów ryzykownych w walucie bazowej, z osobnego przebiegu samego rynku
 * (bez upadków krypto i bez niepewności parametrów, jak „kontrola modelu”). Okno roczne to ostatnie 12 miesięcy
 * po wypaleniu (stacjonarność kursów walut). `cov` wierszami, kolejność jak `ids`.
 */
export function annualLogCovariance(s: Scenario, o: { seed: number; paths: number }): { ids: string[]; cov: number[] } {
  const m = s.market;
  const sc: Scenario = {
    ...s,
    market: { ...m, uncertaintyScale: 0 },
    assets: s.assets.map((a) => (a.kind === 'risky' && a.collapse ? { ...a, collapse: undefined } : a)),
  };
  const sim = new MarketSimulator(sc);
  const st = sim.newState();
  const ids = [...sim.riskyIds];
  const n = ids.length;
  const maxH = m.fx.length > 0 ? Math.max(...m.fx.map((f) => f.halfLifeYears)) : 0;
  const burn = Math.min(600, Math.max(120, Math.round(60 * maxH)));
  const w0 = burn;
  const T = burn + 12;
  const sum = new Float64Array(n);
  const sq = new Float64Array(n * n);
  const x = new Float64Array(n);
  for (let p = 0; p < o.paths; p++) {
    sim.initPath(o.seed, p);
    x.fill(0);
    for (let t = 0; t < T; t++) {
      sim.step(t, st);
      if (t >= w0) for (let i = 0; i < n; i++) x[i]! += st.assetLogRet[i]!;
    }
    for (let i = 0; i < n; i++) {
      sum[i]! += x[i]!;
      for (let j = 0; j < n; j++) sq[i * n + j]! += x[i]! * x[j]!;
    }
  }
  const N = o.paths;
  const cov = new Array<number>(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) cov[i * n + j] = (sq[i * n + j]! - (sum[i]! * sum[j]!) / N) / (N - 1);
  return { ids, cov };
}

export interface AssetRiskShare {
  assetId: string;
  /** Udział wartości aktywa w całym portfelu (suma pozycji tego aktywa / suma wszystkich pozycji). */
  valueShare: number;
  /** Udział aktywa w ryzyku portfela (suma po aktywach ryzykownych = 1). */
  riskShare: number;
}

/**
 * Udziały wartości i ryzyka aktywów ryzykownych obecnych w portfelu (wartość > 0). Wagi liczone względem całego
 * portfela (gotówka, lokaty i obligacje mają zerową zmienność, więc nie zmieniają udziałów ryzyka).
 */
export function assetRiskShares(s: Scenario, o: { seed: number; paths: number }): AssetRiskShare[] {
  const total = s.positions.reduce((a, p) => a + p.value, 0);
  if (!(total > 0)) return [];
  const { ids, cov } = annualLogCovariance(s, o);
  const w = ids.map((id) => s.positions.filter((p) => p.assetId === id).reduce((a, p) => a + p.value, 0) / total);
  const rc = riskContributions(w, cov);
  return ids.flatMap((id, i) => (w[i]! > 0 ? [{ assetId: id, valueShare: w[i]!, riskShare: rc[i]! }] : []));
}
