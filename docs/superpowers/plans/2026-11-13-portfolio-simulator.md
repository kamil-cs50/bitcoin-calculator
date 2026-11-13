# Symulator przyszłej wartości portfela: plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować offline'ową PWA, która symuluje rozkład przyszłej wartości portfela (BTC i inne aktywa) w złotych realnych i nominalnych po polskich podatkach, z silnikiem zweryfikowanym testami statystycznymi.

**Architecture:** Monorepo pnpm z trzema pakietami: `@sim/engine` (czysty TypeScript, symulacja Monte Carlo per ścieżka, bez DOM), `@sim/data` (wersjonowane parametry ze źródłami, schematy Zod, skrypty kalibracyjne) i `@sim/web` (React, obliczenia w puli Web Workerów, zapis lokalny w IndexedDB). Brak backendu; statyczny build wdrażany na Vercel.

**Tech Stack:** TypeScript 5 (strict), pnpm, Vite, React 19, Tailwind CSS v4, Radix UI, Zustand, Zod, Dexie, Comlink, d3-scale, d3-shape, Lingui, vite-plugin-pwa, Vitest, fast-check, Testing Library, Playwright, ESLint, Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-portfolio-simulator-design.md` (normatywny; numery sekcji poniżej odnoszą się do niego). Kontekst i audyt starego kodu: `docs/PLAN.md`.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Brak `any` w `packages/engine`.
- `packages/engine` nie importuje niczego z DOM ani z `@sim/web`; jedyna zależność uruchomieniowa to `@sim/data` (typy).
- Żadnych alokacji w pętli miesięcznej kernela (tablice typowane prealokowane per worker).
- Wszystkie testy losowe mają ustalone ziarno zapisane w teście. Tolerancja: `4·SE` (spec 9).
- Krok miesięczny, log-zwroty, kolejność zdarzeń dokładnie jak w spec 4.1.
- Każdy parametr w `@sim/data` ma `kind`, `verified`, `sources[]` (spec 6.6). Test to wymusza.
- Teksty UI wyłącznie przez Lingui (`t`/`Trans`), język źródłowy polski. Nazwa aplikacji tylko z `apps/web/src/app/appConfig.ts` (`APP_NAME = 'Wachlarz'`).
- Żadnego ruchu sieciowego poza `https://api.nbp.pl` i `https://api.coingecko.com`, i tylko na żądanie użytkownika. Dane portfela nigdy nie opuszczają urządzenia.
- Limit ścieżek: 10 000 (telefon), 25 000 (desktop). Budżet pamięci wyników 64 MB.
- Commity w stylu Conventional Commits, bez identyfikatorów modeli. Gałąź: `claude/pensive-cerf-xu4cnj`.
- Polecenia: test jednego pliku `pnpm --filter <pakiet> exec vitest run <ścieżka>`; całość `pnpm -r test`; typy `pnpm -r typecheck`; lint `pnpm lint`.

## Review Focus

Pięć klas wejść, których spec nie opisuje wprost, a które najpewniej trafią się użytkownikowi. Każda ma test w zadaniu-właścicielu.

1. **Macierz korelacji od użytkownika niedodatnio określona albo z wartościami spoza [−1, 1]:** oczekiwane rzutowanie z ostrzeżeniem albo czytelny błąd walidacji, nigdy NaN w wynikach (zadania 7, 8).
2. **Pusty portfel, same zera albo jedno aktywo z wagą 100%:** wynik pusty z komunikatem albo poprawna symulacja, bez dzielenia przez zero w rebalansie (zadania 8, 20).
3. **Skrajne parametry:** `σ = 0`, `g = −0,99`, `ν = 3`, hazard 1/rok, horyzont 1 miesiąc i 960 miesięcy, wypłaty zaczynające się po horyzoncie (zadania 8, 21).
4. **Zapisany scenariusz ze starszą wersją schematu lub zbioru danych albo uszkodzony wpis w IndexedDB:** migracja albo czytelna propozycja resetu, bez białego ekranu (zadanie 28).
5. **Brak sieci przy pierwszym wpisaniu „0,35 BTC”:** pole ceny ręcznej jest wymagane i wyjaśnione, aplikacja nie czeka na API (zadanie 30).

---

## Mapa plików

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, .prettierrc, vercel.json
.github/workflows/ci.yml
packages/engine/src/
  types.ts            typy scenariusza i wyników (zadanie 8)
  validate.ts         walidacja scenariusza, ostrzeżenia
  rng/xoshiro128ss.ts rng/streams.ts
  math/normalInv.ts   math/gamma.ts  math/scaleTable.ts  math/pmt.ts
  linalg/cholesky.ts  linalg/nearestCorrelation.ts
  models/regime.ts    models/market.ts  models/paramUncertainty.ts
  models/inflation.ts models/fx.ts  models/deposit.ts  models/edo.ts
  portfolio/lots.ts   portfolio/rebalance.ts
  tax/pl/securities.ts tax/pl/crypto.ts tax/taxEngine.ts
  cashflows/contributions.ts cashflows/withdrawals.ts
  kernel.ts runner.ts
  stats/quantiles.ts stats/intervals.ts stats/summary.ts stats/modelCheck.ts
  solvers/bisect.ts solvers/safeWithdrawal.ts solvers/requiredContribution.ts
  index.ts
packages/data/
  src/schema.ts src/load.ts src/index.ts
  datasets/2026.11/{assets,crypto,market,inflation,fx,taxPL,edo,sources}.json
  scripts/{calibrate-inflation,calibrate-fx,calibrate-assets,calibrate-regimes}.ts
apps/web/src/
  app/appConfig.ts app/App.tsx app/routes.tsx
  workers/sim.worker.ts workers/pool.ts
  state/scenarioStore.ts state/db.ts state/migrations.ts
  features/{onboarding,portfolio,plan,results,assumptions,settings}/…
  charts/FanChart.tsx charts/Histogram.tsx
  components/ui/… entitlements/features.ts i18n/…
