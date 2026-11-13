import { z } from 'zod';

/** Data w formacie ISO `YYYY-MM-DD` (istniejąca data kalendarzowa). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'oczekiwany format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'nieistniejąca data');

export const SourceSchema = z.object({
  title: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  url: z.string().min(1),
  accessed: isoDate,
});
export type Source = z.infer<typeof SourceSchema>;

/** Metadane parametru (spec 6.6). */
export const ParamSchema = z
  .object({
    value: z.number().finite(),
    range: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    kind: z.enum(['data', 'forecast', 'assumption']),
    verified: z.enum(['yes', 'secondary', 'no']),
    sources: z.array(SourceSchema),
    note: z.string(),
  })
  .superRefine((p, ctx) => {
    if (p.kind !== 'assumption' && p.sources.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: "parametr o kind != 'assumption' wymaga co najmniej jednego źródła",
      });
    }
    if (p.range) {
      const [lo, hi] = p.range;
      if (lo > hi || p.value < lo || p.value > hi) {
        ctx.addIssue({
          code: 'custom',
          path: ['range'],
          message: 'range musi być uporządkowany i zawierać value',
        });
      }
    }
  });
export type Param = z.infer<typeof ParamSchema>;

const Currency = z.enum(['PLN', 'USD', 'EUR']);
export type Currency = z.infer<typeof Currency>;

/** Aktywo ryzykowne, lokata, obligacje, nieruchomość (spec 4.8, tabela 6.2). */
export const AssetPresetSchema = z.object({
  name: z.string().min(1),
  class: z.enum(['equity', 'bond', 'gold', 'deposit', 'realEstate']),
  currency: Currency,
  taxForm: z.enum(['securities', 'deposit', 'goldPhysical', 'realEstate']),
  /** Mediana CAGR nominalnie w walucie notowania. */
  g: ParamSchema,
  sigma: ParamSchema,
  /** Błąd standardowy dryfu rocznego (4.5). */
  se: ParamSchema,
  /** Ładunek kryzysowy α (4.4). */
  alpha: ParamSchema,
  /** Udział w mnożniku zmienności reżimu, b ∈ [0,1]. */
  b: ParamSchema,
  ter: ParamSchema,
  /** Lokata: prędkość dostosowania k i spread s (4.8). */
  depositK: ParamSchema.optional(),
  depositSpread: ParamSchema.optional(),
  /** Nieruchomość: czynsz netto jako ułamek ceny rocznie. */
  netRentYield: ParamSchema.optional(),
});
export type AssetPreset = z.infer<typeof AssetPresetSchema>;

/** Kryptowaluta z zanikiem i upadkiem (4.8, tabela 6.3). */
export const CryptoPresetSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  g0: ParamSchema,
  gInf: ParamSchema,
  tauG: ParamSchema,
  sigma0: ParamSchema,
  sigmaInf: ParamSchema,
  tauSigma: ParamSchema,
  /** Intensywność upadku na rok (h w spec 4.8). */
  hazard: ParamSchema,
  /** Strata przy upadku L (domyślnie 0,95). */
  loss: ParamSchema,
  se: ParamSchema,
  alpha: ParamSchema,
  b: ParamSchema,
  ter: ParamSchema,
});
export type CryptoPreset = z.infer<typeof CryptoPresetSchema>;

/** Reżimy, ogony i korelacje (4.3, 4.4). */
export const MarketPresetSchema = z.object({
  /** Parametry łańcucha reżimów RSLN-2 (4.4). */
  regime: z.object({
    p01: ParamSchema,
    p10: ParamSchema,
    kappa0: ParamSchema,
    kappa1: ParamSchema,
    delta: ParamSchema,
  }),
  /** Stopnie swobody mieszanki skali (4.3). */
  nu: ParamSchema,
  /** Korelacje wpisane; klucz `idA|idB` (identyfikatory aktywów, kursów lub `inflation`). */
  correlations: z.record(z.string(), ParamSchema),
});
export type MarketPreset = z.infer<typeof MarketPresetSchema>;

