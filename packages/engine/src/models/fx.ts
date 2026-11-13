import type { FxParams, RegimeParams } from '../types';
import { omega } from './regime';
import type { RegimeConstants } from './regime';

/** φ_q = 2^(−1/(12H)), H = półokres realnego kursu w latach (spec 4.7, Z-14). */
export function fxPhi(halfLifeYears: number): number {
  return Math.pow(2, -1 / (12 * halfLifeYears));
}

/** Zmienność efektywna aktywa w walucie bazowej: √(σ_a² + σ_fx² + 2ρσ_aσ_fx). */
export function effectiveVol(sigmaAsset: number, sigmaFx: number, rho: number): number {
  return Math.sqrt(sigmaAsset * sigmaAsset + sigmaFx * sigmaFx + 2 * rho * sigmaAsset * sigmaFx);
}

/**
 * σ_{q,m} wg R-2: Var(q_{t+12} − q_t) = 2·V_q·(1 − φ^12) + ω_q·σ_q², V_q = σ_{q,m}²·K_q/(1 − φ²);
 * σ_q to odchylenie 12-miesięcznej zmiany ln q, a po stronie szumu zostaje σ_q²(1 − ω_q).
 */
export function fxMonthlySigma(f: FxParams, alpha: number, r: RegimeParams, c: RegimeConstants): number {
  const phi = fxPhi(f.halfLifeYears);
  const w = omega(alpha, c);
  const k = c.pi0 + c.pi1 * r.kappa1 * r.kappa1;
  const noiseVar = f.sigma * f.sigma * (1 - w);
  return Math.sqrt((noiseVar * (1 - phi * phi)) / (2 * k * (1 - Math.pow(phi, 12))));
}

/**
 * Realny kurs walutowy powracający do średniej (spec 4.7):
 * q_{t+1} = φ q_t + regimeShift + σ_{q,m}·shock, ln S_t/S_0 = q_t + ln CPI^{PL}_t − π^F·t/12.
 */
export class FxProcess {
  q = 0;
  logRate = 0;
  private readonly phi: number;
  private readonly foreignInflation: number;

  constructor(p: FxParams, private readonly sigmaMonthly: number) {
    this.phi = fxPhi(p.halfLifeYears);
    this.foreignInflation = p.foreignInflation;
  }

  init(): void {
    this.q = 0;
    this.logRate = 0;
  }

  /** shock = κ·s·(Lz)_fx (σ_{q,m} mnożone tutaj); regimeShift = α σ_q δ_s; t = miesiąc początku kroku. */
  step(shock: number, regimeShift: number, cpiLogDomestic: number, t: number): void {
    this.q = this.phi * this.q + regimeShift + this.sigmaMonthly * shock;
    this.logRate = this.q + cpiLogDomestic - (this.foreignInflation * (t + 1)) / 12;
  }
}
