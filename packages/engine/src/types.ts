export type Currency = 'PLN' | 'USD' | 'EUR';
export type Wrapper = 'taxable' | 'IKE' | 'IKZE';
export type TaxForm = 'security' | 'crypto' | 'physicalGold' | 'none';
export interface DecayParams { gInf: number; tauG: number; sigmaInf: number; tauSigma: number }   // tau w latach
export interface CollapseParams { hazard: number; loss: number }                                     // na rok; 0..1
/**
 * Nakładka potęgowa BTC (spec 4.8, kontrowersyjna, domyślnie wyłączona = brak pola): zastępuje g(t) pochodną trendu
 * ln P = a + b·ln(dni od genesis). `a`, `b` wpisuje użytkownik (niezweryfikowane); dryf miesięczny = b·ln((d+30,44)/d).
 */
export interface PowerLawParams { a: number; b: number; genesis: '2009-01-03' }
export interface RiskyAssetParams { kind: 'risky'; id: string; currency: Currency; g: number; sigma: number; se: number; alpha: number; b: number; ter: number; costBps: number; taxForm: TaxForm; decay?: DecayParams; collapse?: CollapseParams; powerLaw?: PowerLawParams }
export interface DepositParams { kind: 'deposit'; id: string; k: number; spread: number; initialRate: number }
export interface EdoParams { kind: 'edo'; id: string; firstYearRate: number; margin: number; earlyFeePer100: number; onMaturity: 'roll' | 'cash' }
/**
 * Mieszkanie na wynajem (spec 4.8): cena jak aktywo ryzykowne o dryfie nominalnym = inflacja (x_t) + `realGrowth`,
 * czynsz netto `netRentYield` wartości rocznie trafia co miesiąc do gotówki po ryczałcie. Niepłynne: bez rebalansu
 * i częściowej sprzedaży. Wariant „mieszkam” (tylko majątek netto) nie jest aktywem symulacji.
 * `purchaseYear` (rok kalendarzowy nabycia; brak = sprzedaż bez zwolnienia, konserwatywnie) i `saleYear` (sprzedaż w styczniu tego roku; brak = bez sprzedaży).
 */
export interface RealEstateParams { kind: 'realEstate'; id: string; netRentYield: number; realGrowth: number; sigma: number; se: number; alpha: number; b: number; purchaseYear?: number; saleYear?: number }
export type AssetParams = RiskyAssetParams | DepositParams | EdoParams | RealEstateParams;
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
/** Limity i reguły IKE/IKZE; `limitGrowth` (opcjonalny) to roczny wzrost limitów, domyślnie inflacja długookresowa + 1 pp. `age` to wiek w chwili startu. */
export interface WrapperSettings { ikeLimit: number; ikzeLimit: number; ikzeTaxRate: number; age: number; limitGrowth?: number }
/** Wiek (pełne lata) i płeć użytkownika (opcjonalne; wiek jest też wymagany przy IKE/IKZE): do prawdopodobieństwa ruiny za życia (spec 4.12); `cohortBonus` = założenie „+2 lata”. Silnik symulacji tego nie używa. */
export interface Person { age: number; sex?: 'M' | 'K'; cohortBonus?: boolean }
export interface Scenario { schemaVersion: 1; datasetVersion: string; baseCurrency: Currency; startYear: number; startMonth: number; horizonMonths: number; assets: AssetParams[]; positions: Position[]; market: MarketModel; contribution?: Contribution; withdrawal?: Withdrawal; events: OneOff[]; rebalance: RebalancePolicy; tax: TaxMode; wrappers?: WrapperSettings; person?: Person; goal?: { amountReal: number; month: number } }
export interface Warning { code: 'CORR_PROJECTED' | 'LOSS_OVER_5M' | 'ALPHA_CLAMPED' | 'EMPTY_PORTFOLIO' | 'NEGATIVE_TARGET_WEIGHT'; message: string; data?: unknown }
export interface RunOptions { seed: number; paths: number; pathOffset?: number }
export interface RunResult { paths: number; grid: Int32Array; wealth: Float32Array; wealthAfterTax: Float32Array; cpi: Float32Array; ruinMonth: Int32Array; maxDrawdown: Float32Array; worst12m: Float32Array; twrLog: Float32Array; collapsed: Uint8Array; meanShare: Float64Array; warnings: Warning[] }
// wealth, wealthAfterTax, cpi: [path * grid.length + j], nominalnie w walucie bazowej; ruinMonth = -1 gdy brak
// collapsed: [path * liczbaAktywów + i]; meanShare: [rok * liczbaAktywów + i]
