import { contributionAt, eventAmount } from './cashflows/contributions';
import { WithdrawalPolicy } from './cashflows/withdrawals';
import { DepositAccount } from './models/deposit';
import { EdoHoldings } from './models/edo';
import { MarketSimulator } from './models/market';
import type { MarketState } from './models/market';
import { LotQueue } from './portfolio/lots';
import { allocateInflow, allocateOutflow, rebalanceTrades } from './portfolio/rebalance';
import { createTaxEngine } from './tax/taxEngine';
import type { TaxEngine } from './tax/taxEngine';
import { PL_CAPITAL_GAINS_RATE } from './tax/pl/securities';
import { WrapperAccounts, wrapperWithdrawalTax } from './tax/pl/wrappers';
import type { Scenario, TaxForm, Warning, Wrapper } from './types';
import { validateScenario } from './validate';

/** Odbiorca wyników jednej ścieżki (wołany z pętli; implementacja nie powinna alokować). */
export interface PathSink {
  onGrid(j: number, wealth: number, wealthAfterTax: number, cpiLog: number): void;
  onEnd(ruinMonth: number, maxDrawdown: number, worst12mLog: number, twrLog: number): void;
}

/** Księga ścieżki: W_end = W_start + marketGains + contributions − withdrawals − taxesPaid − fees − costs. */
export interface PathLedger {
  /** Zyski rynkowe brutto (przed TER): aktywa ryzykowne, odsetki lokat brutto, narost EDO. */
  marketGains: number;
  contributions: number;
  /** Faktycznie wypłacone (żądane − niedobór), z wydatkami jednorazowymi. */
  withdrawals: number;
  /** Zapłacone: PIT-38 w kwietniu, podatek u źródła od odsetek lokat i EDO. */
  taxesPaid: number;
  /** TER. */
  fees: number;
  /** Koszty transakcji i opłata za przedterminowy wykup EDO. */
  costs: number;
  /** Suma niepokrytych wypłat (także po ruinie). */
  shortfall: number;
}

/**
 * Siatka zapisu (spec 4.14, Z-22): miesięczna ≤ 120, kwartalna ≤ 480, półroczna powyżej; zawiera 0 i horyzont.
 * Rozszerzenie spec 4.14: `extraMonths` (np. miesiąc celu) dołączane jako dodatkowe punkty (tylko liczby całkowite
 * z (0, horyzont)), by P(cel) i solver wpłaty liczyły dokładnie w miesiącu celu.
 */
export function buildGrid(horizonMonths: number, extraMonths: readonly number[] = []): Int32Array {
  const step = horizonMonths <= 120 ? 1 : horizonMonths <= 480 ? 3 : 6;
  const base = Math.floor(horizonMonths / step) + 1 + (horizonMonths % step === 0 ? 0 : 1);
  const extra: number[] = [];
  for (const m of extraMonths) {
    if (Number.isInteger(m) && m > 0 && m < horizonMonths && m % step !== 0 && !extra.includes(m)) extra.push(m);
  }
  const g = new Int32Array(base + extra.length);
  for (let i = 0; i < base - 1; i++) g[i] = i * step;
  g[base - 1] = horizonMonths;
  for (let i = 0; i < extra.length; i++) g[base + i] = extra[i]!;
  return g.sort();
}

const K_RISKY = 0;
const K_DEPOSIT = 1;
const K_EDO = 2;
/** Miesiąc zakupu pozycji początkowych (traktowane jako dawno kupione: złoto fizyczne zwolnione). */
const INITIAL_LOT_MONTH = -1000;
const FULL_SALE_EPS = 1e-12;
const MAX_COST_FRACTION = 0.99;

interface LatentPosition {
  form: TaxForm;
  wrapper: Wrapper;
  value: number;
  basis: number;
}

/**
 * Kernel jednej ścieżki (spec 4.1, kolejność zdarzeń Z-1). Wszystkie bufory powstają w konstruktorze;
 * pętla miesięczna nie alokuje (z wyjątkiem rocznego `closeYear` modułu podatkowego).
 *
 * Pozycje (`positions`) to osobne „szuflady” (slot na pozycję), więc to samo aktywo w różnych opakowaniach
 * ma niezależne partie FIFO, wagi docelowe i podatek.
 */
