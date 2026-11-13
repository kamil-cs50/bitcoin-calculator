/** ln Γ(x) dla x > 0: przybliżenie Lanczosa (g = 7, n = 9) z odbiciem dla x < 0,5. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lnGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const EPS = 1e-16;
const TINY = 1e-300;
const MAX_ITER = 1000;

/** Regularyzowana dolna niepełna gamma P(a, x): szereg dla x < a + 1, ułamek łańcuchowy Lentza inaczej. */
export function gammaP(a: number, x: number): number {
  if (!(a > 0)) throw new RangeError('gammaP: a musi być > 0');
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  const lnPrefix = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let sum = del;
    for (let n = 0; n < MAX_ITER; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(lnPrefix);
  }
  // Q(a, x) ułamkiem łańcuchowym (Lentz)
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return 1 - Math.exp(lnPrefix) * h;
}

/** Kwantyl rozkładu χ² o nu stopniach swobody: bisekcja na gammaP(nu/2, x/2). */
export function chi2Quantile(p: number, nu: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('chi2Quantile: p musi być w (0, 1)');
  if (!(nu > 0)) throw new RangeError('chi2Quantile: nu musi być > 0');
  let lo = 0;
  let hi = Math.max(nu, 1);
  while (gammaP(nu / 2, hi / 2) < p) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    if (gammaP(nu / 2, mid / 2) < p) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
