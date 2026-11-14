# Wydajność silnika (zadanie 22)

Budżet (spec 4.14, 9): 10 000 ścieżek × 360 mies. × 6 aktywów (2 w USD), tryb `realistic`, podatki `pl`,
wpłaty miesięczne, rebalans `annual`, **jeden wątek, < 3,0 s** (odpowiada < 0,5 s na desktopie z 8 workerami).
Scenariusz: `packages/engine/bench/perfScenario.ts`; pomiar: `bench/measure.ts`.

## Jak mierzyć

- `pnpm --filter @sim/engine bench:node` – Node bez narzutu vitest (miarodajne dla produkcji).
- `pnpm --filter @sim/engine bench` – `vitest bench --run`. Vitest transformuje moduły (importy przez obiekt
  modułu), co spowalnia gorącą pętlę o ok. 40–50%; wartość tylko orientacyjna.

## Wyniki (sandbox 4 vCPU, Node 22, mediana 3 przebiegów po rozgrzewce)

| Wersja | Node (tsx) | Node (bundle esbuild) | vitest bench |
|---|---|---|---|
| Przed optymalizacją | 3,24 s | – | ≈ 4,2 s |
| Po optymalizacji | 2,6–2,7 s (≈ 1,36 mln ścieżko-mies./s) | 2,85–2,9 s | ≈ 4,0 s |

Rozrzut między uruchomieniami ok. ±8% (współdzielona maszyna). Kryterium < 3,0 s w jednym wątku w Node jest
spełnione, ale z niewielkim zapasem (3–13%).

## Profil (gorąca ścieżka)

Rynek (`MarketSimulator.step` + `normalInv` + RNG) ≈ 40% czasu (1,05 s z 2,7 s), jądro (wpłaty, alokacja,
zakupy, zwroty, wartości) ≈ 55%, zapis siatki i udziałów ≈ 5%. Brak pojedynczego wąskiego gardła.

## Wprowadzone optymalizacje (wyniki bit w bit takie same, hash SHA-256 macierzy 300 ścieżek bez zmian)

1. `Xoshiro128ss`: stan w `Int32Array` zamiast pól o wartościach ≥ 2^30 (pudełkowane liczby, alokacje).
2. `liquidSums` zwraca współdzielony obiekt (brak alokacji przy każdej wpłacie/rebalansie).
3. `MarketSimulator`: stały dryf i σ aktywów bez zaniku liczone raz na ścieżkę, nie co miesiąc.
4. `Kernel.rebalance`: polityka `annual` poza styczniem nie odświeża wartości pozycji (wynik i tak „brak transakcji”).

## Pomysły na dalsze przyspieszenie (niewdrożone)

- Tablice σ(t), g(t) dla aktywów z zanikiem (te same dla wszystkich ścieżek).
- Pominięcie `out.yy` w `MarketSimulator.step` (nikt nie czyta; pole w interfejsie).
- Szybszy `normalInv` (np. tablicowy dla centrum) zmieniłby wartości zwrotów, więc wymaga ponownej kalibracji testów.
- WASM: nie planowany ([Z-23]); wraca tylko po nieudanym pomiarze na docelowych urządzeniach.
