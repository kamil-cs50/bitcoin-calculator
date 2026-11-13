import { cholesky, NotPositiveDefiniteError } from '../linalg/cholesky';
import { buildScaleTable } from '../math/scaleTable';
import { normalInv } from '../math/normalInv';
import { factorKey, streamSeed } from '../rng/streams';
import { Xoshiro128ss } from '../rng/xoshiro128ss';
import { drawDriftShifts } from './paramUncertainty';
import { ConstantFx, ConstantInflation } from '../testing/stubs';
import type { FxParams, InflationParams, RegimeParams, RiskyAssetParams, Scenario, Warning } from '../types';
import { clampAlpha, inRegimeCorrelation, omega, regimeConstants, sigmaMonthlyFactor } from './regime';
import type { RegimeConstants } from './regime';

/** Minimalny interfejs procesu inflacji (zadanie 12 dostarcza `InflationProcess` o tych sygnaturach). */
export interface InflationProcessLike {
  init(meanForPath: number): void;
  /** shock = s_t·(L z)_cpi */
  step(shock: number): void;
  readonly x: number;
  readonly cpiLog: number;
  yy(lagMonths?: number): number;
}

/** Minimalny interfejs procesu kursu (zadanie 13 dostarcza `FxProcess` o tych sygnaturach). */
export interface FxProcessLike {
  init(): void;
  /** shock = κ_s·s_t·(L z)_fx; regimeShift = α σ_q δ_s; t = miesiąc początku kroku. */
  step(shock: number, regimeShift: number, cpiLogDomestic: number, t: number): void;
  readonly q: number;
  readonly logRate: number;
}

export interface MarketDeps {
  inflation: (p: InflationParams) => InflationProcessLike;
  fx: (p: FxParams, sigmaMonthly: number) => FxProcessLike;
}

const DEFAULT_DEPS: MarketDeps = {
  inflation: (p) => new ConstantInflation(p),
  fx: (p) => new ConstantFx(p),
};

export interface MarketState {
  /** Log-zwrot miesiąca aktywa ryzykownego w walucie bazowej (po przeliczeniu kursu), wg `riskyIds`. */
  assetLogRet: Float64Array;
  /** ln(S_t/S_0) każdego kursu z `market.fx`, na koniec kroku. */
  fxLog: Float64Array;
  cpiLog: number;
  x: number;
  /** Inflacja r/r na koniec kroku. */
  yy: number;
  /** Reżim na koniec kroku (stan s_{t+1}). */
  regime: 0 | 1;
  collapsed: Uint8Array;
}

const TABLE_K = 1024;
const KEY_REGIME = factorKey('$regime');
const KEY_TAIL = factorKey('$tail');
const KEY_PARAM = factorKey('$paramUnc');

function isRisky(a: { kind: string }): a is RiskyAssetParams {
  return a.kind === 'risky';
}

export class MarketSimulator {
  readonly warnings: Warning[] = [];
  readonly riskyIds: string[] = [];

  private readonly n: number;
  private readonly nr: number;
  private readonly nfx: number;
  private readonly regimeP: RegimeParams;
  private readonly c: RegimeConstants;
  private readonly table: Float64Array;
  private readonly chol: Float64Array;
  private readonly assets: RiskyAssetParams[] = [];
  private readonly alpha: Float64Array; // po przycięciu ω ≤ 0,8
  private readonly fMonthly: Float64Array; // σ_m/σ
  private readonly kap0: Float64Array; // κ_{0,i}
  private readonly kap1: Float64Array;
  private readonly factorIndex: Int32Array; // czynnik aktywa
  private readonly assetFxIndex: Int32Array; // indeks w fx[] waluty aktywa, −1 = PLN
  private readonly baseFxIndex: number;
  private readonly fxFactor: Int32Array;
  private readonly fxKappa: Float64Array; // κ_{1} kursu (b = 1)
  private readonly fxRegimeScale: Float64Array; // α_q σ_q
  private readonly cpiFactor: number;
  private readonly pCollapse: Float64Array;
  private readonly lnSurvive: Float64Array;

