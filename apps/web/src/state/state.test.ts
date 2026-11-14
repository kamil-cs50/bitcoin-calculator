import 'fake-indexeddb/auto';
import { loadDataset, type Dataset } from '@sim/data';
import { validateScenario } from '@sim/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { assetFromPreset, defaultScenario } from './defaults';
import { db } from './db';
import { migrate } from './migrations';
import { ScenarioSchema } from './scenarioSchema';
import { useScenarioStore } from './scenarioStore';

const d: Dataset = loadDataset('2026.11');

beforeEach(async () => {
  await db.scenarios.clear();
  useScenarioStore.getState().resetScenario();
});

describe('defaultScenario', () => {
  it('przechodzi ScenarioSchema i validateScenario (ostrzeżenie EMPTY_PORTFOLIO)', () => {
    const s = defaultScenario(d, new Date('2026-11-14T12:00:00Z'));
    expect(ScenarioSchema.safeParse(s).success).toBe(true);
    expect(s.positions).toEqual([]);
    expect(s.horizonMonths).toBe(240);
    expect(s.market.mode).toBe('realistic');
    expect(s.tax).toEqual({ kind: 'pl' });
    expect(s.datasetVersion).toBe('2026.11');
    expect(s.startYear).toBe(2026);
    expect(s.startMonth).toBe(11);
    const v = validateScenario(s);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.warnings.map((w) => w.code)).toContain('EMPTY_PORTFOLIO');
  });
});

describe('assetFromPreset', () => {
  it('btcBase ma decay i collapse z danych oraz taxForm crypto', () => {
    const a = assetFromPreset(d, 'btcBase');
    expect(a.kind).toBe('risky');
    if (a.kind !== 'risky') return;
    const p = d.crypto.btcBase!;
    expect(a.g).toBe(p.g0.value);
    expect(a.sigma).toBe(p.sigma0.value);
    expect(a.decay).toEqual({
      gInf: p.gInf.value,
      tauG: p.tauG.value,
      sigmaInf: p.sigmaInf.value,
      tauSigma: p.tauSigma.value,
    });
    expect(a.collapse).toEqual({ hazard: p.hazard.value, loss: p.loss.value });
    expect(a.taxForm).toBe('crypto');
  });

  it('mapuje lokatę, EDO i nieznany preset', () => {
    expect(assetFromPreset(d, 'deposit').kind).toBe('deposit');
    expect(assetFromPreset(d, 'edo').kind).toBe('edo');
    expect(assetFromPreset(d, 'gold')).toMatchObject({ kind: 'risky', taxForm: 'physicalGold' });
    expect(() => assetFromPreset(d, 'nieistnieje')).toThrow();
  });
});

describe('store: pozycje', () => {
  it('addPosition dodaje aktywo, kurs USD i spójny rynek; scenariusz przechodzi walidację', () => {
    const st = useScenarioStore.getState();
    st.addPosition({ presetId: 'globalEquity', value: 50_000 });
    st.addPosition({ presetId: 'btcBase', value: 10_000 });
    const s = useScenarioStore.getState().scenario;
    expect(s.positions.map((p) => p.assetId)).toEqual(['globalEquity', 'btcBase']);
    expect(s.positions[0]).toMatchObject({ value: 50_000, costBasis: 50_000, wrapper: 'taxable' });
    expect(s.market.factorIds).toEqual(['globalEquity', 'btcBase', 'fx:USD', 'cpi']);
    expect(s.market.fx.map((f) => f.currency)).toEqual(['USD']);
    expect(ScenarioSchema.safeParse(s).success).toBe(true);
    expect(validateScenario(s).ok).toBe(true);
    // wpisana korelacja BTC-akcje z danych
    const n = s.market.factorIds.length;
    expect(s.market.correlation[0 * n + 1]).toBe(0.35);
    expect(s.market.correlation[1 * n + 0]).toBe(0.35);
  });

  it('updatePosition i removePosition; usunięcie ostatniej pozycji aktywa usuwa aktywo i kurs', () => {
    const st = useScenarioStore.getState();
    st.addPosition({ presetId: 'btcBase', value: 1000 });
    st.updatePosition(0, { value: 2000 });
    expect(useScenarioStore.getState().scenario.positions[0]?.value).toBe(2000);
    st.removePosition(0);
    const s = useScenarioStore.getState().scenario;
    expect(s.positions).toEqual([]);
    expect(s.assets).toEqual([]);
    expect(s.market.factorIds).toEqual(['cpi']);
    expect(s.market.fx).toEqual([]);
  });
});

