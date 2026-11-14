import { wilson } from './intervals';

// Śmiertelność (spec 4.12): krzywa dożycia S(t) z tablic q_x oraz prawdopodobieństwo wyczerpania
// środków za życia P = (1/N) Σ_ścieżki S(t_ruiny). Śmiertelność jest całkowana analitycznie (bez losowania).

/** Intensywność zgonów (na rok) odpowiadająca q_x przy stałej intensywności w roku; q = 1 → +∞. */
function hazard(q: number): number {
  return q >= 1 ? Infinity : -Math.log1p(-q);
}

/**
 * Krzywa dożycia S(0..months) osoby w wieku `age` lat (całkowitym): S(0) = 1, `months + 1` elementów.
 * W obrębie roku wieku zakłada stałą intensywność zgonów, więc S po pełnym roku to dokładnie 1 − q_x,
 * a w środku roku interpolacja jest geometryczna. Powyżej końca tablicy używa ostatniego q_x.
 *
 * `extraYears` modeluje kohortowy wzrost długości życia (tablice okresowe ją zaniżają, spec 4.12, założenie
 * „+2 lata”): ryzyko w wieku a jest takie jak dla osoby o `extraYears` lat młodszej (wiek efektywny
 * `a − extraYears`, nie mniejszy niż 0).
 */
export function survivalCurve(
  qx: number[],
  age: number,
  months: number,
  extraYears = 0,
): Float64Array {
  if (qx.length === 0) throw new RangeError('survivalCurve: pusta tablica q_x');
  if (!Number.isFinite(age) || age < 0) throw new RangeError('survivalCurve: wiek musi być >= 0');
  if (!Number.isInteger(months) || months < 0)
    throw new RangeError('survivalCurve: months musi być nieujemną liczbą całkowitą');
  if (!Number.isFinite(extraYears)) throw new RangeError('survivalCurve: extraYears musi być skończone');
  const last = qx.length - 1;
  const out = new Float64Array(months + 1);
  out[0] = 1;
  let logS = 0; // ln S, nierosnące; −∞ po q = 1
  for (let m = 0; m < months; m++) {
    const eff = Math.max(0, age + m / 12 - extraYears);
    const q = qx[Math.min(last, Math.floor(eff + 1e-9))]!;
    logS -= hazard(q) / 12;
    out[m + 1] = Math.exp(logS);
  }
  return out;
}

/**
 * Dalsze przeciętne trwanie życia (w latach) w wieku `age` z q_x: ∫ S(t) dt przy stałej intensywności
 * w roku; ogon powyżej tablicy liczony z ostatniego q_x. Służy do sprawdzenia tablic z publikacją.
 */
export function remainingLifeExpectancy(qx: number[], age: number): number {
  if (qx.length === 0 || age < 0 || age > qx.length - 1)
    throw new RangeError('remainingLifeExpectancy: wiek poza tablicą');
  let surv = 1;
  let e = 0;
  for (let a = age; a < qx.length; a++) {
    const q = qx[a]!;
    const mu = hazard(q);
    // ∫_0^1 e^{−μu} du = q/μ (dla q → 0 granica 1); dla q = 1 całka = 1/∞ · 1 → 0.
    e += surv * (q >= 1 ? 0 : q / mu);
    surv *= 1 - q;
  }
  const tail = hazard(qx[qx.length - 1]!);
  if (surv > 0 && Number.isFinite(tail)) e += surv / tail;
  return e;
}

/**
 * P(ruina za życia) = (1/N) Σ_i S(t_i) po ścieżkach z ruiną (`ruinMonth[i] >= 0`); ścieżki bez ruiny
 * (−1) dają 0. Miesiąc poza krzywą jest obcinany do jej ostatniej wartości. Przedział: Wilsona dla
 * „efektywnej liczby sukcesów” p·N (zachowawczy, bo wariancja zmiennej z [0,1] ≤ p(1−p)); uwzględnia tylko
 * błąd losowania symulacji rynku, nie niepewność tablic.
 */
export function probRuinWhileAlive(
  ruinMonth: Int32Array,
  survival: Float64Array,
): { p: number; ci: [number, number] } {
  const n = ruinMonth.length;
  if (n === 0 || survival.length === 0) return { p: 0, ci: [0, 1] };
  const lastIdx = survival.length - 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = ruinMonth[i]!;
    if (t >= 0) sum += survival[Math.min(t, lastIdx)]!;
  }
  const p = sum / n;
  return { p, ci: wilson(sum, n) };
}
