import type { InflationParams } from '../types';

/** G(φ) = 12 + 2·Σ_{k=1}^{11} (12−k)·φ^k (spec 4.6, Z-12): Var(ln(1+yy)) = V_x·G/144. */
export function gSum(phi: number): number {
  let g = 12;
  let pk = 1;
  for (let k = 1; k <= 11; k++) {
    pk *= phi;
    g += 2 * (12 - k) * pk;
  }
  return g;
}

/** Autokorelacja inflacji r/r przy opóźnieniu 12 miesięcy: φ(1−φ^12)² / ((1−φ)²·G(φ)). */
export function rho12(phi: number): number {
  const a = 1 - Math.pow(phi, 12);
  const b = 1 - phi;
  return (phi * a * a) / (b * b * gSum(phi));
}

const PHI_MAX = 0.9999;

/** Z odchylenia i autokorelacji (lag 12) inflacji r/r wyznacza φ (bisekcja) i σ_η. */
export function calibrateInflation(sdYy: number, rho12Target: number): { phi: number; sigmaEta: number } {
  if (!(sdYy > 0) || !Number.isFinite(sdYy)) throw new RangeError('sdYy musi być dodatnie');
  if (!(rho12Target > 0 && rho12Target < rho12(PHI_MAX))) {
    throw new RangeError(`rho12 poza zakresem osiągalnym (0, ${rho12(PHI_MAX).toFixed(4)})`);
  }
  let lo = 0;
  let hi = PHI_MAX;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (rho12(mid) < rho12Target) lo = mid;
    else hi = mid;
  }
  const phi = (lo + hi) / 2;
  const vx = (144 * sdYy * sdYy) / gSum(phi);
  return { phi, sigmaEta: Math.sqrt(vx * (1 - phi * phi)) };
}

const RING = 25;

/**
 * Proces inflacji (spec 4.6): x_{t+1} = m + φ(x_t − m) + σ_η·ε, ln CPI_{t+1} = ln CPI_t + x_{t+1}/12.
 * Bufor pierścieniowy 25 poziomów ln CPI (względem poziomu startowego) pozwala liczyć r/r z opóźnieniem do 12 mies.
 * Poziomy sprzed `cpiHistory` (13 punktów) są ekstrapolowane stałym wzrostem z historii.
 */
export class InflationProcess {
  x: number;
  cpiLog = 0;
  private mean: number;
  private readonly ring = new Float64Array(RING);
  private t = 0; // liczba wykonanych kroków; ring[t % RING] = poziom bieżący

  constructor(private readonly p: InflationParams) {
    this.x = p.x0;
    this.mean = p.mean;
    this.init(p.mean);
  }

  init(meanForPath: number): void {
    const h = this.p.cpiHistory;
    const base = Math.log(h[h.length - 1]!);
    const first = Math.log(h[0]!) - base;
    const growth = -first / (h.length - 1); // średni miesięczny przyrost ln CPI w historii
    this.mean = meanForPath;
    this.x = this.p.x0;
    this.cpiLog = 0;
    this.t = 0;
    // Poziom w czasie τ ∈ [−24, 0] leży w ring[(τ + 24) % RING]; t = 0 → indeks 24.
    for (let tau = -(RING - 1); tau <= 0; tau++) {
      const k = tau + (h.length - 1); // indeks w historii
      const lvl = k >= 0 ? Math.log(h[k]!) - base : first + k * growth;
      this.ring[(tau + RING - 1) % RING] = lvl;
    }
    this.t = RING - 1; // przesunięcie zerowe: tau = t − (RING − 1)
  }

  step(shock: number): void {
    this.x = this.mean + this.p.phi * (this.x - this.mean) + this.p.sigmaEta * shock;
    this.cpiLog += this.x / 12;
    this.t++;
    this.ring[this.t % RING] = this.cpiLog;
  }

  /** CPI_{t−lag}/CPI_{t−lag−12} − 1. */
  yy(lagMonths = 0): number {
    if (!Number.isInteger(lagMonths) || lagMonths < 0 || lagMonths > 12) {
      throw new RangeError('lagMonths musi być całkowite w [0, 12]');
    }
    const a = this.ring[(this.t - lagMonths) % RING]!;
    const b = this.ring[(this.t - lagMonths - 12) % RING]!;
    return Math.exp(a - b) - 1;
  }
}
