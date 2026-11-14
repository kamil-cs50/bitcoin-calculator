import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Gate } from './Gate';
import { FEATURE_IDS, FREE_FOR_ALL, useEntitlement } from './features';
import * as features from './features';

vi.mock('./features', async (orig) => {
  const actual = await orig<typeof import('./features')>();
  return { ...actual, useEntitlement: vi.fn(actual.useEntitlement) };
});

describe('rejestr uprawnień', () => {
  it('FREE_FOR_ALL = true: każda funkcja jest dostępna', () => {
    expect(FREE_FOR_ALL).toBe(true);
    expect(FEATURE_IDS).toEqual(['compare', 'solver.safeWithdrawal', 'solver.requiredContribution', 'paths.expert', 'export.json']);
    for (const id of FEATURE_IDS) {
      const { result } = renderHook(() => useEntitlement(id));
      expect(result.current).toBe(true);
    }
  });

  it('Gate pokazuje dzieci, gdy funkcja jest dostępna', () => {
    render(
      <Gate feature="compare" fallback={<p>zablokowane</p>}>
        <p>treść</p>
      </Gate>,
    );
    expect(screen.getByText('treść')).toBeInTheDocument();
    expect(screen.queryByText('zablokowane')).not.toBeInTheDocument();
  });

  it('po wyłączeniu flagi Gate renderuje fallback (a bez fallbacku nic)', () => {
    vi.mocked(features.useEntitlement).mockReturnValue(false);
    const { container, rerender } = render(
      <Gate feature="solver.safeWithdrawal" fallback={<p>zablokowane</p>}>
        <p>treść</p>
      </Gate>,
    );
    expect(screen.getByText('zablokowane')).toBeInTheDocument();
    expect(screen.queryByText('treść')).not.toBeInTheDocument();
    rerender(
      <Gate feature="solver.safeWithdrawal">
        <p>treść</p>
      </Gate>,
    );
    expect(container).toBeEmptyDOMElement();
    vi.mocked(features.useEntitlement).mockRestore();
  });
});
