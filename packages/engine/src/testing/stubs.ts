import type { FxProcessLike, InflationProcessLike } from '../models/market';
import type { FxParams, InflationParams } from '../types';

/**
 * Zaślepki procesów wstrzykiwanych do MarketSimulator (zadanie 10). Zadania 12-13 zastępują je
 * prawdziwymi `InflationProcess` i `FxProcess` o tych samych sygnaturach; szoki są ignorowane.
 */
export class ConstantInflation implements InflationProcessLike {
  x = 0;
  cpiLog = 0;
  private readonly x0: number;
  constructor(p: InflationParams) {
    this.x0 = p.x0;
    this.x = p.x0;
  }
  init(): void {
    this.x = this.x0;
    this.cpiLog = 0;
  }
  step(): void {
    this.cpiLog += this.x / 12;
  }
  yy(): number {
    return Math.exp(this.x) - 1;
  }
}

/** q ≡ 0; logRate = cpiLogDomestic − π^F·(t+1)/12 (kurs nominalny z PPP, bez szoków). */
export class ConstantFx implements FxProcessLike {
  q = 0;
  logRate = 0;
  private readonly foreignInflation: number;
  constructor(p: FxParams) {
    this.foreignInflation = p.foreignInflation;
  }
  init(): void {
    this.q = 0;
    this.logRate = 0;
  }
  step(_shock: number, _regimeShift: number, cpiLogDomestic: number, t: number): void {
    this.logRate = cpiLogDomestic - (this.foreignInflation * (t + 1)) / 12;
  }
}
