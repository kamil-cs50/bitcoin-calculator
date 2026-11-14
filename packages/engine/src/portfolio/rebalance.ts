import type { RebalancePolicy } from '../types';

/** Transakcja: + kupno, − sprzedaż, w walucie bazowej. */
export interface Trade { index: number; amount: number }

const BAND_EPS = 1e-12; // odporność na szum zmiennoprzecinkowy na granicy pasma
const TRADE_EPS = 1e-9; // względny próg „zerowej” transakcji

/** Waga efektywna celu: tylko aktywa płynne, ujemne/NaN/∞ traktowane jak 0 (decisions-log, zadanie 20). */
function weight(targets: Float64Array, liquid: Uint8Array, i: number): number {
  const w = targets[i]!;
  return liquid[i] !== 0 && w > 0 && Number.isFinite(w) ? w : 0;
}

// współdzielony wynik (bez alokacji w gorącej pętli; kod jednowątkowy i bez zagnieżdżonych wywołań)
const SUMS = { v: 0, w: 0 };

function liquidSums(values: Float64Array, targets: Float64Array, liquid: Uint8Array): { v: number; w: number } {
  let v = 0;
  let w = 0;
  for (let i = 0; i < values.length; i++) {
    if (liquid[i] === 0) continue;
    v += values[i]! > 0 ? values[i]! : 0;
    w += weight(targets, liquid, i);
  }
  SUMS.v = v;
  SUMS.w = w;
  return SUMS;
}

/**
 * Transakcje rebalansu do wag docelowych (tylko aktywa płynne). Wypełnia `out` (zera tam, gdzie brak
 * transakcji). Zwraca true, gdy są jakiekolwiek transakcje. Pusty portfel, suma celów = 0 lub
 * jedno aktywo 100% → false, bez dzielenia przez zero.
 */
export function rebalanceTrades(
  values: Float64Array,
  targets: Float64Array,
  liquid: Uint8Array,
  policy: RebalancePolicy,
  isJanuary: boolean,
  out: Float64Array,
): boolean {
  const n = values.length;
  out.fill(0, 0, n);
  if (policy.kind === 'none' || policy.kind === 'flows') return false;
  if (policy.kind === 'annual' && !isJanuary) return false;
  const { v, w } = liquidSums(values, targets, liquid);
  if (!(v > 0) || !(w > 0)) return false;

  if (policy.kind === 'band') {
    const band = policy.bandPp / 100;
    let breach = false;
    for (let i = 0; i < n && !breach; i++) {
      if (liquid[i] === 0) continue;
      const cur = (values[i]! > 0 ? values[i]! : 0) / v;
      if (Math.abs(cur - weight(targets, liquid, i) / w) > band + BAND_EPS) breach = true;
    }
    if (!breach) return false;
  }

  let any = false;
  const tol = TRADE_EPS * v;
  for (let i = 0; i < n; i++) {
    if (liquid[i] === 0) continue;
    const d = (v * weight(targets, liquid, i)) / w - (values[i]! > 0 ? values[i]! : 0);
    if (Math.abs(d) > tol) {
      out[i] = d;
      any = true;
    }
  }
  return any;
}

/**
 * Podział wpływu `amount` (> 0) między aktywa płynne. `flows`: do aktywów niedoważonych
 * (proporcjonalnie do luk względem celu po wpłacie); pozostałe polityki: proporcjonalnie do celów.
 * Gdy suma celów płynnych = 0 lub amount ≤ 0, `out` same zera (wołający zostawia kwotę w gotówce).
 */
export function allocateInflow(
  values: Float64Array,
  targets: Float64Array,
  liquid: Uint8Array,
  amount: number,
  policy: RebalancePolicy,
  out: Float64Array,
): void {
  const n = values.length;
  out.fill(0, 0, n);
  if (!(amount > 0)) return;
  const { v, w } = liquidSums(values, targets, liquid);
  if (!(w > 0)) return;

  if (policy.kind === 'flows') {
    const total = v + amount;
    let gapSum = 0;
    for (let i = 0; i < n; i++) {
      const g = (total * weight(targets, liquid, i)) / w - (values[i]! > 0 ? values[i]! : 0);
      if (liquid[i] !== 0 && g > 0) {
        out[i] = g;
        gapSum += g;
      }
    }
    if (gapSum > 0) {
      const k = amount / gapSum; // suma dodatnich luk ≥ amount, więc k ≤ 1
      for (let i = 0; i < n; i++) out[i] = out[i]! * k;
      return;
    }
    out.fill(0, 0, n);
  }
  for (let i = 0; i < n; i++) out[i] = (amount * weight(targets, liquid, i)) / w;
}

/**
 * Źródła wypłaty `amount` (> 0): najpierw gotówka (`cashIndex`, −1 gdy brak), potem aktywa płynne
 * przeważone względem celu (proporcjonalnie do nadwyżki). `out` ≤ 0 (sprzedaże). Zwraca niedobór
 * (część kwoty, której nie da się pokryć płynnymi aktywami); EDO i niepłynne wołający obsługuje osobno.
 */
export function allocateOutflow(
  values: Float64Array,
  targets: Float64Array,
  liquid: Uint8Array,
  cashIndex: number,
  amount: number,
  out: Float64Array,
): number {
  const n = values.length;
  out.fill(0, 0, n);
  if (!(amount > 0)) return 0;
  let rest = amount;
  if (cashIndex >= 0 && cashIndex < n && liquid[cashIndex] !== 0) {
    const take = Math.min(rest, values[cashIndex]! > 0 ? values[cashIndex]! : 0);
    if (take > 0) out[cashIndex] = -take;
    rest -= take;
  }
  if (!(rest > 0)) return 0;

  let v = 0;
  let w = 0;
  for (let i = 0; i < n; i++) {
    if (liquid[i] === 0 || i === cashIndex) continue;
    v += values[i]! > 0 ? values[i]! : 0;
    w += weight(targets, liquid, i);
  }
  if (!(v > 0)) return rest;
  if (rest >= v) {
    for (let i = 0; i < n; i++) {
      if (liquid[i] !== 0 && i !== cashIndex) out[i] = -(values[i]! > 0 ? values[i]! : 0);
    }
    return rest - v;
  }

  // Nadwyżka względem celu po wypłacie; suma nadwyżek ≥ rest (z dokładnością do zaokrągleń).
  let excessSum = 0;
  if (w > 0) {
    const after = v - rest;
    for (let i = 0; i < n; i++) {
      if (liquid[i] === 0 || i === cashIndex) continue;
      const e = (values[i]! > 0 ? values[i]! : 0) - (after * weight(targets, liquid, i)) / w;
      if (e > 0) {
        out[i] = e;
        excessSum += e;
      }
    }
  }
  if (excessSum > 0) {
    const k = rest / excessSum;
    for (let i = 0; i < n; i++) {
      if (liquid[i] !== 0 && i !== cashIndex) out[i] = -Math.min(out[i]! * k, values[i]!);
    }
  } else {
    // brak celów: proporcjonalnie do wartości
    for (let i = 0; i < n; i++) {
      if (liquid[i] !== 0 && i !== cashIndex) out[i] = -(rest * (values[i]! > 0 ? values[i]! : 0)) / v;
    }
  }
  return 0;
}

/** Koszt transakcji (≥ 0) w walucie bazowej: |kwota| · costBps / 10 000. */
export function transactionCost(amount: number, costBps: number): number {
  return (Math.abs(amount) * costBps) / 10_000;
}
