/** Rejestr funkcji. Na razie wszystko jest dostępne dla wszystkich (spec 5: bez licencji i kont). */
export const FREE_FOR_ALL = true;

export const FEATURE_IDS = ['compare', 'solver.safeWithdrawal', 'solver.requiredContribution', 'paths.expert', 'export.json'] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Czy bieżący użytkownik ma daną funkcję. Jedno miejsce do podmiany, gdy pojawi się model płatny. */
export function useEntitlement(f: FeatureId): boolean {
  return FREE_FOR_ALL && FEATURE_IDS.includes(f);
}
