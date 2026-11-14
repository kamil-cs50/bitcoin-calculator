import { I18nProvider } from '@lingui/react';
import { assetRiskShares } from '@sim/engine';
import { makeScenario } from '@sim/engine/src/testing/fixtures';
import type { RiskyAssetParams, Scenario } from '@sim/engine';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { syncWorker } from '../../workers/syncWorker';
import { RiskCard } from './RiskCard';
import { SIM_SEED } from './useSimulation';

const wrap = (s: Scenario) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <RiskCard scenario={s} createWorker={syncWorker} />
      </MemoryRouter>
    </I18nProvider>,
  );

const eq = makeScenario().assets[0] as RiskyAssetParams;
function two(btcId = 'btcBase', eqValue = 90_000, btcValue = 10_000): Scenario {
  const other: RiskyAssetParams = { ...eq, id: btcId, sigma: 0.5, g: 0.1 };
  return makeScenario({
    assets: [eq, other],
    positions: [
      { assetId: 'globalEquity', wrapper: 'taxable', value: eqValue, costBasis: eqValue, targetWeight: 0.9 },
      { assetId: btcId, wrapper: 'taxable', value: btcValue, costBasis: btcValue, targetWeight: 0.1 },
    ],
    market: { ...makeScenario().market, factorIds: ['globalEquity', btcId, 'cpi'], correlation: [1, 0, 0.1, 0, 1, 0.1, 0.1, 0.1, 1] },
  });
}

describe('RiskCard', () => {
  it('pokazuje „BTC to 10% wartości i N% ryzyka” z N policzonym przez silnik', async () => {
    const s = two();
    const btc = assetRiskShares(s, { seed: SIM_SEED, paths: 2000 }).find((r) => r.assetId === 'btcBase')!;
    wrap(s);
    const n = Math.round(btc.riskShare * 100);
    expect(await screen.findByText(`BTC to 10% wartości i ${n}% ryzyka`)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Wkład aktywów w ryzyko' })).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
  });

  it('bez BTC zdanie dotyczy aktywa o największym wkładzie w ryzyko', async () => {
    const s = two('emEquity', 50_000, 50_000); // drugie aktywo ma σ 0,5 i dominuje w ryzyku
    wrap(s);
    const text = await screen.findByText(/ wartości i \d+% ryzyka$/);
    expect(text.textContent).toMatch(/^Akcje rynków wschodzących to 50% wartości i 9\d% ryzyka$/);
  });

  it('niewidoczna przy jednym aktywie ryzykownym', async () => {
    const { container } = wrap(makeScenario());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('niewidoczna, gdy drugie aktywo nie ma wartości w portfelu', () => {
    const s = two();
    s.positions[1]!.value = 0;
    const { container } = wrap(s);
    expect(container).toBeEmptyDOMElement();
  });
});