  private readonly infl: InflationProcessLike;
  private readonly fxp: FxProcessLike[] = [];
  private readonly meanInflation: number;
  private readonly meanInflationSe: number;
  private readonly uncScale: number;
  private readonly cholAssets: Float64Array; // Cholesky wpisanej ρ aktywów ryzykownych
  private readonly seAssets: Float64Array;
  private readonly zUnc: Float64Array;
  private readonly rngParam = new Xoshiro128ss();

  private readonly rngRegime = new Xoshiro128ss();
  private readonly rngTail = new Xoshiro128ss();
  private readonly rngFactor: Xoshiro128ss[] = [];
  private readonly rngCollapse: (Xoshiro128ss | null)[] = [];
  private readonly factorSeedKeys: number[] = [];
  private readonly collapseSeedKeys: number[] = [];

  private readonly z: Float64Array;
  private readonly eps: Float64Array;
  private readonly prevFx: Float64Array;
  private readonly collapsedNow: Uint8Array;
  /** Roczne przesunięcia log-dryfu losowane w initPath (niepewność parametrów, spec 4.5). */
  private readonly driftShift: Float64Array;
  private regime: 0 | 1 = 0;

  constructor(readonly scenario: Scenario, deps: MarketDeps = DEFAULT_DEPS) {
    const m = scenario.market;
    const ids = m.factorIds;
    const n = ids.length;
    this.n = n;

    // tryb gbm: p01 = 0 (π1 = 0, V_δ = 0), tabela skali z samych jedynek
    this.regimeP = m.mode === 'gbm' ? { ...m.regime, p01: 0 } : m.regime;
    this.c = regimeConstants(this.regimeP);
    this.table = buildScaleTable(m.mode === 'gbm' ? Infinity : m.nu, TABLE_K);

    // czynniki: aktywa ryzykowne, fx:*, cpi
    const byId = new Map(scenario.assets.map((a) => [a.id, a]));
    const riskyFactor: number[] = [];
    this.cpiFactor = ids.indexOf('cpi');
    for (let i = 0; i < n; i++) {
      const id = ids[i]!;
      if (id === 'cpi' || id.startsWith('fx:')) continue;
      const a = byId.get(id);
      if (!a || !isRisky(a)) throw new RangeError(`MarketSimulator: czynnik "${id}" nie jest aktywem ryzykownym`);
      this.assets.push(a);
      this.riskyIds.push(id);
      riskyFactor.push(i);
    }
    this.nr = this.assets.length;
    this.factorIndex = Int32Array.from(riskyFactor);
    this.nfx = m.fx.length;
    this.fxFactor = new Int32Array(this.nfx);
    for (let k = 0; k < this.nfx; k++) {
      const idx = ids.indexOf(`fx:${m.fx[k]!.currency}`);
      if (idx < 0) throw new RangeError(`MarketSimulator: brak czynnika fx:${m.fx[k]!.currency}`);
      this.fxFactor[k] = idx;
    }
    const fxIdx = (cur: string): number => {
      if (cur === 'PLN') return -1;
      const k = m.fx.findIndex((f) => f.currency === cur);
      if (k < 0) throw new RangeError(`MarketSimulator: brak procesu kursu dla waluty ${cur}`);
      return k;
    };
    this.assetFxIndex = Int32Array.from(this.assets.map((a) => fxIdx(a.currency)));
    this.baseFxIndex = fxIdx(scenario.baseCurrency);

    // α (z przycięciem), b, κ, σ_m/σ
    const alpha = new Array<number>(n).fill(0);
    const b = new Array<number>(n).fill(0);
    const mask = new Array<boolean>(n).fill(false);
    this.alpha = new Float64Array(this.nr);
    this.fMonthly = new Float64Array(this.nr);
    this.kap0 = new Float64Array(this.nr);
    this.kap1 = new Float64Array(this.nr);
    this.assets.forEach((a, i) => {
      const cl = clampAlpha(a.alpha, this.c);
      if (cl.clamped)
        this.warnings.push({
          code: 'ALPHA_CLAMPED',
          message: `Ładunek kryzysowy α aktywa ${a.id} przycięto, aby udział reżimu w wariancji nie przekraczał 0,8.`,
          data: { id: a.id, from: a.alpha, to: cl.alpha },
        });
      this.alpha[i] = cl.alpha;
      this.fMonthly[i] = sigmaMonthlyFactor(cl.alpha, a.b, this.regimeP, this.c);
      this.kap0[i] = 1;
      this.kap1[i] = 1 + a.b * (this.regimeP.kappa1 - 1);
      const f = riskyFactor[i]!;
      alpha[f] = cl.alpha;
      b[f] = a.b;
      mask[f] = true;
    });
    this.fxKappa = new Float64Array(this.nfx);
    this.fxRegimeScale = new Float64Array(this.nfx);
    const fxSigmaM = new Float64Array(this.nfx);
    m.fx.forEach((f, k) => {
      const cl = clampAlpha(f.alpha, this.c);
      if (cl.clamped)
        this.warnings.push({
          code: 'ALPHA_CLAMPED',
          message: `Ładunek kryzysowy α kursu ${f.currency} przycięto, aby udział reżimu w wariancji nie przekraczał 0,8.`,
          data: { id: `fx:${f.currency}`, from: f.alpha, to: cl.alpha },
        });
      alpha[this.fxFactor[k]!] = cl.alpha;
      b[this.fxFactor[k]!] = 1;
      this.fxKappa[k] = this.regimeP.kappa1; // b = 1
      this.fxRegimeScale[k] = cl.alpha * f.sigma;
      fxSigmaM[k] = fxMonthlySigma(f, cl.alpha, this.regimeP, this.c);
    });

    // R̃ (R-1: korekta tylko dla par zwrot-zwrot) i Cholesky
    const rho = Float64Array.from(m.correlation);
    const rt = inRegimeCorrelation(rho, n, alpha, b, this.regimeP, mask);
    this.warnings.push(...rt.warnings);
    this.chol = robustCholesky(rt.matrix, n);

    // upadek
    this.pCollapse = new Float64Array(this.nr);
    this.lnSurvive = new Float64Array(this.nr);
    this.assets.forEach((a, i) => {
      if (a.collapse) {
        this.pCollapse[i] = 1 - Math.exp(-a.collapse.hazard / 12);
        this.lnSurvive[i] = Math.log(Math.max(1 - a.collapse.loss, 1e-12));
      }
    });

    // procesy
    this.infl = deps.inflation(m.inflation);
    this.meanInflation = m.inflation.mean;
    this.meanInflationSe = m.inflation.meanSe;
    this.uncScale = m.uncertaintyScale;
    // niepewność parametrów: Cholesky podmacierzy wpisanej ρ dla aktywów ryzykownych
    const nr = this.nr;
    const sub = new Float64Array(nr * nr);
    for (let i = 0; i < nr; i++)
      for (let j = 0; j < nr; j++) sub[i * nr + j] = rho[riskyFactor[i]! * n + riskyFactor[j]!]!;
    this.cholAssets = robustCholesky(sub, nr);
    this.seAssets = Float64Array.from(this.assets.map((a) => a.se));
    this.zUnc = new Float64Array(nr + 1);
    for (let k = 0; k < this.nfx; k++) this.fxp.push(deps.fx(m.fx[k]!, fxSigmaM[k]!));

    // strumienie i bufory
    for (let i = 0; i < n; i++) {
      this.rngFactor.push(new Xoshiro128ss());
      this.factorSeedKeys.push(factorKey(ids[i]!));
    }
    for (const a of this.assets) {
      this.rngCollapse.push(a.collapse ? new Xoshiro128ss() : null);
      this.collapseSeedKeys.push(factorKey(`collapse:${a.id}`));
    }
    this.z = new Float64Array(n);
    this.eps = new Float64Array(n);
    this.prevFx = new Float64Array(this.nfx);
    this.collapsedNow = new Uint8Array(this.nr);
    this.driftShift = new Float64Array(this.nr);
  }