export class Kernel {
  readonly grid: Int32Array;
  readonly warnings: Warning[] = [];
  readonly ledger: PathLedger = { marketGains: 0, contributions: 0, withdrawals: 0, taxesPaid: 0, fees: 0, costs: 0, shortfall: 0 };
  /** Po ostatnim `simulate`: upadek aktywa (indeks w `scenario.assets`), 1 = upadło. */
  readonly collapsed: Uint8Array;

  private readonly s: Scenario;
  private readonly market: MarketSimulator;
  private readonly mstate: MarketState;
  private readonly tax: TaxEngine;
  private readonly wd: WithdrawalPolicy | null;
  private readonly horizon: number;
  private readonly depositTaxRate: number; // stawka u źródła dla opakowania „taxable”
  /** Limity i reguły IKE/IKZE (null: scenariusz bez `wrappers`, stare zachowanie). */
  private readonly wrap: WrapperAccounts | null;
  /** Reguły podatkowe opakowań (zwrot IKZE, podatek od wypłat) działają tylko w trybie `pl`. */
  private readonly wrapTax: boolean;
  private readonly twin: Int32Array; // slot opodatkowany tego samego aktywa (nadwyżka ponad limit), −1 = brak

  // sloty (jeden na pozycję)
  private readonly n: number;
  private readonly kind: Uint8Array;
  private readonly riskyIdx: Int32Array; // indeks w market.riskyIds
  private readonly wrapper: Wrapper[] = [];
  private readonly form: TaxForm[] = [];
  private readonly bps: Float64Array; // koszt transakcji jako ułamek
  private readonly terRetain: Float64Array; // (1 − TER)^{1/12}
  private readonly price: Float64Array;
  private readonly target: Float64Array;
  private readonly liquid: Uint8Array;
  private readonly liquidRisky: Uint8Array;
  private readonly slotTaxRate: Float64Array;
  private readonly lots: (LotQueue | undefined)[] = [];
  private readonly deposits: (DepositAccount | undefined)[] = [];
  private readonly edos: (EdoHoldings | undefined)[] = [];
  private readonly riskySlots: Int32Array;
  private readonly depositSlots: Int32Array;
  private readonly edoSlots: Int32Array;
  private readonly edoFirstRate: Float64Array;
  private readonly firstDeposit: number;
  private readonly collapsedAsset: Int32Array; // indeks aktywa w scenariuszu dla każdego czynnika ryzykownego rynku

  // bufory robocze
  private readonly values: Float64Array;
  private readonly eff: Float64Array;
  private readonly out: Float64Array;
  private readonly latentPos: LatentPosition[] = [];
  private readonly ring = new Float64Array(12);

  // stan ścieżki
  private cashIdle = 0;
  private taxDue = 0;
  private cpiNow = 0;
  private xNow = 0;
  private openYear = 0;
  private ruined = false;
  private ruinMonth = -1;
  private depInterestNet = 0;
  private pendingWrapperTax = 0;
  private noWrapperTax = false;
  private lastProceeds = 0;
  private lastCost = 0;
  private readonly pool = new Float64Array(3); // wpływy ze sprzedaży w opakowaniu podczas rebalansu (1 = IKE, 2 = IKZE)

