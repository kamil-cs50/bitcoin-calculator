/** Rata renty (jak PMT w arkuszach, ze znakiem dodatnim): pv → n rat; due = płatna z góry (typ=1). */
export function pmt(r: number, n: number, pv: number, due: boolean): number {
  if (r === 0) return pv / n;
  const ordinary = (pv * r) / (1 - Math.pow(1 + r, -n));
  return due ? ordinary / (1 + r) : ordinary;
}
