import { useLingui } from '@lingui/react/macro';
import type { Dataset } from '@sim/data';
import type { AssetParams, MarketModel, Scenario } from '@sim/engine';
import { useScenarioStore } from '../../state/scenarioStore';
import type { RowSpec } from './ParamRow';

export type RiskyAsset = Extract<AssetParams, { kind: 'risky' }>;

const edit = (fn: (s: Scenario) => Scenario): void => {
  const st = useScenarioStore.getState();
  st.setScenario(fn(st.scenario));
};

function setAsset(id: string, fn: (a: AssetParams) => AssetParams): void {
  edit((s) => ({ ...s, assets: s.assets.map((a) => (a.id === id ? fn(a) : a)) }));
}
const setMarket = (fn: (m: MarketModel) => MarketModel): void => edit((s) => ({ ...s, market: fn(s.market) }));

/** Wiersze parametrów (etykiety po polsku) dla aktywa, rynku, inflacji i kursów. */
export function useParamRows() {
  const { t } = useLingui();
  const dataset = useScenarioStore((s) => s.dataset);

  /** Wiersze aktywa; `crisis` = tylko α i b („wrażliwość na kryzysy”), inaczej wszystko poza nimi. */
  function assetRows(a: AssetParams, d: Dataset, crisis: boolean, name = ''): RowSpec[] {
    const rows: RowSpec[] = [];
    const add = (r: RowSpec): void => void rows.push(r);
    const sfx = name ? `: ${name}` : '';

    if (a.kind === 'risky') {
      const crypto = d.crypto[a.id];
      const asset = d.assets[a.id];
      const p = crypto
        ? { g: crypto.g0, sigma: crypto.sigma0, se: crypto.se, alpha: crypto.alpha, b: crypto.b, ter: crypto.ter }
        : asset
          ? { g: asset.g, sigma: asset.sigma, se: asset.se, alpha: asset.alpha, b: asset.b, ter: asset.ter }
          : null;
      if (!p) return rows;
      const upd = (patch: Partial<RiskyAsset>): void => setAsset(a.id, (x) => ({ ...(x as RiskyAsset), ...patch }));
      if (crisis) {
        add({ key: `${a.id}.alpha`, label: t`α (ładunek kryzysowy)${sfx}`, param: p.alpha, value: a.alpha, unit: 'number', set: (v) => upd({ alpha: v }) });
        add({ key: `${a.id}.b`, label: t`b (udział w zmienności kryzysu)${sfx}`, param: p.b, value: a.b, unit: 'number', min: 0, max: 1, set: (v) => upd({ b: v }) });
        return rows;
      }
      add({ key: `${a.id}.g`, label: t`Oczekiwany zwrot roczny`, param: p.g, value: a.g, unit: 'percent', max: 1, set: (v) => upd({ g: v }) });
      add({ key: `${a.id}.sigma`, label: t`Zmienność roczna`, param: p.sigma, value: a.sigma, unit: 'percent', min: 0, max: 1.5, set: (v) => upd({ sigma: v }) });
      add({ key: `${a.id}.se`, label: t`Niepewność oczekiwanego zwrotu (SE)`, param: p.se, value: a.se, unit: 'percent', min: 0, max: 0.5, set: (v) => upd({ se: v }) });
      add({ key: `${a.id}.ter`, label: t`Koszt roczny (TER)`, param: p.ter, value: a.ter, unit: 'percent', min: 0, max: 0.1, set: (v) => upd({ ter: v }) });
      if (crypto && a.decay) {
        const dc = a.decay;
        const updD = (patch: Partial<typeof dc>): void => upd({ decay: { ...dc, ...patch } });
        add({ key: `${a.id}.gInf`, label: t`Docelowy zwrot roczny (po latach)`, param: crypto.gInf, value: dc.gInf, unit: 'percent', max: 1, set: (v) => updD({ gInf: v }) });
        add({ key: `${a.id}.tauG`, label: t`Czas dojścia zwrotu do docelowego (lata)`, param: crypto.tauG, value: dc.tauG, unit: 'years', min: 0.1, set: (v) => updD({ tauG: v }) });
        add({ key: `${a.id}.sigmaInf`, label: t`Docelowa zmienność roczna`, param: crypto.sigmaInf, value: dc.sigmaInf, unit: 'percent', min: 0, max: 1.5, set: (v) => updD({ sigmaInf: v }) });
        add({ key: `${a.id}.tauSigma`, label: t`Czas dojścia zmienności do docelowej (lata)`, param: crypto.tauSigma, value: dc.tauSigma, unit: 'years', min: 0.1, set: (v) => updD({ tauSigma: v }) });
      }
      if (crypto && a.collapse) {
        const cl = a.collapse;
        const updC = (patch: Partial<typeof cl>): void => upd({ collapse: { ...cl, ...patch } });
        add({ key: `${a.id}.hazard`, label: t`Roczne ryzyko upadku`, param: crypto.hazard, value: cl.hazard, unit: 'percent', min: 0, max: 1, set: (v) => updC({ hazard: v }) });
        add({ key: `${a.id}.loss`, label: t`Strata przy upadku`, param: crypto.loss, value: cl.loss, unit: 'percent', min: 0, max: 1, set: (v) => updC({ loss: v }) });
      }
      return rows;
    }

    if (crisis) return rows;
    if (a.kind === 'deposit') {
      const dep = d.assets[a.id];
      if (!dep?.depositK || !dep.depositSpread) return rows;
      add({ key: `${a.id}.k`, label: t`Szybkość dostosowania oprocentowania (na miesiąc)`, param: dep.depositK, value: a.k, unit: 'number', min: 0, max: 1, set: (v) => setAsset(a.id, (x) => ({ ...(x as typeof a), k: v })) });
      add({
        key: `${a.id}.spread`,
        label: t`Spread oprocentowania względem inflacji`,
        param: dep.depositSpread,
        value: a.spread,
        unit: 'percent',
        min: -0.1,
        max: 0.1,
        set: (v) =>
          setAsset(a.id, (x) => ({
            ...(x as typeof a),
            spread: v,
            initialRate: Math.max(0, useScenarioStore.getState().scenario.market.inflation.x0 + v),
          })),
      });
      return rows;
    }
    // EDO
    const e = d.edo;
    const updE = (patch: Partial<typeof a>): void => setAsset(a.id, (x) => ({ ...(x as typeof a), ...patch }));
    add({ key: 'edo.first', label: t`Oprocentowanie w pierwszym roku`, param: e.firstYearRate, value: a.firstYearRate, unit: 'percent', min: 0, max: 0.5, set: (v) => updE({ firstYearRate: v }) });
    add({ key: 'edo.margin', label: t`Marża ponad inflację`, param: e.margin, value: a.margin, unit: 'percent', min: 0, max: 0.1, set: (v) => updE({ margin: v }) });
    add({ key: 'edo.fee', label: t`Opłata za wykup przed terminem (zł na 100 zł)`, param: e.earlyFeePer100, value: a.earlyFeePer100, unit: 'pln', min: 0, max: 10, set: (v) => updE({ earlyFeePer100: v }) });
    return rows;
  }

  /** Inflacja długookresowa i kursy walut (jawne parametry scenariusza). */
  function marketRows(m: MarketModel, d: Dataset, crisis: boolean): RowSpec[] {
    const rows: RowSpec[] = [];
    const infl = m.inflation;
    const setInfl = (patch: Partial<typeof infl>): void => setMarket((x) => ({ ...x, inflation: { ...x.inflation, ...patch } }));
    if (!crisis) {
      rows.push({ key: 'inflation.mean', label: t`Inflacja długookresowa`, param: d.inflation.longRun, value: infl.mean, unit: 'percent', min: -0.05, max: 0.3, set: (v) => setInfl({ mean: v }) });
      rows.push({ key: 'inflation.se', label: t`Niepewność inflacji długookresowej (SE)`, param: d.inflation.longRunSE, value: infl.meanSe, unit: 'percent', min: 0, max: 0.1, set: (v) => setInfl({ meanSe: v }) });
      rows.push({ key: 'inflation.x0', label: t`Ostatni odczyt inflacji r/r`, param: d.inflation.x0, value: infl.x0, unit: 'percent', min: -0.05, max: 0.5, set: (v) => setInfl({ x0: v }) });
    }
    m.fx.forEach((f, i) => {
      const fp = d.fx[f.currency];
      const setFx = (patch: Partial<typeof f>): void =>
        setMarket((x) => ({ ...x, fx: x.fx.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
      if (crisis) {
        rows.push({ key: `fx.${f.currency}.alpha`, label: t`α (ładunek kryzysowy): kurs ${f.currency}`, param: fp.alpha, value: f.alpha, unit: 'number', set: (v) => setFx({ alpha: v }) });
        return;
      }
      rows.push({ key: `fx.${f.currency}.sigma`, label: t`Zmienność realnego kursu ${f.currency}`, param: fp.sigma, value: f.sigma, unit: 'percent', min: 0, max: 1, set: (v) => setFx({ sigma: v }) });
      rows.push({ key: `fx.${f.currency}.half`, label: t`Półokres powrotu kursu ${f.currency} do średniej (lata)`, param: fp.halfLifeYears, value: f.halfLifeYears, unit: 'years', min: 0.1, set: (v) => setFx({ halfLifeYears: v }) });
      rows.push({ key: `fx.${f.currency}.infl`, label: t`Inflacja zagraniczna (${f.currency})`, param: fp.foreignInflation, value: f.foreignInflation, unit: 'percent', min: -0.05, max: 0.3, set: (v) => setFx({ foreignInflation: v }) });
    });
    return rows;
  }

  /** Model rynku (tylko tryb eksperta): ν i parametry reżimów. */
  function modelRows(m: MarketModel, d: Dataset): { nu: RowSpec; regime: RowSpec[] } {
    const r = d.market.regime;
    const setR = (patch: Partial<MarketModel['regime']>): void => setMarket((x) => ({ ...x, regime: { ...x.regime, ...patch } }));
    return {
      nu: { key: 'market.nu', label: t`Liczba stopni swobody ν (grubość ogonów)`, param: d.market.nu, value: m.nu, unit: 'number', min: 3, set: (v) => setMarket((x) => ({ ...x, nu: v })) },
      regime: [
        { key: 'regime.p01', label: t`Szansa wejścia w kryzys (na miesiąc)`, param: r.p01, value: m.regime.p01, unit: 'percent', min: 0, max: 1, set: (v) => setR({ p01: v }) },
        { key: 'regime.p10', label: t`Szansa wyjścia z kryzysu (na miesiąc)`, param: r.p10, value: m.regime.p10, unit: 'percent', min: 0, max: 1, set: (v) => setR({ p10: v }) },
        { key: 'regime.kappa1', label: t`Mnożnik zmienności w kryzysie (κ₁)`, param: r.kappa1, value: m.regime.kappa1, unit: 'number', min: 1, set: (v) => setR({ kappa1: v }) },
        { key: 'regime.delta', label: t`Przesunięcie dryfu w kryzysie (δ)`, param: r.delta, value: m.regime.delta, unit: 'number', min: 0, set: (v) => setR({ delta: v }) },
      ],
    };
  }

  return { dataset, assetRows, marketRows, modelRows };
}