  /** Nowy, prealokowany stan wyjściowy dla `step`. */
  newState(): MarketState {
    return {
      assetLogRet: new Float64Array(this.nr),
      fxLog: new Float64Array(this.nfx),
      cpiLog: 0,
      x: 0,
      yy: 0,
      regime: 0,
      collapsed: new Uint8Array(this.nr),
    };
  }

  initPath(seed: number, path: number): void {
    this.rngRegime.reseed(streamSeed(seed, path, KEY_REGIME));
    this.rngTail.reseed(streamSeed(seed, path, KEY_TAIL));
    for (let i = 0; i < this.n; i++) this.rngFactor[i]!.reseed(streamSeed(seed, path, this.factorSeedKeys[i]!));
    for (let i = 0; i < this.nr; i++) this.rngCollapse[i]?.reseed(streamSeed(seed, path, this.collapseSeedKeys[i]!));
    this.regime = this.rngRegime.nextUniform() < this.c.pi1 ? 1 : 0;
    this.collapsedNow.fill(0);
    // niepewność parametrów (strumień $paramUnc): nr normalnych dla dryfów, ostatnia dla średniej inflacji
    this.rngParam.reseed(streamSeed(seed, path, KEY_PARAM));
    for (let i = 0; i <= this.nr; i++) this.zUnc[i] = normalInv(this.rngParam.nextUniform());
    drawDriftShifts(this.zUnc, this.seAssets, this.cholAssets, this.nr, this.uncScale, this.driftShift);
    this.infl.init(this.meanInflation + this.meanInflationSe * this.uncScale * this.zUnc[this.nr]!);
    for (let k = 0; k < this.nfx; k++) {
      this.fxp[k]!.init();
      this.prevFx[k] = this.fxp[k]!.logRate;
    }
  }

