import type { ReactNode } from 'react';
import { useEntitlement, type FeatureId } from './features';

/** Pokazuje dzieci tylko dla uprawnionych; inaczej `fallback` (domyślnie nic). */
export function Gate(p: { feature: FeatureId; children: ReactNode; fallback?: ReactNode }) {
  const ok = useEntitlement(p.feature);
  return <>{ok ? p.children : (p.fallback ?? null)}</>;
}