/** Inflacja PL (4.6, tabela 6.4). */
export const InflationPresetSchema = z.object({
  /** Długookresowa inflacja ī i jej SE. */
  longRun: ParamSchema,
  longRunSE: ParamSchema,
  /** Odchylenie inflacji r/r oraz autokorelacja r/r przy lagu 12. */
  yoySd: ParamSchema,
  yoyAutocorr12: ParamSchema,
  /** Ostatni odczyt r/r (x₀, 4.6 Z-13). */
  x0: ParamSchema,
  /** Poprzedni odczyt r/r (wrzesień 2026, tabela 6.4). */
  prevYoY: ParamSchema,
  /** Ostatni odczyt m/m (tabela 6.4; informacyjnie, nie służy za x₀). */
  lastMoM: ParamSchema,
  nbpTarget: ParamSchema,
  policyRate: ParamSchema,
  /** 13 ostatnich poziomów indeksu CPI, od najstarszego. */
  cpiLevels: z.array(ParamSchema).length(13),
});
export type InflationPreset = z.infer<typeof InflationPresetSchema>;

/** Realny kurs walutowy (4.7, 6.2, R-2). */
export const FxPresetSchema = z.object({
  /** Odchylenie 12-miesięcznej zmiany ln realnego kursu. */
  sigma: ParamSchema,
  halfLifeYears: ParamSchema,
  alpha: ParamSchema,
  /** Korelacja z akcjami. */
  corrEquities: ParamSchema,
  /** Inflacja zagraniczna π^F. */
  foreignInflation: ParamSchema,
  /** Trend realnej aprecjacji (Balassa–Samuelson), domyślnie 0. */
  realTrend: ParamSchema,
});
export type FxPreset = z.infer<typeof FxPresetSchema>;

/** Obligacje EDO (4.8, 6.4). */
export const EdoPresetSchema = z.object({
  firstYearRate: ParamSchema,
  margin: ParamSchema,
  /** Opłata za przedterminowy wykup w zł na obligację. */
  earlyFeePer100: ParamSchema,
  nominal: ParamSchema,
  termYears: ParamSchema,
  /** Marża przyszłych serii (rok 1 = max(0,x)+marża). */
  futureSeriesMargin: ParamSchema,
  /** Dane referencyjne z tabeli 6.4: COI1130 (rok 1, marża, opłata) i TOS. */
  coiFirstYearRate: ParamSchema,
  coiMargin: ParamSchema,
  coiEarlyFeePer100: ParamSchema,
  tosRate: ParamSchema,
});
export type EdoPreset = z.infer<typeof EdoPresetSchema>;

/** Podatki PL i limity (4.10, 6.4). */
export const TaxPresetSchema = z.object({
  capitalGainsRate: ParamSchema,
  interestRate: ParamSchema,
  lossCarryYears: ParamSchema,
  lossOneOffLimit: ParamSchema,
  lossAnnualShare: ParamSchema,
  rentalRateLow: ParamSchema,
  rentalRateHigh: ParamSchema,
  rentalThreshold: ParamSchema,
  ikeLimit2026: ParamSchema,
  ikeLimit2027: ParamSchema,
  ikzeLimit2026: ParamSchema,
  ikzeLimitBusiness2026: ParamSchema,
  ikzeLimit2027: ParamSchema,
  ikzeLimitBusiness2027: ParamSchema,
  goldExemptionMonths: ParamSchema,
  realEstateExemptionYears: ParamSchema,
});
export type TaxPreset = z.infer<typeof TaxPresetSchema>;

export const DatasetSchema = z.object({
  version: z.string().min(1),
  assets: z.record(z.string(), AssetPresetSchema),
  crypto: z.record(z.string(), CryptoPresetSchema),
  market: MarketPresetSchema,
  inflation: InflationPresetSchema,
  fx: z.object({ USD: FxPresetSchema, EUR: FxPresetSchema }),
  edo: EdoPresetSchema,
  taxPL: TaxPresetSchema,
});
export type Dataset = z.infer<typeof DatasetSchema>;
