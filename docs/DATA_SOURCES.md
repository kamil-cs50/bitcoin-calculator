# Źródła danych i kalibracja

Zasady licencyjne: spec 6.5. Aplikacja zawiera wyłącznie statystyki pochodne i cytowania; surowe szeregi
pobierają lokalnie skrypty kalibracyjne (`packages/data/scripts`). CoinGecko nie służy do kalibracji.

## Skrypty

Uruchamianie z `packages/data`: `pnpm exec tsx scripts/<skrypt>.ts ...`. Skrypty wypisują propozycję jako JSON
na stdout i **nie** zmieniają `datasets/2026.11`; zmiana wartości wymaga akceptacji użytkownika, do tego czasu
pola zostają z `verified: 'no'`. Format plików wejściowych: CSV `data;wartość` (`YYYY-MM` lub `YYYY-MM-DD`,
separator `;` lub `,`, nagłówek opcjonalny).

| Skrypt | Wejście | Wynik |
|---|---|---|
| `calibrate-inflation.ts --input cpi.csv [--since YYYY-MM]` | poziomy CPI (GUS) | sd i autokorelacja (lag 12) `ln(1+r/r)`, średnia, `φ` i `σ_η` z `calibrateInflation` |
| `calibrate-fx.ts --input kurs.csv` lub `--fetch USD\|EUR --from --to` [`--cpi-pl`, `--cpi-foreign`] | kursy NBP tabela A (okna 93 dni), opcjonalnie CPI | `σ` 12-mies. zmiany `ln q`, `φ` miesięczne i półokres (tylko przy CPI; sprawdzenie `fxPhi`) |
| `calibrate-assets.ts --input id=plik.csv ...` | poziomy indeksów (pliki użytkownika) | `σ`, średni log-zwrot, autokorelacja, korelacje (ściąganie Ledoita–Wolfa) |
| `calibrate-regimes.ts --input plik.csv` | miesięczne poziomy indeksu | `p01`, `p10`, `κ₁`, `Δ`, `ν`, logLik (EM z filtrem Hamiltona, t-Studenta) |

Skrypty importują `calibrateInflation` i `fxPhi` z `@sim/engine` (devDependency; `@sim/engine` nie zależy od
`@sim/data`, brak cyklu) oraz zbiór danych przez `@sim/data/node`.

## Dziennik pobrań (2026-11-13)

| Źródło | Próba | Wynik |
|---|---|---|
| NBP Web API (`api.nbp.pl`) | `curl -m 10` (kurs USD) oraz `calibrate-fx.ts --fetch USD/EUR` od 2002-01-02 do 2026-11-12 | **Udane** (HTTP 200, okna po 93 dni) |
| GUS BDL (`bdl.stat.gov.pl`) | jedno zapytanie testowe | Serwis odpowiada (HTTP 200), ale znalezione zmienne (podmiot P2955, 217230–217238) są roczne. Miesięcznego szeregu poziomów CPI **nie pobrano**; kalibracji inflacji nie wykonano na realnych danych |
| FRED (`fredgraph.csv`) | jedno zapytanie testowe | HTTP 200, szeregu nie pobierano (brak sprawdzenia oznaczenia „Copyright”) |
| Indeksy akcji (MSCI, WIG itd.) | — | Brak plików od użytkownika; `calibrate-assets` i `calibrate-regimes` sprawdzone tylko na danych syntetycznych |

## Propozycje kalibracji (nie wprowadzone do zbioru)

### Kurs walutowy, NBP tabela A, 2002-01 … 2026-11 (299 miesięcy), kurs **nominalny**

Bez CPI krajowego i zagranicznego liczona jest zmienność nominalna, a nie realnego kursu `q` z R-2, więc to
jedynie górne przybliżenie `σ` (półokres niedostępny).

| Waluta | `σ` 12-mies. zmiany ln kursu (propozycja) | Wartość bieżąca w zbiorze | Status |
|---|---|---|---|
| USD/PLN | 0,126 | 0,11 | `verified: 'no'`, bez zmiany |
| EUR/PLN | 0,078 | 0,07 | `verified: 'no'`, bez zmiany |

Nominalne `σ` jest o ok. 1–2 pp wyższe od wartości bieżących, co jest zgodne z założeniem, że część wahań
nominalnych wynika z różnicy inflacji. Do właściwej kalibracji potrzebne są szeregi CPI (`--cpi-pl`, `--cpi-foreign`).

### Inflacja

Brak realnych danych (patrz dziennik pobrań). Wartości bieżące (`yoySd` 2,5 pp, `yoyAutocorr12` 0,4,
`longRun` 3%) pozostają założeniami `verified: 'no'`. Do wykonania po dostarczeniu pliku CPI:
`pnpm exec tsx scripts/calibrate-inflation.ts --input cpi.csv --since 2000-01`.

### Reżimy, aktywa

Brak plików wejściowych; parametry `market.regime` (p01 = 0,04, p10 = 0,2, κ₁ = 2,2, δ = 0,175) i `ν = 5`
pozostają wartościami z tabeli 6.3 z `verified: 'no'`.
