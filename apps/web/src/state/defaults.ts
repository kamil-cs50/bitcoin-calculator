import type { Dataset } from '@sim/data';
import { calibrateInflation } from '@sim/engine';
import type { AssetParams, Currency, FxParams, MarketModel, Scenario, TaxForm } from '@sim/engine';

/** Wersja zbioru danych dołączona do aplikacji; starszy zapis dostaje flagę datasetOutdated. */
export const CURRENT_DATASET_VERSION = '2026.11';

/** Domyślny koszt transakcji w punktach bazowych (zakładany; użytkownik może zmienić). */
export const DEFAULT_COST_BPS = 10;

/** Waluta notowania presetów kryptowalut (ceny BTC/ETH w USD; kurs w market.fx). */
const CRYPTO_CURRENCY: Currency = 'USD';

const TAX_FORM: Record<Dataset['assets'][string]['taxForm'], TaxForm> = {
  securities: 'security',
  goldPhysical: 'physicalGold',
  deposit: 'none',
  realEstate: 'none',
};

/** Parametry aktywa z presetu zbioru danych: aktywo z tabeli 6.2, krypto z 6.3, lokata lub `edo`. */
export function assetFromPreset(d: Dataset, presetId: string): AssetParams {
  const crypto = d.crypto[presetId];
  if (crypto) {
    return {
      kind: 'risky',
      id: presetId,
      currency: CRYPTO_CURRENCY,
      g: crypto.g0.value,
      sigma: crypto.sigma0.value,
      se: crypto.se.value,
      alpha: crypto.alpha.value,
      b: crypto.b.value,
      ter: crypto.ter.value,
      costBps: DEFAULT_COST_BPS,
      taxForm: 'crypto',
      decay: {
        gInf: crypto.gInf.value,
        tauG: crypto.tauG.value,
        sigmaInf: crypto.sigmaInf.value,
        tauSigma: crypto.tauSigma.value,
      },
      collapse: { hazard: crypto.hazard.value, loss: crypto.loss.value },
    };
  }
  const a = d.assets[presetId];
  if (a) {
    if (a.class === 'deposit') {
      return {
        kind: 'deposit',
        id: presetId,
        k: a.depositK?.value ?? 0.5,
        spread: a.depositSpread?.value ?? 0,
        initialRate: Math.max(0, d.inflation.x0.value + (a.depositSpread?.value ?? 0)),
      };
    }
    return {
      kind: 'risky',
      id: presetId,
      currency: a.currency,
      g: a.g.value,
      sigma: a.sigma.value,
      se: a.se.value,
      alpha: a.alpha.value,
      b: a.b.value,
      ter: a.ter.value,
      costBps: DEFAULT_COST_BPS,
      taxForm: TAX_FORM[a.taxForm],
    };
  }
  if (presetId === 'edo') {
    return {
      kind: 'edo',
      id: 'edo',
      firstYearRate: d.edo.firstYearRate.value,
      margin: d.edo.margin.value,
      earlyFeePer100: d.edo.earlyFeePer100.value,
      onMaturity: 'roll',
    };
  }
  throw new Error(`Nieznany preset aktywa: ${presetId}`);
}

/** Czynnik korelacji dla tokenu z klucza `idA|idB` w zbiorze danych. */
function factorToken(tok: string): string {
  if (tok === 'inflation') return 'cpi';
  if (tok === 'USD' || tok === 'EUR') return `fx:${tok}`;
  return tok;
}

function fxParams(d: Dataset, currency: 'USD' | 'EUR'): FxParams {
  const f = d.fx[currency];
  return {
    currency,
    sigma: f.sigma.value,
    halfLifeYears: f.halfLifeYears.value,
    alpha: f.alpha.value,
    foreignInflation: f.foreignInflation.value,
  };
}

/** Nowe parametry modelu rynku, niezależne od aktywów (reżimy, ν, inflacja). */
function marketBase(d: Dataset): Omit<MarketModel, 'factorIds' | 'correlation' | 'fx'> {
  const infl = d.inflation;
  const { phi, sigmaEta } = calibrateInflation(infl.yoySd.value, infl.yoyAutocorr12.value);
  const r = d.market.regime;
  return {
    mode: 'realistic',
    nu: d.market.nu.value,
    regime: { p01: r.p01.value, p10: r.p10.value, kappa1: r.kappa1.value, delta: r.delta.value },
    inflation: {
      x0: infl.x0.value,
      mean: infl.longRun.value,
      meanSe: infl.longRunSE.value,
      phi,
      sigmaEta,
      cpiHistory: infl.cpiLevels.map((p) => p.value),
    },
    uncertaintyScale: 1,
  };
}

/**
 * Odbudowuje czynniki, kursy i macierz korelacji dla listy aktywów (kolejność wg spec:
 * aktywa ryzykowne, fx:*, cpi). Pozostałe pola `prev` (tryb, ν, reżimy, inflacja,
 * mnożnik niepewności) zostają bez zmian. Korelacje bierzemy ze zbioru danych (klucz
 * `idA|idB`, w dowolnej kolejności), korelację kursu z akcjami z `fx.*.corrEquities`;
 * reszta to 0. Macierz niedodatnio określona jest rzutowana przez silnik z ostrzeżeniem.
 */
export function rebuildMarket(
  d: Dataset,
  prev: MarketModel,
  assets: readonly AssetParams[],
  baseCurrency: Currency,
): MarketModel {
  const risky = assets.filter((a) => a.kind === 'risky');
  const currencies = new Set<'USD' | 'EUR'>();
  for (const a of risky) if (a.currency !== 'PLN') currencies.add(a.currency);
  if (baseCurrency !== 'PLN') currencies.add(baseCurrency);
  const fxList = (['USD', 'EUR'] as const).filter((c) => currencies.has(c));

  const factorIds = [...risky.map((a) => a.id), ...fxList.map((c) => `fx:${c}`), 'cpi'];
  const n = factorIds.length;
  const idx = new Map(factorIds.map((id, i) => [id, i]));
  const correlation = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) correlation[i * n + i] = 1;
  const set = (a: string, b: string, rho: number): void => {
    const i = idx.get(a);
    const j = idx.get(b);
    if (i === undefined || j === undefined || i === j) return;
    correlation[i * n + j] = rho;
    correlation[j * n + i] = rho;
  };
  for (const [key, p] of Object.entries(d.market.correlations)) {
    const [a, b] = key.split('|');
    if (a && b) set(factorToken(a), factorToken(b), p.value);
  }
  for (const c of fxList) {
    for (const a of risky) {
      if (d.assets[a.id]?.class === 'equity') set(`fx:${c}`, a.id, d.fx[c].corrEquities.value);
    }
  }
  return { ...prev, factorIds, correlation, fx: fxList.map((c) => fxParams(d, c)) };
}

/** Pusty portfel, 20 lat, tryb realistic, podatki PL; start w bieżącym miesiącu. */
export function defaultScenario(d: Dataset, now: Date = new Date()): Scenario {
  const base: Scenario = {
    schemaVersion: 1,
    datasetVersion: d.version,
    baseCurrency: 'PLN',
    startYear: now.getUTCFullYear(),
    startMonth: now.getUTCMonth() + 1,
    horizonMonths: 240,
    assets: [],
    positions: [],
    market: { ...marketBase(d), factorIds: [], correlation: [], fx: [] },
    events: [],
    rebalance: { kind: 'annual' },
    tax: { kind: 'pl' },
  };
  return { ...base, market: rebuildMarket(d, base.market, base.assets, base.baseCurrency) };
}