apps/web/e2e/*.spec.ts
```

Testy leżą obok kodu jako `*.test.ts(x)`.

---

## Faza 0: fundament

### Task 1: Monorepo, narzędzia, CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `packages/engine/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/smoke.test.ts}`
- Create: `packages/data/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`

**Interfaces:**
- Produces: pakiety `@sim/engine`, `@sim/data`; skrypty root `test`, `typecheck`, `lint`, `build`.

- [ ] **Step 1:** Napisz `packages/engine/src/smoke.test.ts`: `expect(ENGINE_VERSION).toBe('0.1.0')` (import z `./index`).
- [ ] **Step 2:** Uruchom `pnpm --filter @sim/engine exec vitest run src/smoke.test.ts`. Oczekiwane: FAIL (brak eksportu).
- [ ] **Step 3:** Utwórz pliki konfiguracyjne (`strict`, `noUncheckedIndexedAccess`, `module: ESNext`, `moduleResolution: Bundler`) i `export const ENGINE_VERSION = '0.1.0'`.
- [ ] **Step 4:** `pnpm -r test && pnpm -r typecheck && pnpm lint`. Oczekiwane: PASS.
- [ ] **Step 5:** CI: job `verify` na `ubuntu-latest`, Node 22, `pnpm install --frozen-lockfile`, potem `lint`, `typecheck`, `test`, `build`. Commit: `chore: scaffold pnpm monorepo with CI`.

### Task 2: Szkielet aplikacji web (PWA, i18n, nazwa)

**Files:**
- Create: `apps/web/{package.json,index.html,vite.config.ts,tsconfig.json,playwright.config.ts}`
- Create: `apps/web/src/{main.tsx,app/App.tsx,app/appConfig.ts,app/App.test.tsx,i18n/index.ts,i18n/locales/pl.po,styles.css}`
- Create: `apps/web/e2e/offline.spec.ts`

**Interfaces:**
- Produces: `appConfig.ts`: `export const APP_NAME = 'Wachlarz'; export const DATASET_VERSION = '2026.11'; export const DISCLAIMER_KEY = 'disclaimer.educational'`.

- [ ] **Step 1:** Test `App.test.tsx`: render `<App/>`, `screen.getByRole('heading', {name: APP_NAME})` oraz tekst „Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej”.
- [ ] **Step 2:** Uruchom test. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj App z Tailwind v4 (`@import "tailwindcss"`), Lingui (`pl` jako źródło), `vite-plugin-pwa` (`registerType: 'prompt'`, precache całego buildu, `manifest.name = APP_NAME`).
- [ ] **Step 4:** E2E `offline.spec.ts`: otwórz stronę z `vite preview`, poczekaj na `navigator.serviceWorker.ready`, `context.setOffline(true)`, przeładuj, nagłówek nadal widoczny. Uruchom `pnpm --filter @sim/web exec playwright test --trace off`. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add PWA shell with i18n and app config`.

---

## Faza 1: dane

### Task 3: Schematy danych i loader

**Files:**
- Create: `packages/data/src/schema.ts`, `packages/data/src/load.ts`, `packages/data/src/schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SourceSchema: z.ZodType<Source>;   // {title, publisher, year, url, accessed: 'YYYY-MM-DD'}
  export const ParamSchema: z.ZodType<Param>;     // {value:number, range?:[number,number], kind:'data'|'forecast'|'assumption', verified:'yes'|'secondary'|'no', sources:Source[], note:string}
  export type Dataset = { version: string; assets: Record<string, AssetPreset>; crypto: Record<string, CryptoPreset>; market: MarketPreset; inflation: InflationPreset; fx: Record<'USD'|'EUR', FxPreset>; edo: EdoPreset; taxPL: TaxPreset };
  export function loadDataset(version: '2026.11'): Dataset;
  ```
  Każde pole liczbowe presetów jest typu `Param`.

- [ ] **Step 1:** Testy: `ParamSchema.parse({value:1, kind:'data', verified:'yes', sources:[], note:''})` rzuca błąd (pusta lista źródeł przy `kind !== 'assumption'`); to samo z `kind:'assumption'` przechodzi; `accessed: '13.11.2026'` rzuca błąd.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj schematy z `superRefine` dla reguły źródeł.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(data): add parameter metadata schemas`.

### Task 4: Zbiór danych `2026.11`

**Files:**
- Create: `packages/data/datasets/2026.11/{assets,crypto,market,inflation,fx,edo,taxPL,sources}.json`
- Create: `packages/data/src/dataset.test.ts`

**Interfaces:**
- Consumes: `loadDataset`, schematy z zadania 3.
- Produces: wartości dokładnie z tabel spec 6.1–6.4, ze statusem `verified` przepisanym ze spec (✅ `yes`, ◐ `secondary`, ❌ `no`).

- [ ] **Step 1:** Testy:
  ```ts
  const d = loadDataset('2026.11');
  expect(d.assets.globalEquity.g.value).toBe(0.065);
  expect(d.assets.globalEquity.g.range).toEqual([0.059, 0.075]);
  expect(d.crypto.btcBase.g0.value).toBe(0.15);
  expect(d.crypto.btcBase.hazard.value).toBe(0.01);
  expect(d.edo.firstYearRate.value).toBe(0.0535);
  expect(d.edo.margin.value).toBe(0.02);
  expect(d.edo.earlyFeePer100.value).toBe(3);
  expect(d.inflation.x0.value).toBe(0.035);
  expect(d.taxPL.ikeLimit2026.value).toBe(28260);
  expect(d.market.regime.p01.verified).toBe('no');
  // każdy Param w całym zbiorze przechodzi ParamSchema (przejście rekurencyjne)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL (brak plików).
- [ ] **Step 3:** Wpisz JSON-y wg spec 6.2 (wszystkie wiersze), 6.3 (cztery presety), 6.4, parametry reżimów i ν ze spec 4.3–4.4, `fx` (σ 0,11 i 0,07, półokres 4, inflacja zagraniczna 0,025 i 0,02), lokata (`k = 0,15`, `spread = −0,005`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(data): add dataset 2026.11 with sources`.

---

## Faza 2: silnik, rdzeń

### Task 5: Generator xoshiro128** i strumienie

**Files:**
- Create: `packages/engine/src/rng/xoshiro128ss.ts`, `packages/engine/src/rng/streams.ts`, `packages/engine/src/rng/rng.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class Xoshiro128ss {
    static fromState(a: number, b: number, c: number, d: number): Xoshiro128ss;
    static fromSeed(seed: number): Xoshiro128ss;      // 4 słowa ze SplitMix32
    reseed(seed: number): void;                        // bez alokacji
    nextU32(): number;                                 // 0..2^32-1
    nextUniform(): number;                             // (x + 0.5) / 2^32
  }
  export function fmix32(h: number): number;
  export function factorKey(id: string): number;      // FNV-1a 32-bit
  export function streamSeed(seed: number, path: number, key: number): number; // spec 4.2
  ```

- [ ] **Step 1:** Testy:
  ```ts
  const g = Xoshiro128ss.fromState(1, 2, 3, 4);
  expect([g.nextU32(), g.nextU32(), g.nextU32()]).toEqual([11520, 0, 5927040]);
  // jednostajna: n = 1e6, 100 przedziałów, statystyka chi2 < 161.3 (p > 1e-4, 99 st. swobody)
  // 0 < u < 1 dla 1e6 losowań
  // streamSeed(1, 0, k) !== streamSeed(1, 1, k) !== streamSeed(2, 0, k)
  // korelacja próbek z dwóch strumieni (n = 1e5): |r| < 4 / Math.sqrt(1e5)
  // fromSeed(7) dwa razy daje identyczne 1000 liczb
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj (`Math.imul`, `>>> 0`; wynik `rotl(s1 * 5, 7) * 9`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add xoshiro128** with per-path factor streams`.

### Task 6: Odwrotna dystrybuanta normalna, kwantyle χ², tabela skali

**Files:**
- Create: `packages/engine/src/math/normalInv.ts`, `math/gamma.ts`, `math/scaleTable.ts`, `math/math.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalInv(u: number): number;                  // AS 241 PPND16, u w (0,1)
  export function gammaP(a: number, x: number): number;          // regularyzowana niepełna gamma
  export function chi2Quantile(p: number, nu: number): number;   // bisekcja na gammaP(nu/2, x/2)
  export function buildScaleTable(nu: number, K?: number): Float64Array; // spec 4.3; nu = Infinity → same 1
  export function meanExpHalfVar(sigmaM: number, table: Float64Array): number; // (1/K) Σ exp(σ² s²/2)
  ```

- [ ] **Step 1:** Testy:
  ```ts
  expect(normalInv(0.5)).toBe(0);
  expect(normalInv(0.975)).toBeCloseTo(1.959963984540054, 12);
  expect(normalInv(0.001)).toBeCloseTo(-3.090232306167813, 12);
  expect(chi2Quantile(0.5, 5)).toBeCloseTo(4.351460, 5);
  expect(chi2Quantile(0.95, 5)).toBeCloseTo(11.070498, 5);
  expect(chi2Quantile(0.05, 5)).toBeCloseTo(1.145476, 5);
  const s = buildScaleTable(5);                 // K = 1024
  expect(mean(s.map(v => v * v))).toBeCloseTo(1, 12);
  expect(Math.max(...s)).toBeGreaterThan(4); expect(Math.max(...s)).toBeLessThan(8);
  expect(() => buildScaleTable(2.5)).toThrow();  // nu >= 3
  // normalna z generatora: n = 1e6, średnia, wariancja, skośność, kurtoza w 4 SE
  //   (SE: 1/√n, √(2/n), √(6/n), √(24/n)); KS względem Φ: D < 2.23/√n (p ≈ 1e-4)
  // meanExpHalfVar(0.05, buildScaleTable(Infinity)) ≈ exp(0.00125)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj. `gammaP`: szereg dla `x < a + 1`, ułamek łańcuchowy Lentza w przeciwnym razie, `lnGamma` Lanczosa. Tabela: `s_k = sqrt((nu−2)/chi2Quantile((k+0.5)/K, nu))`, potem podziel przez `sqrt(mean(s²))`.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add normal inverse CDF and bounded scale-mixture table`.

### Task 7: Cholesky i najbliższa macierz korelacji

**Files:**
- Create: `packages/engine/src/linalg/cholesky.ts`, `linalg/nearestCorrelation.ts`, `linalg/linalg.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class NotPositiveDefiniteError extends Error {}
  export function cholesky(a: Float64Array, n: number): Float64Array;        // dolna trójkątna, wierszami
  export function nearestCorrelation(a: Float64Array, n: number, opts?: { tol?: number; maxIter?: number }): { matrix: Float64Array; changed: boolean; iterations: number };
  ```

- [ ] **Step 1:** Testy:
  ```ts
  // L·Lᵀ = A dla losowej macierzy korelacji 6×6 (błąd < 1e-12)
  expect(() => cholesky(Float64Array.of(1, 2, 2, 1), 2)).toThrow(NotPositiveDefiniteError);
  // przykład Highama (2002): [[1,1,0],[1,1,1],[0,1,1]]
  const r = nearestCorrelation(Float64Array.of(1,1,0, 1,1,1, 0,1,1), 3);
  expect(r.changed).toBe(true);
  expect(r.matrix[1]).toBeCloseTo(0.7607, 3); expect(r.matrix[2]).toBeCloseTo(0.1573, 3);
  // wynik ma jedynki na przekątnej i przechodzi cholesky po dodaniu 1e-10 do przekątnej
  // macierz już poprawna: changed === false, wynik identyczny z wejściem
  // (Review Focus 1) wejście z elementem 1.3 poza przekątną: wynik w [−1, 1], brak NaN
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj rzuty naprzemienne Highama z korektą Dykstry; rozkład własny metodą Jacobiego (n ≤ 20). Domyślnie `tol = 1e-8`, `maxIter = 200`; wynik z wartościami własnymi przyciętymi do `≥ 1e-8`.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add cholesky and Higham nearest correlation`.

### Task 8: Typy scenariusza i walidacja

**Files:**
- Create: `packages/engine/src/types.ts`, `packages/engine/src/validate.ts`, `packages/engine/src/validate.test.ts`

**Interfaces:**
- Produces (`types.ts`, komplet używany przez wszystkie dalsze zadania):
  ```ts
  export type Currency = 'PLN' | 'USD' | 'EUR';
  export type Wrapper = 'taxable' | 'IKE' | 'IKZE';
  export type TaxForm = 'security' | 'crypto' | 'physicalGold' | 'none';
  export interface DecayParams { gInf: number; tauG: number; sigmaInf: number; tauSigma: number }   // tau w latach
  export interface CollapseParams { hazard: number; loss: number }                                     // na rok; 0..1
  export interface RiskyAssetParams { kind: 'risky'; id: string; currency: Currency; g: number; sigma: number; se: number; alpha: number; b: number; ter: number; costBps: number; taxForm: TaxForm; decay?: DecayParams; collapse?: CollapseParams }
  export interface DepositParams { kind: 'deposit'; id: string; k: number; spread: number; initialRate: number }
  export interface EdoParams { kind: 'edo'; id: string; firstYearRate: number; margin: number; earlyFeePer100: number; onMaturity: 'roll' | 'cash' }
  export type AssetParams = RiskyAssetParams | DepositParams | EdoParams;
  export interface Position { assetId: string; wrapper: Wrapper; value: number; costBasis: number; targetWeight: number } // wartości w walucie bazowej
  export interface RegimeParams { p01: number; p10: number; kappa1: number; delta: number }           // kappa0 = 1
  export interface InflationParams { x0: number; mean: number; meanSe: number; phi: number; sigmaEta: number; cpiHistory: number[] } // 13 poziomów, ostatni = teraz
  export interface FxParams { currency: 'USD' | 'EUR'; sigma: number; halfLifeYears: number; alpha: number; foreignInflation: number }
  export interface MarketModel { mode: 'realistic' | 'gbm'; nu: number; regime: RegimeParams; factorIds: string[]; correlation: number[]; inflation: InflationParams; fx: FxParams[]; uncertaintyScale: number }
  // factorIds: id aktywów ryzykownych, potem 'fx:USD', 'fx:EUR' (jeśli używane), na końcu 'cpi'; correlation wierszami
  export interface Contribution { monthly: number; endMonth: number; indexation: 'none' | 'cpi' | 'cpiPlus'; realGrowth: number }
  export type Withdrawal = { kind: 'fixedReal'; startMonth: number; monthly: number } | { kind: 'percent'; startMonth: number; rate: number } | { kind: 'abw'; startMonth: number; expectedRealReturn: number; floor?: number; cap?: number };
  export interface OneOff { month: number; amount: number; real: boolean }                              // + wpływ, − wydatek
  export type RebalancePolicy = { kind: 'none' } | { kind: 'annual' } | { kind: 'band'; bandPp: number } | { kind: 'flows' };
  export type TaxMode = { kind: 'pl' } | { kind: 'none' } | { kind: 'flat'; rate: number };
  export interface Scenario { schemaVersion: 1; datasetVersion: string; baseCurrency: Currency; startYear: number; startMonth: number; horizonMonths: number; assets: AssetParams[]; positions: Position[]; market: MarketModel; contribution?: Contribution; withdrawal?: Withdrawal; events: OneOff[]; rebalance: RebalancePolicy; tax: TaxMode; goal?: { amountReal: number; month: number } }
  export interface Warning { code: 'CORR_PROJECTED' | 'LOSS_OVER_5M' | 'ALPHA_CLAMPED' | 'EMPTY_PORTFOLIO'; message: string; data?: unknown }
  export interface RunOptions { seed: number; paths: number; pathOffset?: number }
  export interface RunResult { paths: number; grid: Int32Array; wealth: Float32Array; wealthAfterTax: Float32Array; cpi: Float32Array; ruinMonth: Int32Array; maxDrawdown: Float32Array; worst12m: Float32Array; twrLog: Float32Array; collapsed: Uint8Array; meanShare: Float64Array; warnings: Warning[] }
  // wealth, wealthAfterTax, cpi: [path * grid.length + j], nominalnie w walucie bazowej; ruinMonth = -1 gdy brak
  // collapsed: [path * liczbaAktywów + i]; meanShare: [rok * liczbaAktywów + i]
  ```
  `validate.ts`: `export function validateScenario(s: Scenario): { ok: true; warnings: Warning[] } | { ok: false; errors: { path: string; message: string }[] }`.

- [ ] **Step 1:** Testy (Review Focus 1–3):
  ```ts
  // poprawny scenariusz wzorcowy (helper makeScenario() w src/testing/fixtures.ts) → ok: true
  // horizonMonths 0 lub 961 → błąd 'horizonMonths'
  // nu = 2.9 → błąd 'market.nu'; sigma < 0, g <= -1, hazard < 0, loss > 1 → błędy z właściwą ścieżką
  // długość correlation !== factorIds.length² albo element |ρ| > 1 → błąd 'market.correlation'
  // suma targetWeight pozycji płynnych === 0 → ok: true z ostrzeżeniem 'EMPTY_PORTFOLIO'
  // withdrawal.startMonth > horizonMonths → ok: true (wypłaty po prostu nie wystąpią)
  // pozycja odwołuje się do nieistniejącego assetId → błąd 'positions[0].assetId'
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj typy, walidację i `src/testing/fixtures.ts` (`makeScenario(overrides)`: jedno aktywo `globalEquity` 100 000 PLN w PLN, 120 miesięcy, tryb `gbm`, podatki `none`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add scenario types and validation`.

### Task 9: Kalibracja reżimów

**Files:**
- Create: `packages/engine/src/models/regime.ts`, `models/regime.test.ts`

**Interfaces:**
- Consumes: `RegimeParams`, `nearestCorrelation`, `Warning`.
- Produces:
  ```ts
  export interface RegimeConstants { pi0: number; pi1: number; lambda: number; A: number; vDelta: number; delta0: number; delta1: number }
  export function regimeConstants(r: RegimeParams): RegimeConstants;            // gbm: p01 = 0 → pi1 = 0, vDelta = 0
  export function omega(alpha: number, c: RegimeConstants): number;             // α² V_δ A
  export function sigmaMonthlyFactor(alpha: number, b: number, r: RegimeParams, c: RegimeConstants): number; // σ_m / σ
  export function inRegimeCorrelation(rho: Float64Array, n: number, alpha: number[], b: number[], r: RegimeParams): { matrix: Float64Array; warnings: Warning[] };
  export function clampAlpha(alpha: number, c: RegimeConstants): { alpha: number; clamped: boolean };       // wymusza ω ≤ 0.8
  ```

- [ ] **Step 1:** Testy (wartości kontrolne ze spec 4.4):
  ```ts
  const r = { p01: 0.04, p10: 0.20, kappa1: 2.2, delta: 0.175 };
  const c = regimeConstants(r);
  expect(c.pi1).toBeCloseTo(1 / 6, 12); expect(c.lambda).toBeCloseTo(0.76, 12);
  expect(c.A).toBeCloseTo(62.5910, 4); expect(c.vDelta).toBeCloseTo(0.0042535, 7);
  expect(c.pi0 * c.delta0 + c.pi1 * c.delta1).toBeCloseTo(0, 15);
  expect(omega(1, c)).toBeCloseTo(0.2662, 4);
  expect(sigmaMonthlyFactor(1, 1, r, c) * 0.16).toBeCloseTo(0.030895, 6);
  expect(sigmaMonthlyFactor(0, 0, r, c)).toBeCloseTo(1 / Math.sqrt(12), 12);
  const m = inRegimeCorrelation(Float64Array.of(1, 0.8, 0.8, 1), 2, [1, 1], [1, 1], r).matrix;
  expect(m[1]).toBeCloseTo(0.72744, 4); expect(m[0]).toBeCloseTo(1, 12);
  // ρ = −0.9 przy α = [1, 1] → R̃ poza [−1,1] → ostrzeżenie CORR_PROJECTED, macierz poprawna
  expect(clampAlpha(3, c).clamped).toBe(true); expect(omega(clampAlpha(3, c).alpha, c)).toBeCloseTo(0.8, 10);
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj wzory ze spec 4.4 (`κ_{s,i} = 1 + b_i(κ_s − 1)`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add exact annual-moment calibration for regime model`.

### Task 10: Symulator rynku (reżim, szoki, dryf z zanikiem, upadek)

**Files:**
- Create: `packages/engine/src/models/market.ts`, `models/market.test.ts`

**Interfaces:**
- Consumes: zadania 5–9; `InflationProcess`, `FxProcess` z zadań 12–13 są wstrzykiwane (w tym zadaniu wersje-zaślepki o stałych wartościach w `src/testing/`).
- Produces:
  ```ts
  export interface MarketState { assetLogRet: Float64Array; fxLog: Float64Array; cpiLog: number; x: number; yy: number; regime: 0 | 1; collapsed: Uint8Array }
  export class MarketSimulator {
    constructor(s: Scenario);                     // prekalkulacja: stałe reżimu, σ_m/σ, Cholesky R̃, tabela skali
    readonly warnings: Warning[];
    readonly riskyIds: string[];
    initPath(seed: number, path: number): void;   // reseed strumieni, losuje reżim startowy ze stacjonarnego i przesunięcia dryfu
    step(t: number, out: MarketState): void;      // miesiąc t → t+1
    gAt(assetIndex: number, t: number): number;   // g(t) z zanikiem
    sigmaAt(assetIndex: number, t: number): number;
  }
  ```
  Kolejność losowań w `step`: reżim (strumień `regime`), skala (strumień `tail`), po jednym `z` z każdego strumienia czynnika, upadek (strumień `collapse:<id>`).

- [ ] **Step 1:** Testy (ziarno 20261113):
  ```ts
  // gbm, jedno aktywo g = 0.065, σ = 0.16: 20 000 ścieżek × 120 mies.; suma log-zwrotów ścieżki:
  //   średnia = 10·ln(1.065) w 4 SE, wariancja = 10·0.0256 w 4 SE (SE wariancji = var·√(2/(n−1)))
  // realistic, to samo aktywo α = 1, b = 1: udział miesięcy z regime === 1 równy 1/6 w 4 SE (SE z średnich per ścieżka)
  // gAt/sigmaAt dla presetu btcBase: gAt(0) = 0.15, gAt(84) = 0.055 + 0.095·e^{-1}, sigmaAt(96) = 0.30 + 0.20·e^{-1}
  // upadek: hazard 0.01, 20 000 ścieżek × 360 mies.: częstość collapsed = 1 − e^{−0.3} w 4 SE;
  //   po upadku log-zwrot w miesiącu upadku zawiera ln(0.05), a dryf w kolejnych miesiącach = 0
  // determinizm: initPath(seed, 5) po initPath(seed, 9) daje te same wyniki co bez wcześniejszych ścieżek
  // dodanie drugiego aktywa nieskorelowanego (ρ = 0) nie zmienia assetLogRet[0] na żadnej z 100 ścieżek (gbm)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj wzór ze spec 4.4: `r = μ(t) + Δμ/12 + α σ(t) δ_s + σ(t)·f_i·κ_{s,i}·s_t·(L z)_i`, gdzie `f_i = sigmaMonthlyFactor`. W trybie `gbm`: `p01 = 0`, tabela skali z samych 1. Prawdopodobieństwo upadku w miesiącu: `1 − exp(−h/12)`.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add market simulator with regimes, tails, decay and collapse`.

### Task 11: Niepewność parametrów

**Files:**
- Create: `packages/engine/src/models/paramUncertainty.ts`, `models/paramUncertainty.test.ts`
- Modify: `packages/engine/src/models/market.ts` (wywołanie w `initPath`)

**Interfaces:**
- Produces: `export function drawDriftShifts(z: Float64Array, se: Float64Array, cholRho: Float64Array, n: number, scale: number, out: Float64Array): void` (roczne przesunięcia log-dryfu; `cholRho` z wpisanej macierzy korelacji aktywów). Średnia inflacji: `mean + meanSe·scale·z_cpi` z tego samego strumienia `paramUnc`.

- [ ] **Step 1:** Testy:
  ```ts
  // n = 2, se = [0.02, 0.03], ρ = 0.7, scale = 1, 100 000 losowań: sd w 4 SE, korelacja 0.7 w 4 SE
  // scale = 0 → same zera
  // (T3) gbm, g = 0.065, σ = 0.16, se = 0.02, 20 000 ścieżek × 360 mies.: mediana W_T/W_0 = 1.065^30
  //   w nieparametrycznym 99.99% przedziale ufności mediany; średnia ln(W_T/W_0) = 30·ln(1.065) w 4 SE;
  //   wariancja ln(W_T/W_0) = 30·0.0256 + 900·0.0004 w 4 SE
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj (`out_i = scale · se_i · (L z)_i`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add correlated parameter uncertainty`.

### Task 12: Inflacja

**Files:**
- Create: `packages/engine/src/models/inflation.ts`, `models/inflation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function gSum(phi: number): number;                                         // G(φ)
  export function rho12(phi: number): number;
  export function calibrateInflation(sdYy: number, rho12Target: number): { phi: number; sigmaEta: number };
  export class InflationProcess {
    constructor(p: InflationParams);
    init(meanForPath: number): void;             // x = x0, bufor 13 poziomów z cpiHistory
    step(shock: number): void;                   // shock = s_t·(L z)_cpi
    readonly x: number; readonly cpiLog: number; // cpiLog względem poziomu startowego (0 na starcie)
    yy(lagMonths?: number): number;              // CPI_{t−lag}/CPI_{t−lag−12} − 1
  }
  ```

- [ ] **Step 1:** Testy:
  ```ts
  expect(gSum(0)).toBe(12);
  const c = calibrateInflation(0.02, 0.4);
  expect(c.phi).toBeCloseTo(0.87709, 4); expect(gSum(c.phi)).toBeCloseTo(91.214, 2);
  expect(c.sigmaEta).toBeCloseTo(0.01207, 5);
  expect(() => calibrateInflation(0.02, 1.2)).toThrow();
  // symulacja: 2 000 ścieżek × 600 mies. (pierwsze 120 odrzucone), szoki N(0,1):
  //   sd ln(1+yy) = 0.02 i autokorelacja lag 12 = 0.4, obie w 4 SE (SE z rozrzutu statystyki między ścieżkami)
  //   średnia x = mean w 4 SE
  // start: cpiHistory z 13 poziomów o stałym wzroście 3.5% r/r → yy() ≈ 0.035 (±1e-12) przed pierwszym krokiem
  // yy(2) po 5 krokach używa poziomów sprzed 2 miesięcy (sprawdzenie na ręcznie podanych szokach = 0)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj wzory ze spec 4.6; bisekcja `rho12` na (0, 0,9999), 80 iteracji; bufor pierścieniowy 25 poziomów.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add inflation process with year-over-year calibration`.

### Task 13: Kursy walut

**Files:**
- Create: `packages/engine/src/models/fx.ts`, `models/fx.test.ts`
- Modify: `packages/engine/src/models/market.ts` (podmiana zaślepek na `InflationProcess` i `FxProcess`)

**Interfaces:**
- Produces:
  ```ts
  export function fxPhi(halfLifeYears: number): number;        // 2^(−1/(12H))
  export class FxProcess {
    constructor(p: FxParams, sigmaMonthly: number);
    init(): void;                                               // q = 0
    step(shock: number, regimeShift: number, cpiLogDomestic: number, t: number): void;
    readonly q: number; readonly logRate: number;               // ln(S_t / S_0)
  }
  export function effectiveVol(sigmaAsset: number, sigmaFx: number, rho: number): number;
  ```

- [ ] **Step 1:** Testy:
  ```ts
  expect(fxPhi(4)).toBeCloseTo(0.985663, 6);
  expect(effectiveVol(0.16, 0.11, -0.3)).toBeCloseTo(Math.sqrt(0.0256 + 0.0121 - 2 * 0.3 * 0.16 * 0.11), 12);
  // 2 000 ścieżek × 1200 mies., szoki N(0,1), σ_m = 0.11/√12, bez reżimu:
  //   wariancja stacjonarna q = σ_m²/(1 − φ²) w 4 SE; autokorelacja lag 48 = 0.5 w 4 SE
  // zerowe szoki: logRate po t miesiącach = cpiLogDomestic − foreignInflation·t/12 (dokładnie)
  // (T3) tryb gbm, aktywo w USD σ = 0.16, fx σ = 0.11, ρ = −0.3, krótki horyzont 12 mies., 50 000 ścieżek:
  //   sd rocznego log-zwrotu w PLN = effectiveVol(0.16, σ_fx12, ρ12) w 4 SE, gdzie σ_fx12 i ρ12 to odchylenie
  //   q_12 − q_0 i jego korelacja z rocznym zwrotem aktywa, wyliczone w teście analitycznie z φ_q i σ_m
  //   (Var(q_12) = σ_m²·(1 − φ_q^24)/(1 − φ_q²), Cov = ρ·σ_a,m·σ_m·(1 − φ_q^12)/(1 − φ_q))
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj spec 4.7. Zwrot aktywa w walucie bazowej: `r_local + Δ logRate`.
- [ ] **Step 4:** Uruchom całość `pnpm --filter @sim/engine test`. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add mean-reverting real exchange rate`.

### Task 14: Skrypty kalibracyjne

**Files:**
- Create: `packages/data/scripts/{calibrate-inflation,calibrate-fx,calibrate-assets,calibrate-regimes}.ts`, `packages/data/scripts/lib/{stats.ts,stats.test.ts,fetch.ts}`, `packages/data/CHANGELOG.md`, `docs/DATA_SOURCES.md`

**Interfaces:**
- Consumes: `calibrateInflation`, `fxPhi`.
- Produces: `lib/stats.ts`: `logReturns(levels)`, `annualizedVol(monthlyLogRet)`, `autocorr(x, lag)`, `ledoitWolfShrink(returns: number[][]): number[][]`, `fitTwoRegime(monthly: number[]): RegimeParams & { nu: number; logLik: number }` (EM z filtrem Hamiltona). Skrypty wypisują proponowane wartości jako JSON na stdout; **nie** nadpisują zbioru danych.

- [ ] **Step 1:** Testy `stats.test.ts`: `annualizedVol` stałego szeregu = 0; `autocorr` szeregu AR(1) φ = 0,8 (n = 20 000, ziarno) = 0,8 ± 0,03; `ledoitWolfShrink` dla danych o prawdziwej korelacji 0,5 zwraca macierz dodatnio określoną z elementem w (0,3; 0,7); `fitTwoRegime` na 6 000 obserwacjach wygenerowanych z `p01 = 0,04, p10 = 0,2, κ1 = 2,2` odzyskuje `p01` w ±0,015 i `p10` w ±0,06.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj bibliotekę i skrypty. Źródła surowych danych tylko zgodne ze spec 6.5: GUS (CPI, 13 ostatnich poziomów i szereg od 2000 r.), NBP API (tabele A, okna po 93 dni), FRED (serie bez oznaczenia „Copyright”), pliki podane ręcznie przez użytkownika dla indeksów akcji (`--input ścieżka.csv`). CoinGecko nie jest używany do kalibracji.
- [ ] **Step 4:** Uruchom testy (PASS), potem `pnpm --filter @sim/data exec tsx scripts/calibrate-inflation.ts` i `calibrate-fx.ts`. Zapisz wynik i datę w `docs/DATA_SOURCES.md` jako **propozycję** obok wartości bieżących. Zmiana wartości w `datasets/2026.11` wymaga akceptacji użytkownika (kryterium fazy 1); do tego czasu pola zostają z `verified: 'no'`.
- [ ] **Step 5:** Commit: `feat(data): add calibration scripts and data source log`.

---

## Faza 3: przepływy, podatki, kernel

### Task 15: Partie zakupu (FIFO)

**Files:**
- Create: `packages/engine/src/portfolio/lots.ts`, `portfolio/lots.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class LotQueue {
    constructor(capacity: number);                    // bufor pierścieniowy, capacity = horizonMonths + 8
    reset(): void;
    buy(units: number, cost: number, month: number): void;      // cost = koszt łączny partii
    sell(units: number): number;                                // zwraca koszt FIFO sprzedanych jednostek
    readonly units: number; readonly basis: number;
    oldestMonth(): number;                                      // −1 gdy pusto
  }
  ```

- [ ] **Step 1:** Testy: zakupy (10 szt., 1000), (10, 1200), (10, 1500); `sell(15)` zwraca 1600, `units === 15`, `basis === 2100`; `sell(15)` zwraca 2100; `sell(1)` na pustej kolejce rzuca błąd; sprzedaż ułamkowa 0,5 szt. z partii 1 szt. o koszcie 100 zwraca 50; przepełnienie `capacity` rzuca błąd; po `reset()` `units === 0`.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj na trzech `Float64Array`.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add FIFO lot queue`.

### Task 16: Podatek od papierów wartościowych i straty (PL)

**Files:**
- Create: `packages/engine/src/tax/pl/securities.ts`, `tax/pl/securities.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class SecuritiesTaxPL {
    reset(): void;
    onSale(proceeds: number, cost: number): void;      // w bieżącym roku
    closeYear(year: number): { tax: number; warnings: Warning[] };   // 19% od dochodu po stratach; rejestruje stratę
    lossesAvailable(year: number): number;
    latentTax(unrealizedGain: number, year: number): number;         // 19%·max(0, zysk − dostępne straty)
  }
  export const PL_CAPITAL_GAINS_RATE = 0.19;
  ```

- [ ] **Step 1:** Testy (spec T5):
  ```ts
  // 2027: onSale(3000, 1600) → closeYear(2027).tax === 266
  // strata: 2027 onSale(0 zysku: proceeds 1000, cost 2000) → tax 0, lossesAvailable(2028) === 1000
  //   2028, 2029: brak sprzedaży; 2030: zysk 400 → tax 0, zostaje 600; 2031: nic;
  //   2032: zysk 300 → tax 0, zostaje 300; 2033: zysk 500 → tax 95 (strata z 2027 wygasła)
  // dwie straty: najstarsza zużywana pierwsza
  // strata 6 000 000 → ostrzeżenie LOSS_OVER_5M
  // latentTax(1000, 2028) przy dostępnej stracie 400 === 114
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj (spec 4.10, [Z-16]): tablica strat `[rok, kwota]` o długości 5.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add Polish securities tax with loss carry-forward`.

### Task 17: Koszyk kryptowalut (PL) i silnik podatkowy

**Files:**
- Create: `packages/engine/src/tax/pl/crypto.ts`, `tax/taxEngine.ts`, `tax/tax.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class CryptoTaxPL { reset(): void; onBuy(cost: number): void; onSale(proceeds: number): void; closeYear(): number; readonly carry: number; latentTax(marketValue: number): number }
  export interface TaxEngine {
    reset(): void;
    onBuy(form: TaxForm, wrapper: Wrapper, cost: number, month: number): void;
    onSale(form: TaxForm, wrapper: Wrapper, proceeds: number, costFifo: number, month: number, holdingMonths: number): void;
    closeYear(year: number): number;                 // podatek do zapłaty w kwietniu roku year+1
    latentTax(positions: { form: TaxForm; wrapper: Wrapper; value: number; basis: number }[], year: number): number;
    readonly warnings: Warning[];
  }
  export function createTaxEngine(mode: TaxMode): TaxEngine;
  ```
  Reguły routingu: `wrapper !== 'taxable'` → brak podatku; `crypto` → `CryptoTaxPL`; `security` → `SecuritiesTaxPL`; `physicalGold` → brak podatku, gdy `holdingMonths >= 7`, inaczej jak `security`; tryb `flat` → `rate·max(0, proceeds − costFifo)` płatne w kwietniu; tryb `none` → 0.

- [ ] **Step 1:** Testy (spec T5):
  ```ts
  // krypto: 2027 onBuy(10000), brak sprzedaży → closeYear() === 0, carry === 10000
  //         2028 onSale(4000), onBuy(1000) → 0, carry === 7000
  //         2029 onSale(20000) → 2470, carry === 0
  // krypto latentTax(30000) przy carry 7000 === 4370
  // routing: sprzedaż w IKE z zyskiem → closeYear === 0
  // physicalGold: holdingMonths 7 → 0; holdingMonths 3 → 19% zysku
  // strata z krypto nie obniża podatku od papierów w tym samym roku
  // flat 0.15: zysk 1000 → 150
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj (spec 4.10, [Z-17], [Z-18]).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add crypto cost pool and tax engine routing`.

### Task 18: Lokata i obligacje EDO

**Files:**
- Create: `packages/engine/src/models/deposit.ts`, `models/edo.ts`, `models/fixedIncome.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class DepositAccount { constructor(p: DepositParams); reset(balance: number): void; accrue(x: number, taxRate: number): number /* odsetki netto dopisane */; deposit(a: number): void; withdraw(a: number): number; readonly balance: number; readonly rate: number }
  export class EdoHoldings {
    constructor(p: EdoParams, capacity: number);
    reset(): void;
    buy(nominal: number, month: number, firstYearRate: number): void;
    onMonth(month: number, yyLag2: number, x: number, taxRate: number): number;   // kapitalizuje rocznice; zwraca gotówkę netto z wykupów po 120 mies. (0 gdy onMaturity === 'roll', wtedy kupuje nową serię z rate = max(0, x) + margin)
    redeemEarly(amountNet: number, month: number, taxRate: number): number;       // najstarsze partie; zwraca gotówkę netto faktycznie uzyskaną
    value(month: number): number;                                                 // nominał + narosłe odsetki (brutto)
    netValue(month: number, taxRate: number): number;                             // po opłacie i podatku przy wykupie dziś
  }
  ```

- [ ] **Step 1:** Testy (spec T5):
  ```ts
  // lokata: saldo 10 000, stopa 6% → accrue zwraca 40.50 (50 − 9.50); stopa: d ← max(0, d + k(x + s − d))
  // EDO 10 000 zł (100 obligacji), rok 1 5.35%, marża 2%, yy = 3% stale:
  //   value po 120 mies. = 10000·1.0535·1.05^9 = 16343.24 (±0.01); gotówka netto przy 'cash' = 15138.03 (±0.01)
  // przedterminowo po 18 mies.: wartość 10798.375, opłata 300, podstawa 498.375, podatek 94.69 → 10403.68 (±0.01)
  // przedterminowo po 1 mies.: odsetki 44.58 < 300 → opłata 44.58, wypłata 10000.00
  // yy = −1% → oprocentowanie roku = 0% + marża
  // 'roll': po 120 mies. powstaje nowa partia o nominale równym kwocie netto, onMonth zwraca 0
  // redeemEarly(5000) z dwóch partii po 10 000: narusza tylko starszą
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj spec 4.8. Uwaga do kodu: reguła „opłata nie więcej niż narosłe odsetki” i pomniejszenie podstawy podatku o opłatę są oznaczone w spec 6.4 jako niepotwierdzone w liście emisyjnym; trzymaj je w jednej funkcji `earlyRedemptionPayout`.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add deposit and EDO bond models`.

### Task 19: Wpłaty, wypłaty, zdarzenia

**Files:**
- Create: `packages/engine/src/math/pmt.ts`, `cashflows/contributions.ts`, `cashflows/withdrawals.ts`, `cashflows/cashflows.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function pmt(r: number, n: number, pv: number, due: boolean): number;
  export function contributionAt(c: Contribution, t: number, cpiLog: number): number;           // nominalnie
  export class WithdrawalPolicy { constructor(w: Withdrawal, horizonMonths: number); reset(): void; onJanuary(t: number, wealthAfterTax: number, cpiLog: number): void; amountAt(t: number, cpiLog: number): number }
  export function eventAmount(e: OneOff, cpiLog: number): number;
  ```

- [ ] **Step 1:** Testy:
  ```ts
  expect(pmt(0.03, 30, 1_000_000, true)).toBeCloseTo(49533.26, 1);
  expect(pmt(0, 20, 100, true)).toBe(5);
  // contribution cpi: 1000 przy cpiLog = ln(1.1) → 1100; po endMonth → 0; cpiPlus z realGrowth 0.02 po 12 mies. → 1000·e^{cpiLog}·1.02
  // fixedReal 4000: amountAt = 4000·e^{cpiLog}; przed startMonth → 0
  // percent 0.04: onJanuary(wealth 1 200 000) → amountAt = 4000 przez 12 miesięcy, niezależnie od cpiLog
  // abw: expectedRealReturn 0.03, 30 lat do końca, wealth 1 000 000 → roczna rata 49533.26, miesięcznie /12, indeksowana CPI w ciągu roku;
  //      floor 3000 (realnie) podnosi, cap 5000 obcina
  // eventAmount real: −50 000 przy cpiLog = ln(1.2) → −60 000
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj spec 4.11.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add contributions, withdrawal policies and events`.

### Task 20: Rebalans, koszty transakcyjne, źródła wypłaty

**Files:**
- Create: `packages/engine/src/portfolio/rebalance.ts`, `portfolio/rebalance.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Trade { index: number; amount: number }                    // + kupno, − sprzedaż, w walucie bazowej
  export function rebalanceTrades(values: Float64Array, targets: Float64Array, liquid: Uint8Array, policy: RebalancePolicy, isJanuary: boolean, out: Float64Array): boolean; // true gdy są transakcje
  export function allocateInflow(values: Float64Array, targets: Float64Array, liquid: Uint8Array, amount: number, policy: RebalancePolicy, out: Float64Array): void;
  export function allocateOutflow(values: Float64Array, targets: Float64Array, liquid: Uint8Array, cashIndex: number, amount: number, out: Float64Array): number; // zwraca niedobór
  export function transactionCost(amount: number, costBps: number): number;
  ```

- [ ] **Step 1:** Testy:
  ```ts
  // annual: w styczniu values [70, 30], targets [0.5, 0.5] → out [−20, +20]; poza styczniem → false
  // band 5 pp: [54, 46] → false; [56, 44] → out [−6, +6]
  // flows: rebalanceTrades zawsze false; allocateInflow(10) przy [60, 40] → całość do drugiego aktywa
  // none: allocateInflow proporcjonalnie do targets
  // allocateOutflow: najpierw gotówka (cashIndex), potem aktywa przeważone; amount > suma płynnych → zwraca niedobór > 0
  // aktywo niepłynne (liquid = 0) nie dostaje ani nie oddaje
  // (Review Focus 2) suma targets płynnych === 0 → brak transakcji, brak NaN; jedno aktywo 100% → brak transakcji
  expect(transactionCost(-10_000, 20)).toBe(20);
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj spec 4.9.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add rebalancing policies and withdrawal sourcing`.

### Task 21: Kernel jednej ścieżki

**Files:**
- Create: `packages/engine/src/kernel.ts`, `kernel.test.ts`

**Interfaces:**
- Consumes: zadania 8–20.
- Produces:
  ```ts
  export interface PathSink { onGrid(j: number, wealth: number, wealthAfterTax: number, cpiLog: number): void; onEnd(ruinMonth: number, maxDrawdown: number, worst12mLog: number, twrLog: number): void }
  export interface PathLedger { marketGains: number; contributions: number; withdrawals: number; taxesPaid: number; fees: number; costs: number; shortfall: number }
  export class Kernel {
    constructor(s: Scenario);                        // rzuca, gdy validateScenario nie przechodzi
    readonly grid: Int32Array;                       // miesiące zapisu wg spec 4.14 (zawsze zawiera 0 i horizonMonths)
    readonly warnings: Warning[];
    simulate(seed: number, path: number, sink: PathSink): void;
    readonly ledger: PathLedger;                     // stan po ostatnim simulate
    readonly collapsed: Uint8Array;
  }
  export function buildGrid(horizonMonths: number): Int32Array;
  ```

- [ ] **Step 1:** Testy:
  ```ts
  expect(buildGrid(120).length).toBe(121); expect(buildGrid(480).length).toBe(161); expect(buildGrid(960).length).toBe(161);
  // (T2) σ = 0, g = 0.065, TER 0.002, 120 mies., bez podatków: wealth końcowy = W0·1.065^10·0.998^10, błąd wzgl. < 1e-12
  // (T2) gbm σ = 0.16, 20 000 ścieżek: mediana końcowa w 99.99% CI wokół W0·1.065^10
  // (T4) scenariusz z wpłatami, wypłatami fixedReal, rebalansem annual, podatkami pl, 2 aktywa + lokata + EDO, 500 ścieżek:
  //      |W_end − (W_start + marketGains + contributions − withdrawals − taxesPaid − fees − costs)| / W_start < 1e-9
  // kolejność: wypłata w miesiącu 0 pomniejsza kapitał przed pierwszym zwrotem (σ = 0, ręczne wyliczenie 3 miesięcy)
  // podatek: sprzedaż z zyskiem w 2027 → taxesPaid rośnie dopiero w kwietniu 2028
  // wealthAfterTax ≤ wealth zawsze; równe przy tax none
  // ruina: fixedReal większe niż portfel → ruinMonth ≥ 0, wealth = 0 do końca, shortfall > 0, brak NaN
  // obsunięcie: σ = 0 i g > 0 → maxDrawdown === 0 mimo wypłat (liczone na indeksie TWR)
  // (Review Focus 3) horizonMonths = 1 oraz 960, g = −0.99, hazard = 1, ν = 3: wyniki skończone (Number.isFinite) na 200 ścieżkach
  // CRN: zmiana withdrawal.monthly nie zmienia log-zwrotów aktywów na ścieżce (porównanie twrLog przy polityce 'none' i braku podatków)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj pętlę dokładnie w kolejności spec 4.1 (kroki 1–6). Wartość po podatku: `wealth − taxDue − latentTax`. Indeks TWR: iloczyn zwrotów portfela ważonych wartościami sprzed zwrotu. Wszystkie bufory alokowane w konstruktorze.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add single-path kernel with documented event order`.

