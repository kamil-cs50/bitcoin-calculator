import type { Scenario, Warning } from './types';

export type ValidationResult =
  | { ok: true; warnings: Warning[] }
  | { ok: false; errors: { path: string; message: string }[] };

const MAX_HORIZON_MONTHS = 960;
const MIN_NU = 3;

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
  if (!(m.nu >= MIN_NU)) err('market.nu', `Liczba stopni swobody ν musi wynosić co najmniej ${MIN_NU}.`);

  s.assets.forEach((a, i) => {
    const p = `assets[${i}]`;
    if (a.kind !== 'risky') return;
    if (!isNum(a.g) || a.g <= -1) err(`${p}.g`, 'Roczny zwrot g musi być większy niż -1.');
    if (!isNum(a.sigma) || a.sigma < 0) err(`${p}.sigma`, 'Zmienność σ nie może być ujemna.');
    if (a.collapse) {
      const { hazard, loss } = a.collapse;
      if (!isNum(hazard) || hazard < 0) err(`${p}.collapse.hazard`, 'Hazard musi być nieujemny.');
      if (!isNum(loss) || loss < 0 || loss > 1) err(`${p}.collapse.loss`, 'Strata musi mieścić się w przedziale 0..1.');
    }
  });

  const ids = new Set(s.assets.map((a) => a.id));
  s.positions.forEach((pos, i) => {
    if (!ids.has(pos.assetId)) err(`positions[${i}].assetId`, `Nieznane aktywo: ${pos.assetId}.`);
  });

  const n = m.factorIds.length;
  if (m.correlation.length !== n * n) {
    err('market.correlation', `Macierz korelacji musi mieć ${n * n} elementów (${n}x${n}), ma ${m.correlation.length}.`);
  } else if (m.correlation.some((r) => !isNum(r) || Math.abs(r) > 1)) {
    err('market.correlation', 'Elementy macierzy korelacji muszą należeć do przedziału [-1, 1].');
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

  return errors.length > 0 ? { ok: false, errors } : { ok: true, warnings };
}