  /** Miesiąc t → t+1: zwrot za miesiąc ze stanem s_t, potem aktualizacja reżimu, inflacji i kursów. */
  step(t: number, out: MarketState): void {
    const { n, nr, nfx, c } = this;
    const sPrev = this.regime;

    // 1. reżim (strumień regime): przejście s_t → s_{t+1}
    const uR = this.rngRegime.nextUniform();
    const sNext: 0 | 1 = sPrev === 0 ? (uR < this.regimeP.p01 ? 1 : 0) : uR < this.regimeP.p10 ? 0 : 1;
    // 2. skala (strumień tail)
    const sc = this.table[Math.floor(this.rngTail.nextUniform() * TABLE_K)]!;
    // 3. z z każdego strumienia czynnika, ε = s·(L z)
    for (let i = 0; i < n; i++) this.z[i] = normalInv(this.rngFactor[i]!.nextUniform());
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const row = i * n;
      for (let j = 0; j <= i; j++) acc += this.chol[row + j]! * this.z[j]!;
      this.eps[i] = sc * acc;
    }

    const delta = sPrev === 0 ? c.delta0 : c.delta1;
    const tYears = t / 12;

    // inflacja i kursy
    if (this.cpiFactor >= 0) this.infl.step(this.eps[this.cpiFactor]!);
    else this.infl.step(0);
    const cpiLog = this.infl.cpiLog;
    for (let k = 0; k < nfx; k++) {
      const kap = sPrev === 0 ? 1 : this.fxKappa[k]!;
      this.fxp[k]!.step(kap * this.eps[this.fxFactor[k]!]!, this.fxRegimeScale[k]! * delta, cpiLog, t);
    }

