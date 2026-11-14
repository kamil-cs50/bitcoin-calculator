import type { Scenario } from '@sim/engine';
import { z } from 'zod';

// Schemat Zod odpowiada typowi Scenario z @sim/engine (schemaVersion 1). Służy do
// walidacji danych wczytanych z IndexedDB: wpis uszkodzony lub ręcznie zmieniony nie może
// wejść do silnika. Zakresy (np. g > -1) sprawdza później validateScenario; tu pilnujemy
// kształtu i skończoności liczb.

const num = z.number().finite();
const Currency = z.enum(['PLN', 'USD', 'EUR']);
const Wrapper = z.enum(['taxable', 'IKE', 'IKZE']);
const TaxForm = z.enum(['security', 'crypto', 'physicalGold', 'none']);

const Decay = z.object({ gInf: num, tauG: num, sigmaInf: num, tauSigma: num });
const PowerLaw = z.object({ a: num, b: num, genesis: z.literal('2009-01-03') });
const Collapse = z.object({ hazard: num, loss: num });

const Risky = z.object({
  kind: z.literal('risky'),
  id: z.string().min(1),
  currency: Currency,
  g: num,
  sigma: num,
  se: num,
  alpha: num,
  b: num,
  ter: num,
  costBps: num,
  taxForm: TaxForm,
  decay: Decay.optional(),
  collapse: Collapse.optional(),
  powerLaw: PowerLaw.optional(),
});
const Deposit = z.object({
  kind: z.literal('deposit'),
  id: z.string().min(1),
  k: num,
  spread: num,
  initialRate: num,
});
const Edo = z.object({
  kind: z.literal('edo'),
  id: z.string().min(1),
  firstYearRate: num,
  margin: num,
  earlyFeePer100: num,
  onMaturity: z.enum(['roll', 'cash']),
});

const RealEstate = z.object({
  kind: z.literal('realEstate'),
  id: z.string().min(1),
  netRentYield: num,
  realGrowth: num,
  sigma: num,
  se: num,
  alpha: num,
  b: num,
  purchaseYear: z.number().int().optional(),
  saleYear: z.number().int().optional(),
});

const Position = z.object({
  assetId: z.string().min(1),
  wrapper: Wrapper,
  value: num,
  costBasis: num,
  targetWeight: num,
});

const Market = z.object({
  mode: z.enum(['realistic', 'gbm']),
  nu: num,
  regime: z.object({ p01: num, p10: num, kappa1: num, delta: num }),
  factorIds: z.array(z.string()),
  correlation: z.array(num),
  inflation: z.object({
    x0: num,
    mean: num,
    meanSe: num,
    phi: num,
    sigmaEta: num,
    cpiHistory: z.array(num),
  }),
  fx: z.array(
    z.object({
      currency: z.enum(['USD', 'EUR']),
      sigma: num,
      halfLifeYears: num,
      alpha: num,
      foreignInflation: num,
    }),
  ),
  uncertaintyScale: num,
});

const Contribution = z.object({
  monthly: num,
  endMonth: num,
  indexation: z.enum(['none', 'cpi', 'cpiPlus']),
  realGrowth: num,
});

const Withdrawal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixedReal'), startMonth: num, monthly: num }),
  z.object({ kind: z.literal('percent'), startMonth: num, rate: num }),
  z.object({
    kind: z.literal('guytonKlinger'),
    startMonth: num,
    initialRate: num,
    guardrail: num,
    adjustment: num,
    inflationCap: num,
  }),
  z.object({
    kind: z.literal('abw'),
    startMonth: num,
    expectedRealReturn: num,
    floor: num.optional(),
    cap: num.optional(),
  }),
]);

const Rebalance = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('annual') }),
  z.object({ kind: z.literal('band'), bandPp: num }),
  z.object({ kind: z.literal('flows') }),
]);

const Tax = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pl') }),
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('flat'), rate: num }),
]);

export const ScenarioSchema = z.object({
  schemaVersion: z.literal(1),
  datasetVersion: z.string().min(1),
  baseCurrency: Currency,
  startYear: z.number().int(),
  startMonth: z.number().int().min(1).max(12),
  horizonMonths: z.number().int(),
  assets: z.array(z.discriminatedUnion('kind', [Risky, Deposit, Edo, RealEstate])),
  positions: z.array(Position),
  market: Market,
  contribution: Contribution.optional(),
  withdrawal: Withdrawal.optional(),
  events: z.array(z.object({ month: num, amount: num, real: z.boolean() })),
  rebalance: Rebalance,
  tax: Tax,
  wrappers: z
    .object({ ikeLimit: num, ikzeLimit: num, ikzeTaxRate: num, age: num, limitGrowth: num.optional() })
    .optional(),
  person: z.object({ age: num, sex: z.enum(['M', 'K']).optional(), cohortBonus: z.boolean().optional() }).optional(),
  goal: z.object({ amountReal: num, month: num }).optional(),
}) satisfies z.ZodType<Scenario>;
