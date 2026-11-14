export type Currency = 'PLN' | 'USD' | 'EUR';
export type Wrapper = 'taxable' | 'IKE' | 'IKZE';
export type TaxForm = 'security' | 'crypto' | 'physicalGold' | 'none';
export interface DecayParams { gInf: number; tauG: number; sigmaInf: number; tauSigma: number }   // tau w latach
export interface CollapseParams { hazard: number; loss: number }                                     // na rok; 0..1
export interface RiskyAssetParams { kind: 'risky'; id: string; currency: Currency; g: number; sigma: number; se: number; alpha: number; b: number; ter: number; costBps: number; taxForm: TaxForm; decay?: DecayParams; collapse?: CollapseParams }
export interface DepositParams { kind: 'deposit'; id: string; k: number; spread: number; initialRate: number }
export interface EdoParams { kind: 'edo'; id: string; firstYearRate: number; margin: number; earlyFeePer100: number; onMaturity: 'roll' | 'cash' }
export type AssetParams = RiskyAssetParams | DepositParams | EdoParams;
export interface Position { assetId: string; wrapper: Wrapper; value: number; costBasis: number; targetWeight: number } // wartości w walucie bazowej
export interface RegimeParams { p01: number; p10: number; kappa1: number; delta: number }           // kappa0 = 1
export interface InflationParams { x0: number; mean: number; meanSe: number; phi: number; sigmaEta: number; cpiHistory: number[] } // 13 poziomów, ostatni = teraz
export interface FxParams { currency: 'USD' | 'EUR'; sigma: number; halfLifeYears: number; alpha: number; foreignInflation: number }
export interface MarketModel { mode: 'realistic' | 'gbm'; nu: number; regime: RegimeParams; factorIds: string[]; correlation: number[]; inflation: InflationParams; fx: FxParams[]; uncertaintyScale: number }
// factorIds: id aktywów ryzykownych, potem 'fx:USD', 'fx:EUR' (jeśli używane), na końcu 'cpi'; correlation wierszami
export interface Contribution { monthly: number; endMonth: number; indexation: 'none' | 'cpi' | 'cpiPlus'; realGrowth: number }
export type Withdrawal = { kind: 'fixedReal'; startMonth: number; monthly: number } | { kind: 'percent'; startMonth: number; rate: number } | { kind: 'abw'; startMonth: number; expectedRealReturn: number; floor?: number; cap?: number } | { kind: 'guytonKlinger'; startMonth: number; initialRate: number; guardrail: number; adjustment: number; inflationCap: number };
export interface OneOff { month: number; amount: number; real: boolean }                              // + wpływ, − wydatek
export type RebalancePolicy = { kind: 'none' } | { kind: 'annual' } | { kind: 'band'; bandPp: number } | { kind: 'flows' };
export type TaxMode = { kind: 'pl' } | { kind: 'none' } | { kind: 'flat'; rate: number };
export interface Scenario { schemaVersion: 1; datasetVersion: string; baseCurrency: Currency; startYear: number; startMonth: number; horizonMonths: number; assets: AssetParams[]; positions: Position[]; market: MarketModel; contribution?: Contribution; withdrawal?: Withdrawal; events: OneOff[]; rebalance: RebalancePolicy; tax: TaxMode; goal?: { amountReal: number; month: number } }
export interface Warning { code: 'CORR_PROJECTED' | 'LOSS_OVER_5M' | 'ALPHA_CLAMPED' | 'EMPTY_PORTFOLIO' | 'NEGATIVE_TARGET_WEIGHT'; message: string; data?: unknown }
export interface RunOptions { seed: number; paths: number; pathOffset?: number }
export interface RunResult { paths: number; grid: Int32Array; wealth: Float32Array; wealthAfterTax: Float32Array; cpi: Float32Array; ruinMonth: Int32Array; maxDrawdown: Float32Array; worst12m: Float32Array; twrLog: Float32Array; collapsed: Uint8Array; meanShare: Float64Array; warnings: Warning[] }
// wealth, wealthAfterTax, cpi: [path * grid.length + j], nominalnie w walucie bazowej; ruinMonth = -1 gdy brak
// collapsed: [path * liczbaAktywów + i]; meanShare: [rok * liczbaAktywów + i]