    // 4. aktywa
    const baseFx = this.baseFxIndex;
    const baseD = baseFx >= 0 ? this.fxp[baseFx]!.logRate - this.prevFx[baseFx]! : 0;
    for (let i = 0; i < nr; i++) {
      const a = this.assets[i]!;
      const d = a.decay;
      const dead = this.collapsedNow[i] === 1;
      let mu: number;
      let sigma: number;
      if (d) {
        const gT = d.gInf + (a.g - d.gInf) * Math.exp(-tYears / d.tauG);
        mu = Math.log1p(gT) / 12;
        sigma = dead ? d.sigmaInf : d.sigmaInf + (a.sigma - d.sigmaInf) * Math.exp(-tYears / d.tauSigma);
      } else {
        mu = Math.log1p(a.g) / 12;
        sigma = a.sigma;
      }
      const kap = sPrev === 0 ? this.kap0[i]! : this.kap1[i]!;
      let r = this.alpha[i]! * sigma * delta + sigma * this.fMonthly[i]! * kap * this.eps[this.factorIndex[i]!]!;
      if (!dead) r += mu + this.driftShift[i]! / 12;
      // 5. upadek (strumień collapse:<id>)
      const rc = this.rngCollapse[i];
      if (rc && !dead && rc.nextUniform() < this.pCollapse[i]!) {
        this.collapsedNow[i] = 1;
        r += this.lnSurvive[i]!;
      }
      const fi = this.assetFxIndex[i]!;
      if (fi >= 0) r += this.fxp[fi]!.logRate - this.prevFx[fi]!;
      r -= baseD;
      out.assetLogRet[i] = r;
      out.collapsed[i] = this.collapsedNow[i]!;
    }
    for (let k = 0; k < nfx; k++) {
      const lr = this.fxp[k]!.logRate;
      this.prevFx[k] = lr;
      out.fxLog[k] = lr;
    }
    out.cpiLog = cpiLog;
    out.x = this.infl.x;
    out.yy = this.infl.yy();
    this.regime = sNext;
    out.regime = sNext;
  }

  /** g(t) z zanikiem (t w miesiącach). */
  gAt(assetIndex: number, t: number): number {
    const a = this.assets[assetIndex]!;
    const d = a.decay;
    if (!d) return a.g;
    return d.gInf + (a.g - d.gInf) * Math.exp(-t / 12 / d.tauG);
  }

  sigmaAt(assetIndex: number, t: number): number {
    const a = this.assets[assetIndex]!;
    const d = a.decay;
    if (!d) return a.sigma;
    return d.sigmaInf + (a.sigma - d.sigmaInf) * Math.exp(-t / 12 / d.tauSigma);
  }
}

/**
 * σ_{q,m} wg R-2: Var(q_{t+12} − q_t) = 2·V_q·(1 − φ^12) + ω_q·σ_q², V_q = σ_{q,m}²·K_q/(1 − φ²),
 * z σ_q² = σ_q²(1 − ω_q) po stronie szumu. φ_q = 2^(−1/(12H)).
 */
function fxMonthlySigma(f: FxParams, alpha: number, r: RegimeParams, c: RegimeConstants): number {
  const phi = Math.pow(2, -1 / (12 * f.halfLifeYears));
  const w = omega(alpha, c);
  const k = c.pi0 + c.pi1 * r.kappa1 * r.kappa1;
  const noiseVar = f.sigma * f.sigma * (1 - w);
  return Math.sqrt((noiseVar * (1 - phi * phi)) / (2 * k * (1 - Math.pow(phi, 12))));
}

/** Cholesky z awaryjnym ściągnięciem do jedynki, gdy macierz po rzucie jest osobliwa (np. ρ = 1). */
function robustCholesky(m: Float64Array, n: number): Float64Array {
  let eps = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (eps === 0) return cholesky(m, n);
      const s = new Float64Array(n * n);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) s[i * n + j] = (1 - eps) * m[i * n + j]! + (i === j ? eps : 0);
      return cholesky(s, n);
    } catch (e) {
      if (!(e instanceof NotPositiveDefiniteError)) throw e;
      eps = eps === 0 ? 1e-12 : eps * 100;
    }
  }
  throw new NotPositiveDefiniteError();
}