  constructor(scenario: Scenario) {
    const v = validateScenario(scenario);
    if (!v.ok) {
      throw new Error('Kernel: niepoprawny scenariusz: ' + v.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
    }
    this.s = scenario;
    this.horizon = scenario.horizonMonths;
    this.grid = buildGrid(this.horizon, scenario.goal ? [scenario.goal.month] : []);
    this.collapsed = new Uint8Array(scenario.assets.length);
    this.market = new MarketSimulator(scenario);
    this.mstate = this.market.newState();
    this.tax = createTaxEngine(scenario.tax);
    this.wd = scenario.withdrawal ? new WithdrawalPolicy(scenario.withdrawal, this.horizon) : null;
    this.warnings.push(...v.warnings, ...this.market.warnings);
    this.depositTaxRate = scenario.tax.kind === 'pl' ? PL_CAPITAL_GAINS_RATE : scenario.tax.kind === 'flat' ? scenario.tax.rate : 0;

    this.wrap =
      scenario.wrappers !== undefined
        ? new WrapperAccounts(scenario.wrappers, scenario.startYear, scenario.market.inflation.mean + 0.01)
        : null;
    this.wrapTax = this.wrap !== null && scenario.tax.kind === 'pl';

    this.collapsedAsset = Int32Array.from(this.market.riskyIds.map((id) => scenario.assets.findIndex((a) => a.id === id)));

    const n = scenario.positions.length;
    this.n = n;
    this.kind = new Uint8Array(n);
    this.riskyIdx = new Int32Array(n).fill(-1);
    this.bps = new Float64Array(n);
    this.terRetain = new Float64Array(n).fill(1);
    this.price = new Float64Array(n).fill(1);
    this.target = new Float64Array(n);
    this.liquid = new Uint8Array(n);
    this.liquidRisky = new Uint8Array(n);
    this.slotTaxRate = new Float64Array(n);
    this.values = new Float64Array(n);
    this.eff = new Float64Array(n);
    this.out = new Float64Array(n);
    this.edoFirstRate = new Float64Array(n);
    this.twin = new Int32Array(n).fill(-1);
    const lotCapacity = 3 * this.horizon + 8;
    const risky: number[] = [];
    const deps: number[] = [];
    const edos: number[] = [];
    scenario.positions.forEach((pos, i) => {
      const a = scenario.assets.find((x) => x.id === pos.assetId)!;
      this.wrapper.push(pos.wrapper);
      this.target[i] = pos.targetWeight;
      this.slotTaxRate[i] = pos.wrapper === 'taxable' ? this.depositTaxRate : 0;
      if (a.kind === 'risky') {
        this.kind[i] = K_RISKY;
        this.form.push(a.taxForm);
        this.riskyIdx[i] = this.market.riskyIds.indexOf(a.id);
        const b = a.costBps / 10_000;
        this.bps[i] = Number.isFinite(b) ? Math.min(Math.max(b, 0), MAX_COST_FRACTION) : 0;
        this.terRetain[i] = Math.exp(Math.log1p(-Math.min(Math.max(a.ter, 0), 0.999999)) / 12);
        this.liquid[i] = 1;
        this.liquidRisky[i] = 1;
        this.lots.push(new LotQueue(lotCapacity));
        this.deposits.push(undefined);
        this.edos.push(undefined);
        risky.push(i);
        this.latentPos.push({ form: a.taxForm, wrapper: pos.wrapper, value: 0, basis: 0 });
      } else if (a.kind === 'deposit') {
        this.kind[i] = K_DEPOSIT;
        this.form.push('none');
        this.liquid[i] = 1;
        this.lots.push(undefined);
        this.deposits.push(new DepositAccount(a));
        this.edos.push(undefined);
        deps.push(i);
      } else {
        this.kind[i] = K_EDO;
        this.form.push('none');
        this.lots.push(undefined);
        this.deposits.push(undefined);
        this.edoFirstRate[i] = a.firstYearRate;
        this.edos.push(new EdoHoldings(a, 8));
        edos.push(i);
      }
    });
    for (let i = 0; i < n; i++) {
      if (this.wrapper[i] === 'taxable' || this.kind[i] === K_EDO) continue;
      for (let j = 0; j < n; j++) {
        if (this.wrapper[j] === 'taxable' && this.kind[j] !== K_EDO && scenario.positions[j]!.assetId === scenario.positions[i]!.assetId) {
          this.twin[i] = j;
          break;
        }
      }
    }
    this.riskySlots = Int32Array.from(risky);
    this.depositSlots = Int32Array.from(deps);
    this.edoSlots = Int32Array.from(edos);
    this.firstDeposit = deps.length > 0 ? deps[0]! : -1;
  }

  /** Wartości pozycji (indeks jak w `scenario.positions`) z ostatniego `emit`; ważne tylko wewnątrz `PathSink.onGrid`. */
  positionValues(): Float64Array {
    return this.values;
  }

  /** Symuluje ścieżkę `path` ziarna `seed`; wyniki na siatce i podsumowanie trafiają do `sink`. */
  simulate(seed: number, path: number, sink: PathSink): void {
    const s = this.s;
    const T = this.horizon;
    const grid = this.grid;
    const l = this.ledger;
    l.marketGains = l.contributions = l.withdrawals = l.taxesPaid = l.fees = l.costs = l.shortfall = 0;
    this.initPath(seed, path);

    let gi = 0;
    let twrLog = 0;
    let peakLog = 0;
    let maxDd = 0;
    let worst12 = Infinity;
    let count = 0;
    let ringIdx = 0;
    const win = T < 12 ? T : 12;
    const contribution = s.contribution;
    const events = s.events;
    const wd = this.wd;
    const startMonth = s.startMonth;

    this.openYear = s.startYear + Math.floor((startMonth - 1) / 12);
    this.emit(sink, gi, 0);

    for (let t = 0; t < T; t++) {
      const mi = startMonth - 1 + t;
      const cm = (mi % 12) + 1;
      const y = s.startYear + Math.floor(mi / 12);
      this.openYear = y;
      this.depInterestNet = 0;
      this.wrap?.newMonth(y);
      let lr = 0;

      if (!this.ruined) {
        // 1. zdarzenia kalendarzowe: styczeń zamyka rok podatkowy (wygaśnięcie strat, naliczenie zobowiązania),
        //    kwiecień płaci zobowiązanie; roczna wypłata ustalana w styczniu i w t = start (też poza styczniem)
        if (cm === 1 && t > 0) this.taxDue += this.tax.closeYear(y - 1);
        if (cm === 4 && this.taxDue > 0) this.payTax(t);
        if (cm === 4 && this.wrapTax) {
          const refund = this.wrap!.takeRefund();
          if (refund > 0) {
            this.toCash(refund);
            l.taxesPaid -= refund; // zwrot podatku IKZE jako ujemny podatek zapłacony
          }
        }
        if (wd !== null && (cm === 1 || t === 0 || wd.needsStartCall(t))) {
          this.computeValues(t);
          wd.onJanuary(t, this.afterTaxValue(t, this.wealthNow()), this.cpiNow, twrLog, cm === 1);
        }

        // 2. przychody do gotówki: odsetki lokat (po podatku u źródła), wykupy EDO
        this.incomes(t);

        // 3. wpłaty, wypłaty, zdarzenia jednorazowe (z góry)
        let inflow = 0;
        let outflow = 0;
        if (contribution) inflow += contributionAt(contribution, t, this.cpiNow);
        for (let e = 0; e < events.length; e++) {
          const ev = events[e]!;
          if (ev.month !== t) continue;
          const a = eventAmount(ev, this.cpiNow);
          if (a > 0) inflow += a;
          else outflow -= a;
        }
        if (wd !== null) outflow += wd.amountAt(t, this.cpiNow);
        if (inflow > 0) {
          this.computeValues(t);
          l.contributions += this.applyInflow(inflow, t);
        }
        if (outflow > 0) {
          const unpaid = this.settleOutflow(outflow, t);
          l.withdrawals += outflow - unpaid;
          if (unpaid > 1e-9 * (1 + outflow)) {
            l.shortfall += unpaid;
            this.declareRuin(t);
          }
        }

        // 4. rebalans (sprzedaże przez moduł podatkowy)
        if (!this.ruined) this.rebalance(t, cm === 1);
      } else {
        // po ruinie: ścieżka zamrożona na 0, niedobory dalej sumowane
        let outflow = 0;
        for (let e = 0; e < events.length; e++) {
          const ev = events[e]!;
          if (ev.month !== t) continue;
          const a = eventAmount(ev, this.cpiNow);
          if (a < 0) outflow -= a;
        }
        if (wd !== null) outflow += wd.amountAt(t, this.cpiNow);
        if (outflow > 0) l.shortfall += outflow;
      }

      // 5. zwroty rynkowe z TER; rynek (inflacja, kursy, reżim) dostarcza zwrotów i aktualizuje się w jednym kroku (6)
      this.market.step(t, this.mstate);
      if (!this.ruined) lr = this.applyReturns(t);

      // TWR, obsunięcie, najgorsze 12 miesięcy: na indeksie zwrotu portfela (bez przepływów)
      twrLog += lr;
      if (twrLog > peakLog) peakLog = twrLog;
      const dd = 1 - Math.exp(twrLog - peakLog);
      if (dd > maxDd) maxDd = dd;
      this.ring[ringIdx] = lr;
      ringIdx = ringIdx === 11 ? 0 : ringIdx + 1;
      count++;
      if (count >= win) {
        let sum = 0;
        for (let k = 0; k < 12; k++) sum += this.ring[k]!;
        if (sum < worst12) worst12 = sum;
      }

      // 6. stan rynku na koniec kroku i migawka na siatce
      this.xNow = this.mstate.x;
      this.cpiNow = this.mstate.cpiLog;
      for (let r = 0; r < this.collapsedAsset.length; r++) {
        if (this.mstate.collapsed[r] === 1) this.collapsed[this.collapsedAsset[r]!] = 1;
      }
      if (gi + 1 < grid.length && grid[gi + 1] === t + 1) {
        gi++;
        this.emit(sink, gi, t + 1);
      }
    }

    if (this.tax.warnings.length > 0 && !this.warnings.some((w) => w.code === this.tax.warnings[0]!.code)) {
      this.warnings.push(this.tax.warnings[0]!);
    }
    sink.onEnd(this.ruinMonth, maxDd, worst12, twrLog);
  }

  // ---------------------------------------------------------------- inicjalizacja

  private initPath(seed: number, path: number): void {
    const s = this.s;
    this.market.initPath(seed, path);
    this.tax.reset();
    this.wd?.reset();
    this.collapsed.fill(0);
    this.ring.fill(0);
    this.cashIdle = 0;
    this.taxDue = 0;
    this.cpiNow = 0;
    this.xNow = s.market.inflation.x0;
    this.ruined = false;
    this.ruinMonth = -1;
    this.depInterestNet = 0;
    this.pendingWrapperTax = 0;
    this.noWrapperTax = false;
    this.wrap?.reset();
    for (let i = 0; i < this.n; i++) {
      const pos = s.positions[i]!;
      const value = pos.value > 0 && Number.isFinite(pos.value) ? pos.value : 0;
      this.price[i] = 1;
      const k = this.kind[i]!;
      if (k === K_RISKY) {
        const lq = this.lots[i]!;
        lq.reset();
        if (value > 0) {
          const basis = Math.max(pos.costBasis, 0);
          lq.buy(value, basis, INITIAL_LOT_MONTH);
          // koszyk krypto startuje od kosztu pozycji początkowej (carry po styczniowym closeYear)
          this.tax.onBuy(this.form[i]!, this.wrapper[i]!, basis, 0);
        }
      } else if (k === K_DEPOSIT) {
        this.deposits[i]!.reset(value);
      } else {
        const e = this.edos[i]!;
        e.reset();
        if (value > 0) e.buy(value, 0, this.edoFirstRate[i]!);
      }
    }
  }

  // ---------------------------------------------------------------- wartości i migawka

  private computeValues(month: number): void {
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i]!;
      if (k === K_RISKY) this.values[i] = this.lots[i]!.units * this.price[i]!;
      else if (k === K_DEPOSIT) this.values[i] = this.deposits[i]!.balance;
      else this.values[i] = this.edos[i]!.value(month);
    }
  }

  /** Suma `values` (odświeżonych `computeValues`) i gotówki bez lokaty. */
  private wealthNow(): number {
    let w = this.cashIdle;
    for (let i = 0; i < this.n; i++) w += this.values[i]!;
    return w;
  }

  /**
   * Wartość po podatku przy sprzedaży całości (spec Z-2): aktywa − zobowiązanie z zamkniętych lat − podatek roku
   * bieżącego przy likwidacji (dotychczasowe sprzedaże i niezrealizowane zyski łącznie; wartości muszą być odświeżone).
   */
  private afterTaxValue(month: number, wealth: number): number {
    let owed = this.taxDue;
    for (let r = 0; r < this.riskySlots.length; r++) {
      const i = this.riskySlots[r]!;
      const p = this.latentPos[r]!;
      p.value = this.values[i]!;
      p.basis = this.lots[i]!.basis;
    }
    owed += this.tax.liquidationTax(this.latentPos, this.openYear);
    for (let r = 0; r < this.edoSlots.length; r++) {
      const i = this.edoSlots[r]!;
      const rate = this.slotTaxRate[i]!;
      if (rate > 0) owed += this.edos[i]!.netValue(month, 0) - this.edos[i]!.netValue(month, rate);
    }
    if (this.wrapTax) {
      const age = this.wrap!.settings.age + month / 12;
      for (let i = 0; i < this.n; i++) {
        if (this.wrapper[i] === 'taxable') continue;
        const v = this.values[i]!;
        owed += wrapperWithdrawalTax(this.wrapper[i]!, v, this.kind[i] === K_RISKY ? this.lots[i]!.basis : v, age);
      }
    }
    const a = wealth - owed;
    return a > 0 ? a : 0;
  }

  private emit(sink: PathSink, gi: number, month: number): void {
    this.computeValues(month);
    const w = this.wealthNow();
    sink.onGrid(gi, w, this.afterTaxValue(month, w), this.cpiNow);
  }

  // ---------------------------------------------------------------- krok 2: przychody

  private incomes(t: number): void {
    for (let r = 0; r < this.depositSlots.length; r++) {
      const i = this.depositSlots[r]!;
      const d = this.deposits[i]!;
      const gross = (d.balance * d.rate) / 12;
      const net = d.accrue(this.xNow, this.slotTaxRate[i]!);
      this.ledger.marketGains += gross;
      this.ledger.taxesPaid += gross - net;
      this.depInterestNet += net;
    }
    if (this.edoSlots.length > 0) {
      const yy2 = this.market.yyLag(2);
      for (let r = 0; r < this.edoSlots.length; r++) {
        const i = this.edoSlots[r]!;
        const e = this.edos[i]!;
        const before = e.value(t);
        const cash = e.onMonth(t, yy2, this.xNow, this.slotTaxRate[i]!);
        // wykup po 10 latach: podatek od odsetek pobrany u źródła (wartość przed − po − gotówka)
        this.ledger.taxesPaid += before - e.value(t) - cash;
        this.toCash(cash);
      }
    }
  }

  /** Gotówka trafia na pierwszą lokatę (jeśli jest), w przeciwnym razie na nieoprocentowany rachunek. */
  private toCash(x: number): void {
    if (!(x > 0)) return;
    if (this.firstDeposit >= 0) this.deposits[this.firstDeposit]!.deposit(x);
    else this.cashIdle += x;
  }

  // ---------------------------------------------------------------- transakcje

  private buyRisky(i: number, gross: number, t: number): void {
    const fee = gross * this.bps[i]!;
    this.lots[i]!.buy((gross - fee) / this.price[i]!, gross, t); // podstawa kosztu zawiera prowizję
    this.tax.onBuy(this.form[i]!, this.wrapper[i]!, gross, t);
    this.ledger.costs += fee;
  }

  /** Sprzedaje wartość `grossValue` aktywa ryzykownego; zwraca wpływ netto (po prowizji). */
  private sellRisky(i: number, grossValue: number, t: number): number {
    const lq = this.lots[i]!;
    if (!(lq.units > 0)) return 0;
    const p = this.price[i]!;
    let units = grossValue / p;
    if (units >= lq.units * (1 - FULL_SALE_EPS)) units = lq.units;
    const holding = t - lq.oldestMonth();
    const costFifo = lq.sell(units);
    const gross = units * p;
    const fee = gross * this.bps[i]!;
    const proceeds = gross - fee;
    this.tax.onSale(this.form[i]!, this.wrapper[i]!, proceeds, costFifo, t, holding);
    this.lastProceeds = proceeds;
    this.lastCost = costFifo;
    this.ledger.costs += fee;
    return proceeds;
  }

  private placeBuy(i: number, a: number, t: number): void {
    if (!(a > 0)) return;
    if (this.kind[i] === K_RISKY) this.buyRisky(i, a, t);
    else this.deposits[i]!.deposit(a);
  }

  /** Nadwyżka ponad limit opakowania: konto opodatkowane tego samego aktywa, a gdy go brak, gotówka. */
  private placeExcess(i: number, x: number, t: number): void {
    if (!(x > 0)) return;
    const j = this.twin[i]!;
    if (j >= 0) this.placeBuy(j, x, t);
    else this.toCash(x);
  }

  /** Wpływ z zewnątrz `amount` > 0 (wartości odświeżone). Zwraca faktycznie ulokowaną kwotę brutto. */
  private applyInflow(amount: number, t: number): number {
    allocateInflow(this.values, this.target, this.liquid, amount, this.s.rebalance, this.out);
    let sum = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.out[i]!;
      if (!(a > 0)) continue;
      if (this.wrap !== null && this.wrapper[i] !== 'taxable') {
        const allowed = this.wrap.admit(this.wrapper[i]!, a, 0);
        this.placeBuy(i, allowed, t);
        this.placeExcess(i, a - allowed, t);
      } else this.placeBuy(i, a, t);
      sum += a;
    }
    const rest = amount - sum;
    if (rest > 0) {
      this.toCash(rest);
      sum += rest;
    }
    return sum;
  }

  /**
   * Pokrywa wypłatę `amount` > 0: gotówka i lokaty, potem aktywa ryzykowne przeważone względem celu,
   * na końcu przedterminowy wykup EDO. Zwraca niedobór (≥ 0; 0 gdy pokryto w całości).
   */
  private settleOutflow(amount: number, t: number): number {
    let unpaid = this.settleCore(amount, t);
    if (this.pendingWrapperTax > 0) {
      // podatek opakowań od wypłaty jest pobierany od razu (płatnik potrąca), bez podatku od podatku
      const tax = this.pendingWrapperTax;
      this.pendingWrapperTax = 0;
      this.noWrapperTax = true;
      unpaid += this.settleCore(tax, t);
      this.noWrapperTax = false;
      this.ledger.taxesPaid += tax;
    }
    return unpaid;
  }

  private settleCore(amount: number, t: number): number {
    const age = this.wrapTax && !this.noWrapperTax ? this.wrap!.settings.age + t / 12 : -1;
    const tol = 1e-9 * (1 + amount);
    let rest = amount;
    if (this.cashIdle > 0) {
      const take = Math.min(rest, this.cashIdle);
      this.cashIdle -= take;
      rest -= take;
    }
    for (let r = 0; r < this.depositSlots.length && rest > 0; r++) {
      const i = this.depositSlots[r]!;
      const got = this.deposits[i]!.withdraw(rest);
      rest -= got;
      if (age >= 0 && this.wrapper[i] !== 'taxable') this.pendingWrapperTax += wrapperWithdrawalTax(this.wrapper[i]!, got, got, age);
    }
    if (rest > tol && this.riskySlots.length > 0) {
      // wartości efektywne (po prowizji), żeby sprzedaż dostarczyła dokładnie żądaną kwotę netto
      for (let i = 0; i < this.n; i++) {
        this.eff[i] = this.kind[i] === K_RISKY ? this.lots[i]!.units * this.price[i]! * (1 - this.bps[i]!) : 0;
      }
      allocateOutflow(this.eff, this.target, this.liquidRisky, -1, rest, this.out);
      for (let r = 0; r < this.riskySlots.length; r++) {
        const i = this.riskySlots[r]!;
        const a = -this.out[i]!;
        if (a > 0) {
          rest -= this.sellRisky(i, a / (1 - this.bps[i]!), t);
          if (age >= 0 && this.wrapper[i] !== 'taxable') {
            this.pendingWrapperTax += wrapperWithdrawalTax(this.wrapper[i]!, this.lastProceeds, this.lastCost, age);
          }
        }
      }
    }
    for (let r = 0; r < this.edoSlots.length && rest > tol; r++) {
      const i = this.edoSlots[r]!;
      const e = this.edos[i]!;
      rest -= e.redeemEarly(rest, t, this.slotTaxRate[i]!);
      this.ledger.costs += e.lastFee;
      this.ledger.taxesPaid += e.lastTax;
    }
    return rest > 0 ? rest : 0;
  }

  /** Kwiecień: płatność zobowiązania z gotówki, potem aktywów (jak wypłata); sprzedaże tworzą zobowiązanie na kolejny rok. */
  private payTax(t: number): void {
    const need = this.taxDue;
    const unpaid = this.settleOutflow(need, t);
    this.ledger.taxesPaid += need - unpaid;
    this.taxDue = unpaid;
  }

  /** Ruina: wszystko sprzedane, a wypłaty nie da się pokryć. Ścieżka zostaje na 0 (reszta zaokrągleń do księgi). */
  private declareRuin(t: number): void {
    this.ruined = true;
    if (this.ruinMonth < 0) this.ruinMonth = t;
    this.computeValues(t);
    this.ledger.marketGains -= this.wealthNow();
    this.cashIdle = 0;
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i]!;
      if (k === K_RISKY) this.lots[i]!.reset();
      else if (k === K_DEPOSIT) this.deposits[i]!.reset(0);
      else this.edos[i]!.reset();
    }
    this.taxDue = 0;
  }

  // ---------------------------------------------------------------- krok 4: rebalans

  private rebalance(t: number, isJanuary: boolean): void {
    const policy = this.s.rebalance;
    if (policy.kind === 'none' || policy.kind === 'flows') return;
    if (policy.kind === 'annual' && !isJanuary) return; // rebalanceTrades i tak zwróciłby false
    this.computeValues(t);
    if (!rebalanceTrades(this.values, this.target, this.liquid, policy, isJanuary, this.out)) return;
    let proceeds = 0;
    let buys = 0;
    this.pool.fill(0);
    for (let i = 0; i < this.n; i++) {
      const a = this.out[i]!;
      if (a < 0) {
        const p = this.kind[i] === K_RISKY ? this.sellRisky(i, -a, t) : this.deposits[i]!.withdraw(-a);
        proceeds += p;
        if (this.wrapper[i] === 'IKE') this.pool[1]! += p;
        else if (this.wrapper[i] === 'IKZE') this.pool[2]! += p;
      } else if (a > 0) buys += a;
    }
    if (!(buys > 0)) {
      this.toCash(proceeds);
      return;
    }
    // zakupy z wpływów netto po sprzedażach (prowizje zmniejszają kwotę), proporcjonalnie do zamierzonych
    const k = proceeds / buys;
    for (let i = 0; i < this.n; i++) {
      const a = this.out[i]!;
      if (!(a > 0)) continue;
      const w = this.wrapper[i]!;
      if (this.wrap !== null && w !== 'taxable') {
        // przeniesienie w obrębie opakowania nie jest wpłatą; reszta zużywa roczny limit, nadwyżka idzie na konto opodatkowane
        const pi = w === 'IKE' ? 1 : 2;
        const allowed = this.wrap.admit(w, a * k, this.pool[pi]!);
        this.pool[pi]! -= this.wrap.lastInternal;
        this.placeBuy(i, allowed, t);
        this.placeExcess(i, a * k - allowed, t);
      } else this.placeBuy(i, a * k, t);
    }
  }

  // ---------------------------------------------------------------- krok 5: zwroty

  /** Zwroty miesiąca z TER, księgowanie i log-zwrot portfela ważony wartościami sprzed zwrotu (bez przepływów i kosztów transakcji). */
  private applyReturns(t: number): number {
    this.computeValues(t);
    let base = this.cashIdle - this.depInterestNet;
    for (let i = 0; i < this.n; i++) base += this.values[i]!;
    let gainNet = this.depInterestNet;
    const lr = this.mstate.assetLogRet;
    const l = this.ledger;
    for (let r = 0; r < this.riskySlots.length; r++) {
      const i = this.riskySlots[r]!;
      const v = this.lots[i]!.units * this.price[i]!;
      const e = Math.exp(lr[this.riskyIdx[i]!]!);
      const gain = v * (e - 1);
      const fee = v * e * (1 - this.terRetain[i]!);
      this.price[i] = this.price[i]! * e * this.terRetain[i]!;
      l.marketGains += gain;
      l.fees += fee;
      gainNet += gain - fee;
    }
    for (let r = 0; r < this.edoSlots.length; r++) {
      const i = this.edoSlots[r]!;
      const g = this.edos[i]!.value(t + 1) - this.values[i]!;
      l.marketGains += g;
      gainNet += g;
    }
    if (!(base > 0)) return 0;
    let ret = gainNet / base;
    if (!(ret > -1 + 1e-15)) ret = -1 + 1e-15;
    return Math.log1p(ret);
  }
}