describe('zapis lokalny (Dexie)', () => {
  it('zapis i odczyt daje równy obiekt', async () => {
    const st = useScenarioStore.getState();
    st.addPosition({ presetId: 'globalEquity', value: 12_345 });
    const before = useScenarioStore.getState().scenario;
    await useScenarioStore.getState().saveNow();
    const row = await db.scenarios.get('current');
    expect(row?.data).toEqual(before);
    useScenarioStore.getState().resetScenario();
    await useScenarioStore.getState().loadSaved();
    expect(useScenarioStore.getState().scenario).toEqual(before);
    expect(useScenarioStore.getState().loadStatus).toBe('ready');
  });

  it('brak zapisu: start od domyślnego scenariusza, status ready', async () => {
    await useScenarioStore.getState().loadSaved();
    const { loadStatus, scenario } = useScenarioStore.getState();
    expect(loadStatus).toBe('ready');
    expect(scenario.positions).toEqual([]);
  });

  it('uszkodzony wpis: status invalid, bez wyjątku, kopia surowych danych, brak nadpisania przez zapis', async () => {
    await db.scenarios.put({ id: 'current', name: 'x', updatedAt: 1, data: { schemaVersion: 1, positions: 'x' } });
    await useScenarioStore.getState().loadSaved();
    const st = useScenarioStore.getState();
    expect(st.loadStatus).toBe('invalid');
    expect(st.loadError).toBeTruthy();
    expect(st.exportRawBackup()).toContain('"positions"');
    await st.saveNow(); // nie może nadpisać uszkodzonego wpisu, dopóki użytkownik nie zdecyduje
    expect((await db.scenarios.get('current'))?.data).toEqual({ schemaVersion: 1, positions: 'x' });
    useScenarioStore.getState().resetScenario(); // „Zacznij od nowa”
    await useScenarioStore.getState().saveNow();
    expect(useScenarioStore.getState().loadStatus).toBe('ready');
    expect(ScenarioSchema.safeParse((await db.scenarios.get('current'))?.data).success).toBe(true);
  });

  it('zapis poprawny kształtem, ale niespójny semantycznie (nieznane aktywo): status invalid, kopia surowa, bez nadpisania', async () => {
    const bad = {
      ...defaultScenario(d),
      positions: [{ assetId: 'nieistnieje', wrapper: 'taxable', value: 1000, costBasis: 1000, targetWeight: 1000 }],
    };
    expect(ScenarioSchema.safeParse(bad).success).toBe(true); // kształt jest poprawny
    await db.scenarios.put({ id: 'current', name: 'x', updatedAt: 1, data: bad });
    await useScenarioStore.getState().loadSaved();
    const st = useScenarioStore.getState();
    expect(st.loadStatus).toBe('invalid');
    expect(st.loadError).toMatch(/nieistnieje/);
    expect(st.scenario.positions).toEqual([]); // nie wpuszczamy tego do aplikacji
    expect(st.exportRawBackup()).toContain('nieistnieje');
    await st.saveNow();
    expect((await db.scenarios.get('current'))?.data).toEqual(bad);
  });

  it('stary zbiór danych: ok, a store ustawia datasetOutdated', async () => {
    const old = { ...defaultScenario(d), datasetVersion: '2025.01' };
    await db.scenarios.put({ id: 'current', name: 'x', updatedAt: 1, data: old });
    await useScenarioStore.getState().loadSaved();
    const st = useScenarioStore.getState();
    expect(st.loadStatus).toBe('ready');
    expect(st.datasetOutdated).toBe(true);
    expect(st.scenario.datasetVersion).toBe('2025.01');
  });

  it('aktualny zbiór danych: datasetOutdated false', async () => {
    await useScenarioStore.getState().saveNow();
    await useScenarioStore.getState().loadSaved();
    expect(useScenarioStore.getState().datasetOutdated).toBe(false);
  });
});

describe('migrate', () => {
  const good = defaultScenario(d);

  it('poprawny scenariusz v1', () => {
    const r = migrate(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scenario).toEqual(good);
  });

  it('schemaVersion 0 i nowszy: unsupported-version', () => {
    expect(migrate({ ...good, schemaVersion: 0 })).toEqual({ ok: false, reason: 'unsupported-version' });
    expect(migrate({ ...good, schemaVersion: 2 })).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it.each([['śmieci'], [null], [undefined], [42], [[]], [{}], [{ schemaVersion: 1, positions: 'x' }]])(
    'niepoprawne wejście %j: ok false, bez wyjątku',
    (raw) => {
      const r = migrate(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    },
  );

  it('NaN w parametrach jest odrzucane', () => {
    const bad = structuredClone(good);
    bad.horizonMonths = Number.NaN;
    expect(migrate(bad).ok).toBe(false);
  });

  it('semantycznie niespójny scenariusz (validateScenario) to ok:false z powodem', () => {
    const bad = { ...good, positions: [{ assetId: 'x', wrapper: 'taxable', value: 1, costBasis: 1, targetWeight: 1 }] };
    const r = migrate(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^invalid-scenario: .*positions\[0\]\.assetId/);
  });

  it('stary datasetVersion nie blokuje migracji', () => {
    expect(migrate({ ...good, datasetVersion: '2025.01' }).ok).toBe(true);
  });
});