### Task 22: Runner, siatka wyników, pomiar wydajności

**Files:**
- Create: `packages/engine/src/runner.ts`, `runner.test.ts`, `packages/engine/bench/run.bench.ts`

**Interfaces:**
- Produces:
  ```ts
  export function runBatch(s: Scenario, o: RunOptions): RunResult;             // ścieżki pathOffset .. pathOffset + paths − 1
  export function mergeResults(parts: RunResult[]): RunResult;                 // w kolejności pathOffset
  export const STAGES = [1000, 4000, 10000] as const; export const EXPERT_STAGE = 25000;
  ```

- [ ] **Step 1:** Testy:
  ```ts
  // (T7) runBatch(s, {seed, paths: 1000}) jest bajt w bajt równe mergeResults z 4 części po 250 (pathOffset 0, 250, 500, 750)
  // powtarzalność: dwa wywołania z tym samym ziarnem → identyczne Float32Array
  // rozmiary: wealth.length === paths · grid.length; meanShare sumuje się do 1 w każdym roku (±1e-9)
  // pamięć: 25 000 ścieżek × 161 punktów → trzy macierze razem < 64 MB (wyliczenie z byteLength)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj. Benchmark `run.bench.ts`: scenariusz 6 aktywów (2 w USD), 360 mies., tryb `realistic`, podatki `pl`, wpłaty miesięczne, rebalans `annual`, 10 000 ścieżek, jeden wątek; wypisuje czas i ścieżko-miesiące na sekundę.
- [ ] **Step 4:** Uruchom testy (PASS) i `pnpm --filter @sim/engine exec vitest bench --run`. Kryterium: < 3,0 s w jednym wątku na maszynie CI (odpowiada < 0,5 s na desktopie z 8 workerami). Wynik zapisz w `docs/PERFORMANCE.md`. Jeśli kryterium nie jest spełnione, najpierw profiluj (`node --prof`), a decyzję o WASM zostaw użytkownikowi.
- [ ] **Step 5:** Commit: `feat(engine): add batch runner with deterministic merging and benchmark`.

### Task 23: Statystyki

**Files:**
- Create: `packages/engine/src/stats/quantiles.ts`, `stats/intervals.ts`, `stats/summary.ts`, `stats/stats.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function quantile7(sorted: ArrayLike<number>, p: number): number;
  export function wilson(k: number, n: number, z?: number): [number, number];
  export function quantileCI(n: number, p: number, z?: number): [number, number];      // indeksy 0-based statystyk pozycyjnych
  export const FAN_LEVELS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] as const;
  export interface FanChart { months: Int32Array; levels: readonly number[]; values: Float32Array /* [level * months.length + j] */ }
  export function fanChart(r: RunResult, o: { real: boolean; afterTax: boolean }): FanChart;
  export interface Summary { median: number; p10: number; p90: number; mean: number; cvar5: number; probGoal?: { p: number; ci: [number, number] }; probRealLoss: { p: number; ci: [number, number] }; probRuin: { p: number; ci: [number, number] }; medianCI: [number, number]; maxDrawdown: { p50: number; p90: number }; worst12m: { p10: number }; realCagr: { p10: number; p50: number; p90: number }; probCollapse: Record<string, number> }
  export function summarize(r: RunResult, s: Scenario, o: { month: number; real: boolean; afterTax: boolean }): Summary;
  export function histogram(values: ArrayLike<number>, bins: number): { edges: Float64Array; counts: Uint32Array };
  export function samplePathIndices(r: RunResult, levels: number[]): number[];          // ścieżki najbliższe kwantylom wartości końcowej
  ```

- [ ] **Step 1:** Testy:
  ```ts
  expect(quantile7([1, 2, 3, 4], 0.5)).toBe(2.5); expect(quantile7([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 12);
  const [lo, hi] = wilson(90, 100); expect(lo).toBeCloseTo(0.8256, 4); expect(hi).toBeCloseTo(0.9448, 4);
  expect(wilson(0, 100)[0]).toBe(0); expect(quantileCI(1000, 0.5)).toEqual([469, 531]);
  // pokrycie: 2 000 powtórzeń, n = 500 z N(0,1): prawdziwa mediana leży w przedziale z quantileCI w 93–97% powtórzeń
  // fanChart real: wartości = wealth / exp(cpiLog); levels rosnące w każdym miesiącu; ścieżki z ruiną wliczone jako 0
  // summarize: ścieżki z ruiną obniżają medianę (porównanie z ręcznie zbudowanym RunResult z 10 ścieżek)
  // cvar5 = średnia z najniższych 5% wartości końcowych
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj spec 4.13 (sortowanie kopii kolumny `Float32Array`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add quantiles, confidence intervals and summaries`.

### Task 24: Testy kalibracji całego modelu i „Kontrola modelu”

**Files:**
- Create: `packages/engine/src/stats/modelCheck.ts`, `stats/modelCheck.test.ts`, `packages/engine/src/calibration.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ModelCheckRow { id: string; metric: 'meanLog' | 'vol' | 'corr' | 'inflationSd' | 'crisisShare'; input: number; simulated: number; se: number; ok: boolean }
  export function modelCheck(s: Scenario, o: { seed: number; paths: number }): ModelCheckRow[];   // ok === |simulated − input| ≤ 4·se
  ```

- [ ] **Step 1:** Testy `calibration.test.ts` (spec T3; ziarno 20261113, tryb `realistic`, ν = 5, bez niepewności parametrów, 20 000 ścieżek × 120 mies., statystyki roczne liczone per ścieżka, SE z rozrzutu między 20 blokami po 1 000 ścieżek):
  ```ts
  // jedno aktywo g 0.065 σ 0.16 α 1 b 1: średnia rocznego log-zwrotu = ln(1.065); wariancja roczna = 0.0256
  // dwa aktywa (σ 0.16 i 0.21, α 1 i 1) ρ = 0.75: korelacja rocznych log-zwrotów = 0.75
  // akcje + obligacje (α −0.2, b 0.3, σ 0.06) ρ = 0.1: korelacja roczna = 0.1; wariancja obligacji = 0.0036
  // BTC preset bazowy: wariancja rocznego log-zwrotu w roku 1 = średnia z σ(t)² po 12 miesiącach, w roku 10 analogicznie
  // aktywo USD + kurs (σ_fx 0.11, ρ −0.3) + inflacja: korelacja szoków cpi z aktywem = wpisana (spec [Z-5])
  // modelCheck na scenariuszu wzorcowym: wszystkie wiersze ok === true
  // modelCheck z celowo popsutym wejściem (σ_m pomnożone ×1.41 przez mock) → co najmniej jeden wiersz ok === false
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL (brak `modelCheck`); testy kalibracji mogą ujawnić błędy z zadań 9–13: napraw je w tamtych plikach, nie luzuj tolerancji.
- [ ] **Step 3:** Zaimplementuj `modelCheck` (osobny przebieg bez przepływów i podatków).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `test(engine): add whole-model calibration suite and model check`.

### Task 25: Solvery

**Files:**
- Create: `packages/engine/src/solvers/bisect.ts`, `solvers/safeWithdrawal.ts`, `solvers/requiredContribution.ts`, `solvers/solvers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function bisectAmount(f: (x: number) => number, lo: number, hi: number, target: number, o: { relTol: number; maxIter: number; increasing: boolean }): { lo: number; hi: number; iterations: number };
  export interface SolverResult { amount: number; prob: number; ci: [number, number]; iterations: number }
  export function solveSafeWithdrawal(s: Scenario, o: { targetProb: number; seed: number; paths?: number }): SolverResult;        // domyślnie 4000 ścieżek; sukces = brak ruiny
  export function solveRequiredContribution(s: Scenario, o: { targetProb: number; seed: number; paths?: number }): SolverResult;  // sukces = cel osiągnięty (wymaga s.goal)
  export function closedFormSafeWithdrawal(s: Scenario, o: { targetProb: number; seed: number; paths: number }): number;          // start bisekcji, wariant bez podatków
  ```

- [ ] **Step 1:** Testy:
  ```ts
  // bisectAmount na funkcji schodkowej x ↦ floor(x)/10 z target 0.35: przedział zawiera 4, szerokość ≤ relTol·4
  // σ = 0, realny zwrot 3% rocznie (inflacja stała), 30 lat, W0 = 1 000 000, bez podatków:
  //   solveSafeWithdrawal.amount = pmt(1.03^(1/12) − 1, 360, 1_000_000, true) z błędem < 0.5%
  // gbm σ = 0.16: P̂(wynik.amount) ≥ targetProb na tych samych ścieżkach; P̂(wynik.amount·1.02) < targetProb + 0.01
  // closedFormSafeWithdrawal różni się od solveSafeWithdrawal o < 1% przy tax none i rebalance annual
  // solveRequiredContribution: cel nieosiągalny przy maksymalnej wpłacie (10× cel/horyzont) → amount === Infinity
  // cel już spełniony bez wpłat → amount === 0
  // (T7) wynik nie zależy od podziału ścieżek na partie
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj spec 4.13 [Z-21]: `relTol = 0.005`, `maxIter = 20`; zwracaj konserwatywny koniec przedziału.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(engine): add safe-withdrawal and required-contribution solvers`.

### Task 26: Testy własności i regresja

**Files:**
- Create: `packages/engine/src/properties.test.ts`, `packages/engine/src/regression.test.ts`, `packages/engine/src/testing/referenceScenarios.ts`, `packages/engine/src/index.ts` (eksport publicznego API)

**Interfaces:**
- Produces: `referenceScenarios: { accumulation: Scenario; retirement: Scenario; btcHeavy: Scenario }`; `index.ts` eksportuje `types`, `validateScenario`, `runBatch`, `mergeResults`, `STAGES`, `fanChart`, `summarize`, `histogram`, `samplePathIndices`, `modelCheck`, `solveSafeWithdrawal`, `solveRequiredContribution`, `effectiveVol`, `meanExpHalfVar`, `buildScaleTable`.

- [ ] **Step 1:** Testy (spec T7, T8), fast-check z `numRuns: 30`, 200 ścieżek:
  ```ts
  // tax none, rebalance none: dla w1 < w2 (fixedReal) wealth końcowy na każdej ścieżce: W(w2) ≤ W(w1)
  // tax none: dla c1 < c2 (wpłata) wealth końcowy na każdej ścieżce: W(c2) ≥ W(c1)
  // dodanie aktywa z value 0 i targetWeight 0 nie zmienia RunResult.wealth
  // stały % (rate ≤ 0.2): ruinMonth === −1 na każdej ścieżce
  // regresja: dla każdego scenariusza wzorcowego summarize(...) zgodne z toMatchSnapshot() (ziarno 1, 2 000 ścieżek, zaokrąglenie do 6 cyfr znaczących)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL (brak scenariuszy wzorcowych).
- [ ] **Step 3:** Dodaj scenariusze: `accumulation` (60% akcje globalne USD, 20% EDO, 10% BTC natywnie, 10% lokata; wpłaty 2 000 zł z indeksacją; 25 lat; podatki pl), `retirement` (start wypłat od miesiąca 0, ABW, 30 lat), `btcHeavy` (50% BTC, preset bazowy, 15 lat).
- [ ] **Step 4:** Uruchom `pnpm --filter @sim/engine test`. Oczekiwane: PASS; migawki zapisane.
- [ ] **Step 5:** Commit: `test(engine): add property tests and regression snapshots`.

---

## Faza 4: UI MVP

### Task 27: Worker i pula z etapami

**Files:**
- Create: `apps/web/src/workers/sim.worker.ts`, `workers/pool.ts`, `workers/pool.test.ts`

**Interfaces:**
- Consumes: `runBatch`, `mergeResults`, `STAGES`.
- Produces:
  ```ts
  export interface SimHandle { cancel(): void; done: Promise<RunResult> }
  export interface PoolOptions { workers?: number; maxPaths: number; onStage(result: RunResult, stage: number): void }
  export function runProgressive(s: Scenario, seed: number, o: PoolOptions): SimHandle;   // etapy 1000 → 4000 → 10000 (obcięte do maxPaths)
  export function defaultWorkerCount(): number;   // clamp(hardwareConcurrency − 1, 1, 8)
  export function defaultMaxPaths(): number;      // 10000 gdy deviceMemory ≤ 4 lub szerokość ekranu < 768, inaczej 25000
  ```

- [ ] **Step 1:** Testy (worker podmieniony na wywołanie synchroniczne): `onStage` wołane 3 razy z `paths` 1000, 4000, 10000; wynik etapu 10000 równy `runBatch(s, {seed, paths: 10000})`; `cancel()` po pierwszym etapie → brak kolejnych `onStage`, `done` odrzucone z `AbortError`; wynik identyczny dla `workers: 1` i `workers: 4`.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj z Comlink; bufory wyników przekazywane jako `Transferable`; każdy etap dolicza tylko brakujące ścieżki (`pathOffset`).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add worker pool with progressive stages`.

### Task 28: Stan scenariusza, zapis lokalny, migracje

**Files:**
- Create: `apps/web/src/state/scenarioSchema.ts`, `state/scenarioStore.ts`, `state/db.ts`, `state/migrations.ts`, `state/state.test.ts`, `state/defaults.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ScenarioSchema: z.ZodType<Scenario>;
  export function defaultScenario(d: Dataset): Scenario;                         // pusty portfel, 20 lat, tryb realistic, podatki pl
  export function assetFromPreset(d: Dataset, presetId: string): AssetParams;
  export function migrate(raw: unknown): { ok: true; scenario: Scenario } | { ok: false; reason: string };
  export const useScenarioStore: UseBoundStore<…>;                               // { scenario, setScenario, addPosition, updatePosition, removePosition, … }
  export const db: Dexie & { scenarios: Table<{ id: string; name: string; updatedAt: number; data: unknown }> };
  ```

- [ ] **Step 1:** Testy (Review Focus 4; `fake-indexeddb`):
  ```ts
  // defaultScenario przechodzi ScenarioSchema i validateScenario (z ostrzeżeniem EMPTY_PORTFOLIO)
  // assetFromPreset(d, 'btcBase') ma decay i collapse z danych, taxForm 'crypto'
  // zapis i odczyt z Dexie daje równy obiekt
  // migrate({schemaVersion: 0, ...}) → ok: false z reason 'unsupported-version'
  // migrate('śmieci'), migrate(null), migrate({schemaVersion: 1, positions: 'x'}) → ok: false, bez wyjątku
  // scenariusz z datasetVersion '2025.01' → ok: true, a store ustawia flagę datasetOutdated
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj. Przy `ok: false` UI (zadanie 30) pokazuje kartę „Nie udało się wczytać zapisanego planu” z przyciskami „Zacznij od nowa” i „Pobierz kopię danych”.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add scenario store with local persistence and migrations`.

### Task 29: System projektowy i układ

**Files:**
- Create: `apps/web/src/components/ui/{Button,Card,Field,MoneyInput,PercentInput,Sheet,Toggle,Badge,InfoTip}.tsx`, `components/ui/ui.test.tsx`, `app/Layout.tsx`, `app/routes.tsx`, `lib/format.ts`, `lib/format.test.ts`

**Interfaces:**
- Produces: `formatMoney(value: number, currency: Currency, o?: { sigDigits?: number }): string`, `formatPercent(p: number, digits?: number): string`, `naturalFrequency(p: number): string` („w 8 na 10 przyszłości”), `roundSig(x: number, n: number): number`; trasy `/`, `/portfel`, `/plan`, `/wynik`, `/zalozenia`, `/ustawienia`.

- [ ] **Step 1:** Testy: `formatMoney(1234567, 'PLN', {sigDigits: 2})` → „1,2 mln zł”; `formatMoney(950, 'PLN')` → „950 zł”; `naturalFrequency(0.83)` → „w 8 na 10 przyszłości”; `naturalFrequency(0.995)` → „w ponad 99 na 100 przyszłości”; `naturalFrequency(0.004)` → „w mniej niż 1 na 100 przyszłości”; `MoneyInput` przyjmuje „12 500,50” i zwraca 12500.5, odrzuca litery; każdy komponent ma dostępną nazwę (`getByRole`), `Toggle` reaguje na spację.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj na Radix UI i tokenach Tailwind v4 (`@theme`), motyw jasny i ciemny, cyfry tabelaryczne, `prefers-reduced-motion`.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add design system, layout and formatting helpers`.

### Task 30: Onboarding i edytor portfela

**Files:**
- Create: `apps/web/src/features/onboarding/{Onboarding.tsx,Onboarding.test.tsx}`, `features/portfolio/{PortfolioEditor.tsx,AssetTile.tsx,PositionForm.tsx,prices.ts,portfolio.test.tsx}`

**Interfaces:**
- Consumes: store, `assetFromPreset`, komponenty UI.
- Produces: `prices.ts`: `fetchNbpRate(c: 'USD' | 'EUR'): Promise<number>`, `fetchCryptoPrice(id: 'bitcoin' | 'ethereum', vs: 'usd' | 'pln'): Promise<number>`; obie tylko po kliknięciu „Pobierz cenę”, z cache 24 h w `localStorage` i atrybucją „Powered by CoinGecko” przy cenie krypto.

- [ ] **Step 1:** Testy:
  ```ts
  // krok 1 pokazuje kafelki: BTC, ETF na świat, S&P 500, obligacje EDO, lokata, złoto, mieszkanie, własne
  // dodanie „ETF na świat” 50 000 zł → store ma pozycję z value 50000 i assetId 'globalEquity'
  // BTC w jednostkach: 0,35 BTC × cena ręczna 300 000 zł → value 105 000
  // (Review Focus 5) fetch odrzucony (offline): pole „Cena 1 BTC” jest widoczne, wymagane i ma opis; przycisk „Dalej” nieaktywny do wpisania ceny; brak nieobsłużonych wyjątków
  // BTC: wybór „mam na giełdzie/portfelu” (taxForm crypto) albo „ETF/ETP” (security); złoto: „fizyczne” albo „ETF”
  // przejście trzech kroków kończy się na trasie /wynik
  // bez kliknięcia „Pobierz cenę” nie ma żadnego wywołania fetch (spy)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj (docs/PLAN.md 5.1 pkt 1). Mieszkanie w MVP tylko w wariancie „mieszkam” (majątek netto, poza symulacją inwestycyjną).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add onboarding and portfolio editor`.

### Task 31: Edytor planu (wpłaty, wypłaty, horyzont, cel)

**Files:**
- Create: `apps/web/src/features/plan/{PlanEditor.tsx,WithdrawalForm.tsx,plan.test.tsx}`

**Interfaces:**
- Consumes: store; `modelCheck` nie jest tu używany. `expectedRealReturn` dla ABW liczone przez `estimateRealReturn(s: Scenario): Promise<number>` (mediana realnego CAGR z przebiegu 1 000 ścieżek bez przepływów; `features/plan/estimate.ts`).

- [ ] **Step 1:** Testy: ustawienie wpłaty 1 500 zł z indeksacją inflacją → `scenario.contribution` = `{monthly: 1500, indexation: 'cpi', …}`; horyzont „do wieku 65” przy wieku 35 → `horizonMonths === 360`; trzy strategie wypłat do wyboru z opisami w prostym języku; wybór ABW ustawia `expectedRealReturn` z `estimateRealReturn`; cel „1 mln zł w dzisiejszych pieniądzach za 20 lat” → `goal = {amountReal: 1_000_000, month: 240}`; horyzont > 80 lat pokazuje błąd pola.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add plan editor`.

### Task 32: Dashboard wyników

**Files:**
- Create: `apps/web/src/features/results/{Dashboard.tsx,KpiTiles.tsx,QualityBadge.tsx,BtcCard.tsx,ModelCheckPanel.tsx,useSimulation.ts,results.test.tsx}`, `charts/{FanChart.tsx,Histogram.tsx,DataTable.tsx,charts.test.tsx}`

**Interfaces:**
- Consumes: `runProgressive`, `fanChart`, `summarize`, `histogram`, `modelCheck`.
- Produces: `useSimulation(scenario): { result?: RunResult; stage: number; running: boolean; warnings: Warning[] }` (debounce 250 ms, anulowanie poprzedniego przebiegu).

- [ ] **Step 1:** Testy:
  ```ts
  // KPI: „Typowy wynik za N lat (w dzisiejszych zł)” = mediana realna po podatku, 2 cyfry znaczące
  // KPI: „W 8 na 10 przyszłości między X a Y” = p10 i p90
  // przełącznik Realnie/Nominalnie i „Po podatku” (domyślnie włączony) zmieniają wszystkie kafelki i wachlarz
  // QualityBadge: „10 000 przyszłości · dokładność ±0,9 pp” liczona z przedziału Wilsona dla szansy celu
  // FanChart: 7 pasm, suwak roku zmienia wartości kafelków; DataTable daje te same liczby (alternatywa dla czytników ekranu)
  // BtcCard widoczna tylko gdy w portfelu jest BTC; pokazuje percentyle ceny w USD i PLN oraz „Szansa upadku do roku X: N na 100”
  // ostrzeżenie CORR_PROJECTED renderuje baner z macierzą po korekcie
  // ModelCheckPanel: tabela wejście vs symulacja, plakietka „model skalibrowany ✓” tylko gdy wszystkie ok
  // średnia widoczna tylko w trybie eksperta, z dopiskiem o rzadkich skrajnych scenariuszach
  // zmiana scenariusza w trakcie liczenia anuluje stary przebieg (spy na cancel)
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj. Wykresy jako SVG na `d3-scale` i `d3-shape`; paleta bezpieczna dla daltonistów; tooltip w częstościach naturalnych.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add results dashboard with fan chart and model check`.

### Task 33: Panel „Założenia i źródła”

**Files:**
- Create: `apps/web/src/features/assumptions/{AssumptionsPanel.tsx,ParamRow.tsx,ExpertControls.tsx,assumptions.test.tsx}`

- [ ] **Step 1:** Testy: każdy parametr aktywnego scenariusza ma wiersz z wartością, etykietą rodzaju (dane / prognoza instytucji / założenie), listą źródeł jako linki z datą dostępu; parametr z `verified !== 'yes'` ma plakietkę „niezweryfikowane” albo „źródło wtórne”; zmiana wartości zaznacza wiersz jako „zmienione przez Ciebie” i pokazuje „przywróć domyślne”; przełącznik zestawu BTC (pesymistyczny / bazowy / optymistyczny) podmienia parametry aktywa; nakładka potęgowa jest niewidoczna poza trybem eksperta i ma etykietę „model kontrowersyjny”; suwak „Jak pewny jesteś oczekiwanego zwrotu?” ustawia `market.uncertaintyScale` w zakresie 0–2; tryb eksperta odsłania model (realistyczny / podręcznikowy), ν, α i b jako „wrażliwość na kryzysy”.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj. Nakładka potęgowa w MVP to tylko wyłączony przełącznik z opisem; logika w zadaniu 45.
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add assumptions and sources panel`.

### Task 34: Rejestr uprawnień i ustawienia

**Files:**
- Create: `apps/web/src/entitlements/{features.ts,Gate.tsx,entitlements.test.tsx}`, `features/settings/{Settings.tsx,exportImport.ts,settings.test.tsx}`

**Interfaces:**
- Produces: `export const FREE_FOR_ALL = true; export type FeatureId = 'compare' | 'solver.safeWithdrawal' | 'solver.requiredContribution' | 'paths.expert' | 'export.json'; export function useEntitlement(f: FeatureId): boolean; export function Gate(p: { feature: FeatureId; children: ReactNode; fallback?: ReactNode }): JSX.Element`.

- [ ] **Step 1:** Testy: przy `FREE_FOR_ALL` każda funkcja jest dostępna; po podmianie flagi na `false` (mock) `Gate` renderuje `fallback`; eksport JSON i ponowny import dają równy scenariusz; import uszkodzonego pliku pokazuje błąd i nie zmienia stanu; „Reset” czyści Dexie po potwierdzeniu.
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Zaimplementuj. Solvery z zadania 25 podłącz na dashboardzie w `<Gate>` („Ile mogę bezpiecznie wydawać?”).
- [ ] **Step 4:** Uruchom. Oczekiwane: PASS.
- [ ] **Step 5:** Commit: `feat(web): add entitlement registry and settings`.

### Task 35: E2E, dostępność, offline

**Files:**
- Create: `apps/web/e2e/{flow.spec.ts,a11y.spec.ts,perf.spec.ts}`

- [ ] **Step 1:** Napisz testy Playwright (projekty `Pixel 7` i `Desktop Chrome`): pełny przepływ (dodanie ETF 50 000 zł i 0,1 BTC z ceną ręczną, wpłata 1 000 zł, 20 lat, wynik z wachlarzem i trzema KPI); przeładowanie przywraca scenariusz; ten sam przepływ w trybie offline po pierwszym załadowaniu; `@axe-core/playwright` bez naruszeń `serious` i `critical` na każdej trasie; brak żądań sieciowych poza własnym originem w całym przepływie (nasłuch `page.on('request')`); `perf.spec.ts`: od kliknięcia „Wynik” do pierwszego etapu < 1 s, do etapu 10 000 < 5 s w CI.
- [ ] **Step 2:** Uruchom `pnpm --filter @sim/web exec playwright test --trace off`. Oczekiwane: część FAIL.
- [ ] **Step 3:** Napraw wykryte braki w komponentach z zadań 29–34.
- [ ] **Step 4:** Uruchom ponownie. Oczekiwane: PASS na obu projektach.
- [ ] **Step 5:** Dodaj job `e2e` do CI. Commit: `test(web): add end-to-end, accessibility and offline suites`.

---

## Faza 5: rozszerzenia

Każde zadanie jest niezależne od pozostałych w tej fazie.

### Task 36: Porównanie scenariuszy na wspólnych liczbach losowych

**Files:** Create `apps/web/src/features/compare/{Compare.tsx,compare.test.tsx}`; Modify `state/scenarioStore.ts` (lista do 3 scenariuszy).

- [ ] **Step 1:** Testy: dwa scenariusze różniące się tylko udziałem BTC liczone z tym samym `seed`; tabela różnic mediany i p10 z przedziałem ufności liczonym na **różnicach per ścieżka** (sparowane); scenariusze identyczne → różnica dokładnie 0; czwarty scenariusz jest blokowany z komunikatem.
- [ ] **Step 2:** Uruchom. FAIL. — [ ] **Step 3:** Zaimplementuj (w `<Gate feature="compare">`). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat(web): add scenario comparison on common random numbers`.

### Task 37: Śmiertelność

**Files:** Create `packages/data/datasets/2026.11/lifeTables.json`, `packages/data/scripts/convert-gus-life-table.ts`, `packages/engine/src/stats/mortality.ts`, `stats/mortality.test.ts`.

**Interfaces:** `survivalCurve(qx: number[], age: number, months: number, extraYears?: number): Float64Array`; `probRuinWhileAlive(ruinMonth: Int32Array, survival: Float64Array): { p: number; ci: [number, number] }`.

- [ ] **Step 1:** Testy: dane zawierają `q_x` dla wieku 0–100 obu płci, `q_0` mężczyzn = 0,00333, kobiet 0,00316 (GUS 2025, Tablica A); dalsze trwanie życia wyliczone z `q_x` w wieku 60: M 20,04 ± 0,15, K 24,71 ± 0,15; `survivalCurve` jest nierosnąca, zaczyna się od 1, interpoluje miesiące założeniem stałej intensywności w roku; brak ruiny → `p === 0`; ruina w miesiącu 0 na wszystkich ścieżkach → `p === 1`.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj (spec 4.12); skrypt konwertuje XLSX „Tablica A” pobrany ręcznie. — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat: add GUS life tables and ruin-while-alive probability`.

### Task 38: IKE i IKZE z limitami

**Files:** Create `packages/engine/src/tax/pl/wrappers.ts`, `tax/pl/wrappers.test.ts`; Modify `kernel.ts`, `types.ts` (`Scenario.wrappers?: { ikeLimit: number; ikzeLimit: number; ikzeTaxRate: number; age: number }`).

- [ ] **Step 1:** Testy: wpłaty do IKE ponad limit roczny 28 260 zł trafiają na rachunek opodatkowany; limit rośnie co roku z płacami (parametr, domyślnie inflacja + 1%); wypłata z IKE po 60. roku życia bez podatku, wcześniej 19% od zysku; IKZE: zwrot podatku `wpłata × ikzeTaxRate` w kwietniu następnego roku, wypłata po 65. roku życia z 10% od całej kwoty.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj; przed implementacją potwierdź limity 2027 w Monitorze Polskim (spec 6.4, status ◐). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat(engine): add IKE and IKZE limits and withdrawal rules`.

### Task 39: Nieruchomość na wynajem

**Files:** Create `packages/engine/src/models/realEstate.ts`, `models/realEstate.test.ts`; Modify `types.ts` (`RealEstateParams`), `kernel.ts`.

- [ ] **Step 1:** Testy: czynsz netto 3,5% wartości rocznie trafia co miesiąc do gotówki po ryczałcie 8,5% (do 100 000 zł przychodu w roku) i 12,5% powyżej; nieruchomość nie bierze udziału w rebalansie ani w `allocateOutflow`; zdarzenie „sprzedaż w roku X”: po 5 latach podatkowych bez podatku, wcześniej 19% od zysku; wartość rośnie jak aktywo ryzykowne o `g = inflacja + 1%` (dryf dodawany do `x_t`).
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj (spec 4.8). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat(engine): add rental real estate`.

### Task 40: Guyton–Klinger

**Files:** Modify `packages/engine/src/cashflows/withdrawals.ts`, `types.ts` (`{ kind: 'guytonKlinger'; startMonth; initialRate; guardrail: 0.2; adjustment: 0.1; inflationCap: 0.06 }`); Create `cashflows/guytonKlinger.test.ts`.

- [ ] **Step 1:** Testy na ręcznie wyliczonych ścieżkach: reguła ochrony kapitału (bieżąca stopa wypłat > 120% początkowej → wypłata −10%, nie w ostatnich 15 latach); reguła dobrobytu (< 80% → +10%); brak indeksacji po roku z ujemnym zwrotem, gdy stopa > początkowej; indeksacja nie wyższa niż 6%.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj wg Guyton i Klinger 2006 (Journal of Financial Planning 19(3)). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat(engine): add Guyton-Klinger withdrawal rules`.

### Task 41: Wkład aktywów w ryzyko

**Files:** Create `packages/engine/src/stats/riskContribution.ts`, `stats/riskContribution.test.ts`, `apps/web/src/features/results/RiskCard.tsx`.

- [ ] **Step 1:** Testy: `riskContributions(weights, cov)` sumuje się do 1; dla dwóch nieskorelowanych aktywów o wagach 0,9 i 0,1 i σ 0,16 i 0,50 wkłady = `w_i²σ_i²/Σ`; karta pokazuje zdanie „BTC to 10% wartości i N% ryzyka”.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj (kowariancja rocznych log-zwrotów w walucie bazowej z osobnego przebiegu 2 000 ścieżek). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat: add risk contribution card`.

### Task 42: Backtest i bootstrap historyczny

**Files:** Create `packages/data/scripts/backtest-shiller.ts`, `packages/engine/src/models/bootstrap.ts`, `models/bootstrap.test.ts`, `docs/BACKTEST.md`.

- [ ] **Step 1:** Testy: stacjonarny bootstrap blokowy (Politis i Romano 1994) o średniej długości bloku 12 zachowuje średnią próby w 4 SE i daje autokorelację lag 1 bliższą próbie niż bootstrap i.i.d.; długości bloków mają rozkład geometryczny.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj; skrypt backtestu realizuje spec T9 na danych Shillera pobranych lokalnie i zapisuje wynik w `docs/BACKTEST.md`. Bootstrap w UI tylko dla szeregów, które użytkownik wgra sam (licencje, spec 6.5). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat: add stationary bootstrap and Shiller backtest`.

### Task 43: Strona metodologii

**Files:** Create `apps/web/src/features/methodology/{Methodology.tsx,methodology.test.tsx}`, `docs/METHODOLOGY.md`.

- [ ] **Step 1:** Testy: strona zawiera sekcje odpowiadające spec 4.1–4.14 w prostym języku i aneks ze wzorami; KaTeX ładowany dynamicznym importem (brak w głównym chunku: asercja na manifeście builda); każdy cytowany artykuł ma pełne dane bibliograficzne.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj. — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `docs: add methodology page`.

### Task 44: Wersja angielska

**Files:** Create `apps/web/src/i18n/locales/en.po`; Modify `features/settings/Settings.tsx`.

- [ ] **Step 1:** Test: `lingui extract` nie zgłasza brakujących tłumaczeń dla `en`; przełączenie języka zmienia nagłówki i format liczb (`en-GB`); e2e przepływ w języku angielskim.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Przetłumacz. — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat(web): add English locale`.

### Task 45: Nakładka potęgowa BTC (kontrowersyjna, domyślnie wyłączona)

**Files:** Modify `packages/engine/src/models/market.ts`, `types.ts` (`RiskyAssetParams.powerLaw?: { a: number; b: number; genesis: '2009-01-03' }`); Create `models/powerLaw.test.ts`.

- [ ] **Step 1:** Testy: przy włączonej nakładce `gAt(i, t)` odpowiada przyrostowi `b·ln((d_t + 30,44)/d_t)` na miesiąc (`d_t` = dni od genesis); σ i upadek bez zmian; domyślny scenariusz i wszystkie presety mają `powerLaw === undefined`; UI pokazuje ostrzeżenie ze spec 4.8 przed włączeniem.
- [ ] **Step 2:** FAIL. — [ ] **Step 3:** Zaimplementuj; parametry `a, b` wpisuje użytkownik (brak wartości domyślnych, bo są niezweryfikowane). — [ ] **Step 4:** PASS. — [ ] **Step 5:** Commit: `feat: add optional power-law overlay for BTC`.

---

## Faza 6: jakość

### Task 46: Audyt dostępności, wydajność na telefonie, Lighthouse

**Files:** Create `.github/workflows/lighthouse.yml`, `lighthouserc.json`, `docs/PERFORMANCE.md` (uzupełnienie), `docs/ACCESSIBILITY.md`.

- [ ] **Step 1:** Dodaj Lighthouse CI na buildzie produkcyjnym z asercjami: wydajność ≥ 0,95, dostępność ≥ 0,95, PWA instalowalna, główny chunk JS ≤ 250 kB gzip.
- [ ] **Step 2:** Uruchom. Oczekiwane: możliwe FAIL.
- [ ] **Step 3:** Popraw (podział kodu per trasa, leniwe wykresy i KaTeX). Ręcznie: przejście klawiaturą i czytnikiem ekranu (VoiceOver albo NVDA) całego przepływu, kontrast w obu motywach; wynik w `docs/ACCESSIBILITY.md`.
- [ ] **Step 4:** Pomiar na realnym telefonie średniej klasy (zdalne debugowanie): 10 000 ścieżek × 30 lat × 6 aktywów < 2 s, podgląd < 300 ms. Zapisz model telefonu i czasy w `docs/PERFORMANCE.md`. Jeśli budżet nie jest spełniony, zgłoś to użytkownikowi razem z profilem.
- [ ] **Step 5:** Commit: `chore: add Lighthouse budgets and accessibility audit`.

---

## Faza 7: wdrożenie na Vercel

### Task 47: Konfiguracja i wdrożenie

**Files:**
- Create: `vercel.json`, `apps/web/src/deploy/vercelConfig.test.ts`, `docs/DEPLOYMENT.md`

- [ ] **Step 1:** Test `vercelConfig.test.ts` czyta `vercel.json` i sprawdza:
  ```ts
  expect(cfg.outputDirectory).toBe('apps/web/dist');
  expect(cfg.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  expect(cfg.functions).toBeUndefined();                              // brak funkcji serwerowych
  expect(headerFor('/sw.js', 'Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  expect(headerFor('/assets/(.*)', 'Cache-Control')).toBe('public, max-age=31536000, immutable');
  expect(headerFor('/index.html', 'Cache-Control')).toBe('no-cache');
  const csp = headerFor('/(.*)', 'Content-Security-Policy');
  expect(csp).toContain("default-src 'self'"); expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("connect-src 'self' https://api.nbp.pl https://api.coingecko.com");
  expect(csp).not.toContain("'unsafe-eval'");
  ```
- [ ] **Step 2:** Uruchom. Oczekiwane: FAIL.
- [ ] **Step 3:** Utwórz `vercel.json`:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "framework": "vite",
    "installCommand": "pnpm install --frozen-lockfile",
    "buildCommand": "pnpm --filter @sim/web build",
    "outputDirectory": "apps/web/dist",
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
    "headers": [
      { "source": "/(.*)", "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.nbp.pl https://api.coingecko.com; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ] },
      { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }] },
      { "source": "/registerSW.js", "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }] },
      { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ]
  }
  ```
  Vercel serwuje istniejące pliki przed regułami `rewrites`, więc zasoby statyczne nie trafiają do `index.html`.
- [ ] **Step 4:** Uruchom test (PASS). Zbuduj i sprawdź lokalnie `pnpm --filter @sim/web build && pnpm --filter @sim/web preview`: aplikacja działa z nagłówkiem CSP ustawionym w `vite.config.ts` (`preview.headers`) bez błędów CSP w konsoli; e2e z zadania 35 przechodzi na buildzie produkcyjnym.
- [ ] **Step 5:** Napisz `docs/DEPLOYMENT.md`: (a) podłączenie repozytorium w Vercel i pierwsze wdrożenie wykonuje użytkownik (wymaga jego konta; agent nie ma poświadczeń); (b) po wdrożeniu sprawdzenie nagłówków `curl -sI https://<domena>/sw.js` i `…/assets/<plik>`, wejścia bezpośrednio na `/wynik` (rewrite SPA), instalacji PWA i trybu offline; (c) aktualizacja service workera: użytkownik widzi „Dostępna nowa wersja” i odświeża; (d) **plan Hobby na Vercel jest tylko do użytku niekomercyjnego: przed włączeniem płatności, reklam lub linków afiliacyjnych trzeba przejść na plan Pro** (https://vercel.com/docs/limits/fair-use-guidelines). Commit: `chore: add Vercel deployment config and headers`.

---

## Samokontrola planu (wykonana)

- **Pokrycie spec:** 4.1 → zadanie 21; 4.2 → 5, 6; 4.3 → 6, 10; 4.4 → 9, 10, 24; 4.5 → 11; 4.6 → 12; 4.7 → 13; 4.8 → 10, 18, 39, 45; 4.9 → 15, 20; 4.10 → 16, 17, 38; 4.11 → 19, 40; 4.12 → 37; 4.13 → 23, 25, 41; 4.14 → 22, 27, 46; 5 → 2, 27–35; 6 → 3, 4, 14; 8 → 47; 9: T1 → 5, 6; T2 → 6, 19, 21; T3 → 10–13, 24; T4 → 21; T5 → 16–18; T6 → 19, 26; T7 → 22, 25, 26; T8 → 26; T9 → 42; T10 → 35, 46.
- **Review Focus:** 1 → zadania 7, 8, 9; 2 → 8, 20; 3 → 8, 21; 4 → 28; 5 → 30.
- **Spójność typów:** wszystkie nazwy pól pochodzą z bloku `types.ts` w zadaniu 8; rozszerzenia typów w fazie 5 są wypisane w zadaniu, które je dodaje.
- **Kolejność:** fazy 0–4 i 7 to MVP. Zadanie 47 nie zależy od fazy 5 ani 6 i może być wykonane zaraz po zadaniu 35.
