import type { Scenario, Warning } from './types';

export type ValidationResult =
  | { ok: true; warnings: Warning[] }
  | { ok: false; errors: { path: string; message: string }[] };

const MAX_HORIZON_MONTHS = 960;
const MIN_NU = 3;
const CORR_TOL = 1e-9;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function validateScenario(s: Scenario): ValidationResult {
  const errors: { path: string; message: string }[] = [];
  const warnings: Warning[] = [];
  const err = (path: string, message: string): void => {
    errors.push({ path, message });
  };

  if (!Number.isInteger(s.horizonMonths) || s.horizonMonths < 1 || s.horizonMonths > MAX_HORIZON_MONTHS) {
    err('horizonMonths', `Horyzont musi być liczbą całkowitą miesięcy od 1 do ${MAX_HORIZON_MONTHS}.`);
  }

  const m = s.market;
  // ν jest używane tylko w trybie realistic (w gbm tabela skali to same jedynki)
  if (m.mode === 'realistic' && !(m.nu >= MIN_NU)) {
    err('market.nu', `Liczba stopni swobody ν musi wynosić co najmniej ${MIN_NU}.`);
  }
  if (!isNum(m.uncertaintyScale) || m.uncertaintyScale < 0) {
    err('market.uncertaintyScale', 'Mnożnik niepewności parametrów nie może być ujemny.');
  }

  const rg = m.regime;
  if (!isNum(rg.p01) || rg.p01 < 0 || rg.p01 > 1) err('market.regime.p01', 'Prawdopodobieństwo p01 musi mieścić się w przedziale 0..1.');
  if (!isNum(rg.p10) || rg.p10 < 0 || rg.p10 > 1) err('market.regime.p10', 'Prawdopodobieństwo p10 musi mieścić się w przedziale 0..1.');
  if (!isNum(rg.kappa1) || rg.kappa1 < 1) err('market.regime.kappa1', 'Mnożnik zmienności kryzysu κ1 musi wynosić co najmniej 1.');
  if (!isNum(rg.delta) || rg.delta < 0) err('market.regime.delta', 'Odchylenie reżimu δ nie może być ujemne.');

  const infl = m.inflation;
  if (!isNum(infl.phi) || infl.phi <= -1 || infl.phi >= 1) err('market.inflation.phi', 'Persystencja inflacji φ musi należeć do przedziału (-1, 1).');
  if (!isNum(infl.sigmaEta) || infl.sigmaEta < 0) err('market.inflation.sigmaEta', 'Zmienność szoku inflacji nie może być ujemna.');
  if (!isNum(infl.meanSe) || infl.meanSe < 0) err('market.inflation.meanSe', 'Niepewność średniej inflacji nie może być ujemna.');
  if (!isNum(infl.mean) || !isNum(infl.x0)) err('market.inflation.mean', 'Średnia i bieżąca inflacja muszą być liczbami.');
  if (infl.cpiHistory.length !== 13 || infl.cpiHistory.some((v) => !isNum(v) || v <= 0)) {
    err('market.inflation.cpiHistory', 'Historia CPI musi mieć 13 dodatnich poziomów.');
  }

  const fxCurrencies = new Set<string>();
  m.fx.forEach((f, i) => {
    const p = `market.fx[${i}]`;
    if (fxCurrencies.has(f.currency)) err(`${p}.currency`, `Powtórzona waluta ${f.currency}.`);
    fxCurrencies.add(f.currency);
    if (!isNum(f.sigma) || f.sigma < 0) err(`${p}.sigma`, 'Zmienność kursu σ nie może być ujemna.');
    if (!isNum(f.halfLifeYears) || f.halfLifeYears <= 0) err(`${p}.halfLifeYears`, 'Półokres powrotu kursu do średniej musi być dodatni.');
    if (!isNum(f.alpha)) err(`${p}.alpha`, 'Ładunek kryzysowy α kursu musi być liczbą.');
    if (!isNum(f.foreignInflation)) err(`${p}.foreignInflation`, 'Inflacja zagraniczna musi być liczbą.');
  });

  const seenIds = new Set<string>();
  s.assets.forEach((a, i) => {
    const p = `assets[${i}]`;
    if (seenIds.has(a.id)) err(`${p}.id`, `Powtórzony identyfikator aktywa: ${a.id}.`);
    seenIds.add(a.id);
    if (a.kind === 'deposit') {
      if (!isNum(a.k) || a.k < 0 || a.k > 1) err(`${p}.k`, 'Szybkość dopasowania lokaty k musi mieścić się w przedziale 0..1.');
      if (!isNum(a.spread)) err(`${p}.spread`, 'Marża lokaty musi być liczbą.');
      if (!isNum(a.initialRate) || a.initialRate < 0) err(`${p}.initialRate`, 'Początkowe oprocentowanie lokaty nie może być ujemne.');
      return;
    }
    if (a.kind === 'edo') {
      if (!isNum(a.firstYearRate) || a.firstYearRate < 0) err(`${p}.firstYearRate`, 'Oprocentowanie pierwszego roku nie może być ujemne.');
      if (!isNum(a.margin)) err(`${p}.margin`, 'Marża EDO musi być liczbą.');
      if (!isNum(a.earlyFeePer100) || a.earlyFeePer100 < 0) err(`${p}.earlyFeePer100`, 'Opłata za przedterminowy wykup nie może być ujemna.');
      if (a.onMaturity !== 'roll' && a.onMaturity !== 'cash') err(`${p}.onMaturity`, 'Po wykupie: "roll" lub "cash".');
      return;
    }
    if (!isNum(a.g) || a.g <= -1) err(`${p}.g`, 'Roczny zwrot g musi być większy niż -1.');
    if (!isNum(a.sigma) || a.sigma < 0) err(`${p}.sigma`, 'Zmienność σ nie może być ujemna.');
    if (!isNum(a.se) || a.se < 0) err(`${p}.se`, 'Błąd standardowy dryfu nie może być ujemny.');
    if (!isNum(a.alpha)) err(`${p}.alpha`, 'Ładunek kryzysowy α musi być liczbą.');
    if (!isNum(a.b) || a.b < 0 || a.b > 1) err(`${p}.b`, 'Współczynnik b musi mieścić się w przedziale 0..1.');
    if (!isNum(a.ter) || a.ter < 0) err(`${p}.ter`, 'Koszt TER nie może być ujemny.');
    if (a.collapse) {
      const { hazard, loss } = a.collapse;
      if (!isNum(hazard) || hazard < 0) err(`${p}.collapse.hazard`, 'Hazard musi być nieujemny.');
      if (!isNum(loss) || loss < 0 || loss > 1) err(`${p}.collapse.loss`, 'Strata musi mieścić się w przedziale 0..1.');
    }
    if (a.decay) {
      const d = a.decay;
      if (!isNum(d.tauG) || d.tauG <= 0) err(`${p}.decay.tauG`, 'Stała zaniku g musi być dodatnia.');
      if (!isNum(d.tauSigma) || d.tauSigma <= 0) err(`${p}.decay.tauSigma`, 'Stała zaniku σ musi być dodatnia.');
      if (!isNum(d.gInf) || d.gInf <= -1) err(`${p}.decay.gInf`, 'Graniczny zwrot musi być większy niż -1.');
      if (!isNum(d.sigmaInf) || d.sigmaInf < 0) err(`${p}.decay.sigmaInf`, 'Graniczna zmienność nie może być ujemna.');
    }
    if (a.currency !== 'PLN' && !fxCurrencies.has(a.currency)) {
      err(`${p}.currency`, `Brak procesu kursu dla waluty ${a.currency} (market.fx).`);
    }
  });
  if (s.baseCurrency !== 'PLN' && !fxCurrencies.has(s.baseCurrency)) {
    err('baseCurrency', `Brak procesu kursu dla waluty bazowej ${s.baseCurrency} (market.fx).`);
  }

  const wd = s.withdrawal;
  if (wd?.kind === 'guytonKlinger') {
    if (!isNum(wd.initialRate) || wd.initialRate <= 0 || wd.initialRate > 1) err('withdrawal.initialRate', 'Początkowa stopa wypłat musi mieścić się w przedziale (0, 1].');
    if (!isNum(wd.guardrail) || wd.guardrail <= 0 || wd.guardrail >= 1) err('withdrawal.guardrail', 'Margines reguł (guardrail) musi mieścić się w przedziale (0, 1).');
    if (!isNum(wd.adjustment) || wd.adjustment <= 0 || wd.adjustment >= 1) err('withdrawal.adjustment', 'Korekta wypłaty musi mieścić się w przedziale (0, 1).');
    if (!isNum(wd.inflationCap) || wd.inflationCap < 0) err('withdrawal.inflationCap', 'Limit indeksacji inflacją nie może być ujemny.');
  }

  const wr = s.wrappers;
  if (wr) {
    if (!isNum(wr.ikeLimit) || wr.ikeLimit < 0) err('wrappers.ikeLimit', 'Limit wpłat do IKE nie może być ujemny.');
    if (!isNum(wr.ikzeLimit) || wr.ikzeLimit < 0) err('wrappers.ikzeLimit', 'Limit wpłat do IKZE nie może być ujemny.');
    if (!isNum(wr.ikzeTaxRate) || wr.ikzeTaxRate < 0 || wr.ikzeTaxRate >= 1) err('wrappers.ikzeTaxRate', 'Stawka zwrotu podatku z IKZE musi mieścić się w przedziale [0, 1).');
    if (!isNum(wr.age) || wr.age < 0 || wr.age > 120) err('wrappers.age', 'Wiek musi mieścić się w przedziale 0..120 lat.');
    if (wr.limitGrowth !== undefined && (!isNum(wr.limitGrowth) || wr.limitGrowth <= -1)) err('wrappers.limitGrowth', 'Roczny wzrost limitów musi być większy niż -1.');
  }

  const ids = new Set(s.assets.map((a) => a.id));
  s.positions.forEach((pos, i) => {
    if (!ids.has(pos.assetId)) err(`positions[${i}].assetId`, `Nieznane aktywo: ${pos.assetId}.`);
  });

  // Zgodność factorIds z aktywami i kursami: aktywa ryzykowne, potem fx:*, cpi (MarketSimulator inaczej rzuci RangeError)
  const factorSet = new Set<string>();
  const riskyIds = new Set(s.assets.filter((a) => a.kind === 'risky').map((a) => a.id));
  for (const id of m.factorIds) {
    if (factorSet.has(id)) err('market.factorIds', `Powtórzony czynnik: ${id}.`);
    factorSet.add(id);
    if (id === 'cpi') continue;
    if (id.startsWith('fx:')) {
      if (!fxCurrencies.has(id.slice(3))) err('market.factorIds', `Czynnik ${id} nie ma wpisu w market.fx.`);
    } else if (!riskyIds.has(id)) {
      err('market.factorIds', `Czynnik ${id} nie jest aktywem ryzykownym.`);
    }
  }
  for (const id of riskyIds) {
    if (!factorSet.has(id)) err('market.factorIds', `Aktywo ryzykowne ${id} nie ma czynnika w market.factorIds.`);
  }
  for (const cur of fxCurrencies) {
    if (!factorSet.has(`fx:${cur}`)) err('market.fx', `Kurs ${cur} nie ma czynnika fx:${cur} w market.factorIds.`);
  }

  const n = m.factorIds.length;
  if (m.correlation.length !== n * n) {
    err('market.correlation', `Macierz korelacji musi mieć ${n * n} elementów (${n}x${n}), ma ${m.correlation.length}.`);
  } else if (m.correlation.some((r) => !isNum(r) || Math.abs(r) > 1)) {
    err('market.correlation', 'Elementy macierzy korelacji muszą należeć do przedziału [-1, 1].');
  } else {
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      if (Math.abs(m.correlation[i * n + i]! - 1) > CORR_TOL) ok = false;
      for (let j = i + 1; j < n && ok; j++) {
        if (Math.abs(m.correlation[i * n + j]! - m.correlation[j * n + i]!) > CORR_TOL) ok = false;
      }
    }
    if (!ok) err('market.correlation', 'Macierz korelacji musi być symetryczna z jedynkami na przekątnej.');
  }

  // Płynne: ryzykowne i lokata (EDO jest niepłynne). Pusty portfel: brak wag płynnych.
  const kindOf = new Map(s.assets.map((a) => [a.id, a.kind]));
  const liquidWeight = s.positions
    .filter((pos) => kindOf.get(pos.assetId) !== 'edo')
    .reduce((acc, pos) => acc + (pos.targetWeight > 0 ? pos.targetWeight : 0), 0);
  if (liquidWeight === 0) {
    warnings.push({
      code: 'EMPTY_PORTFOLIO',
      message: 'Suma docelowych wag aktywów płynnych wynosi 0; rebalans nie wykona transakcji.',
    });
  }

  if (s.positions.some((pos) => pos.targetWeight < 0)) {
    warnings.push({
      code: 'NEGATIVE_TARGET_WEIGHT',
      message: 'Ujemna docelowa waga jest traktowana jak 0 (bez krótkiej sprzedaży).',
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, warnings };
}
