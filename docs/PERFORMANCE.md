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

---

# Wydajność aplikacji w przeglądarce i budżety (zadanie 46)

## Rozmiar pakietu (budżet: główny chunk JS ≤ 250 kB gzip)

Test `apps/web/src/bundleBudget.test.ts` czyta zbudowane `dist/` i sprawdza (gzip poziom 9): główny chunk (ten z
`index.html`), cały JS ładowany na starcie (wpis + `modulepreload`) oraz każdy inny chunk JS ≤ 250 kB. Test jest pomijany bez buildu; CI uruchamia go po `pnpm build`
(job „Lighthouse”).

| Chunk | Przed (gzip) | Po (gzip) |
|---|---|---|
| JS ładowany na starcie (wpis + preload) | 273 kB (**poza budżetem**) | ≈ 225 kB (wpis 107 kB + wspólne chunki) |
| trasy `wynik` (22 kB), `zalozenia` (15 kB), `ustawienia` (12 kB), `porownanie` (2 kB) | w głównym | osobne chunki per trasa (`src/app/lazy/*`) |
| `metodologia` + KaTeX | osobne | osobne (bez zmian) |
| angielski katalog `en` | osobny | osobny (bez zmian) |

Zmiany: trasy `/wynik`, `/porownanie`, `/zalozenia`, `/ustawienia` ładowane przez `lazy` routera
(`src/app/lazy/*.tsx`, po jednym chunku na trasę, żeby `/zalozenia` nie pobierało kodu wykresów), więc wykresy (d3), Radix Dialog/Popover/RadioGroup i panel założeń nie wchodzą do ścieżki
startowej. KaTeX i `en.po` były już dynamiczne. `manualChunks` nie było potrzebne (YAGNI): w głównym chunku zostają React,
router, zod, dexie i dane startowe, czyli to, czego potrzebuje pierwszy ekran.

## Lighthouse CI (`lighthouserc.json`, `.github/workflows/lighthouse.yml`)

Mobile (domyślny profil Lighthouse: Moto G Power, throttling 4× CPU, wolne 4G) na buildzie produkcyjnym
(`vite preview`), 3 przebiegi na adres: `/`, `/portfel`, `/zalozenia`, `/ustawienia`, `/metodologia`.
Asercje: wydajność ≥ 0,95 (mediana przebiegów) i dostępność ≥ 0,95 (najgorszy przebieg) jako błąd;
best-practices i SEO ≥ 0,9 jako ostrzeżenie. Uruchomienie lokalnie:
`pnpm --filter @sim/web build && CHROME_PATH=/opt/pw-browsers/chromium pnpm lighthouse`.

**PWA:** Lighthouse 13 (wersja z `@lhci/cli` 0.16) nie ma kategorii PWA ani audytów `installable-manifest`/
`service-worker`. Instalowalność sprawdzają zamiast tego: `bundleBudget.test.ts` (manifest: nazwa, `start_url`,
`display: standalone`, ikony PNG 192 i 512 `any` + 512 `maskable`, pliki istnieją, `sw.js` istnieje) oraz e2e
`apps/web/e2e/pwa.spec.ts` (manifest podlinkowany z HTML, ikony PNG o właściwych wymiarach, aktywny service worker).
Ikony PNG generuje `apps/web/scripts/generate-icons.mjs` z `public/icon.svg` (brak ikon PNG wykazał przegląd faz 0-1).

### Wyniki lokalne (sandbox, Chromium headless, profil mobile Lighthouse)

Przed zmianami (JS na starcie 273 kB gzip): `/` 0,94–0,98, `/metodologia` 0,81–0,88 (TBT 490–830 ms, 38 wzorów KaTeX
renderowanych naraz: ok. 1 s układu strony). Pierwsza wersja podziału (jeden chunk dla czterech tras) dała `/zalozenia`
0,92 (LCP 3,0 s przez łańcuch pobrań); po rozbiciu na chunk per trasa: wydajność 0,92–1,00 (mediana ≥ 0,98 na każdym
adresie), dostępność 1,00, best-practices 1,00, SEO 0,91 (TBT 80–170 ms, jeden odosobniony przebieg `/metodologia` 0,92 przy TBT 360 ms; LCP 0,8 s). Poprawki: podział kodu per trasa oraz leniwe
renderowanie wzorów KaTeX (`IntersectionObserver`, margines 800 px; bez niego, np. w jsdom, renderują się od razu).

## Pomiar 10 000 ścieżek × 30 lat × 6 aktywów i podglądu 1000 ścieżek

Budżet (spec 4.14): podgląd 1000 ścieżek < 300 ms; 10 000 ścieżek × 30 lat × 6 aktywów < 2 s na telefonie średniej klasy.

### Emulacja (to NIE jest pomiar na telefonie)

Test `apps/web/e2e/perf-throttled.spec.ts` (profil Pixel 7, CDP `Emulation.setCPUThrottlingRate`, scenariusz z UI:
ETF na świat, S&P 500, Bitcoin, EDO, lokata, złoto, horyzont 30 lat, wpłata 1000 zł/mies., realnie i po podatku)
mierzy czas od kliknięcia „Wynik” do etapu 1000 ścieżek (podgląd) i do 10 000 ścieżek. Czasy zawierają debounce 250 ms.
Środowisko: 4 vCPU współdzielone, Chromium headless, 3 workery (`hardwareConcurrency − 1`). Zmienne `PERF_THROTTLE`
i `PERF_CORES` ustawiają mnożnik CPU i `navigator.hardwareConcurrency`.

| Konfiguracja | podgląd 1000 ścieżek | 10 000 ścieżek | uwagi |
|---|---|---|---|
| CPU ×1, 3 workery | 765–785 ms | 2,25–2,75 s | bez debounce: ok. 0,52 s i 2,0–2,5 s |
| CPU ×4, 3 workery | 1,0–1,25 s | 3,1–3,5 s | |
| CPU ×4, 1 worker (`hardwareConcurrency=2`) | 1,2 s | 5,4 s | |
| CPU ×4, 7 workerów (`=8`) | 1,6 s | 3,7 s | więcej workerów nie pomaga na 4 vCPU |

Profil (CPU ×1, 3 workery): etap 1000 ścieżek: 338–412 ms na workerze (w tym start workera i rozgrzewka JIT ok.
200 ms), etap 4000: 565–607 ms na 1000 ścieżek/worker, etap 10 000: 890–960 ms na 2000 ścieżek/worker. Scalanie wyników
1–15 ms. Przepustowość jednego workera ≈ 0,8 mln ścieżko-miesięcy/s w przeglądarce (≈ 1,36 mln w Node na jednym
wątku bez konkurencji). Główny wątek: po optymalizacji `fanChart` najdłuższe zadanie dla 10 000 ścieżek to ok. 410 ms
przy CPU ×4 (przed: 700 ms).

Wprowadzona optymalizacja: `fanChart` liczył 7 kwantyli kolumny pełnym sortowaniem (161 kolumn × 10 000);
`quantilesSelect` (wybór statystyk pozycyjnych, wynik identyczny co `quantile7`, test na równość bit w bit)
skraca to z ok. 130 do ok. 65 ms (Node).

### Wniosek (do konsultacji)

W emulacji budżet **nie jest spełniony**: podgląd ok. 0,5 s bez debounce (cel 0,3 s) i pełne 10 000 ścieżek ok. 2–2,5 s
już bez throttlingu CPU na 3 workerach (cel 2 s). Emulacja nie rozstrzyga sprawy: CDP spowalnia głównie wątek główny
(workery są spowalniane tylko częściowo), a sandbox ma 4 współdzielone vCPU, więc realny telefon z 6–8 rdzeniami może
wypaść lepiej, a słabszy gorzej. Główne źródła czasu: (1) koszt silnika ≈ 0,44 ms/ścieżkę na workerze, (2) start workera
i rozgrzewka ok. 200 ms w etapie 1, (3) debounce 250 ms wlicza się do „podglądu”. Możliwe kroki, jeśli pomiar na
telefonie potwierdzi przekroczenie (decyzja właściciela): utrzymywać rozgrzane workery między przeliczeniami, mniejszy
pierwszy etap (np. 500 ścieżek), tablice σ(t)/g(t) wspólne dla ścieżek, pominięcie `out.yy`, jak w sekcji „Pomysły na
dalsze przyspieszenie”; WASM wraca zgodnie z [Z-23] dopiero po nieudanym pomiarze na telefonie.

### Do wykonania przez użytkownika: pomiar na realnym telefonie

Pomiaru na fizycznym urządzeniu nie da się wykonać w środowisku agenta. Kroki:

1. Telefon średniej klasy z Androidem (np. klasy Pixel 6a/7a lub Galaxy A5x), Chrome, tryb oszczędzania baterii wyłączony,
   telefon naładowany i chłodny.
2. Zbuduj i udostępnij aplikację (`pnpm --filter @sim/web build && pnpm --filter @sim/web preview --host`) albo użyj
   wdrożenia z Vercel. Podłącz telefon kablem, w Chrome na komputerze otwórz `chrome://inspect` (zdalne debugowanie).
3. W aplikacji dodaj portfel z 6 aktywami (ETF na świat, S&P 500, Bitcoin, EDO, lokata, złoto), plan: horyzont 30 lat,
   wpłata miesięczna 1000 zł.
4. W DevTools (zakładka Console) wklej fragment z `e2e/perf-throttled.spec.ts` (obserwator `[data-testid="quality"]`) albo
   zmierz stoperem czas od dotknięcia „Wynik” do napisu „1 000 przyszłości” (podgląd) i „10 000 przyszłości” (pełny wynik);
   odejmij 250 ms debounce. Powtórz 5 razy i zapisz medianę.
5. Wpisz do tabeli poniżej model telefonu, wersję Chrome i czasy.

| Model telefonu | Chrome | podgląd 1000 (mediana) | 10 000 ścieżek (mediana) | Data |
|---|---|---|---|---|
| _do uzupełnienia przez użytkownika_ | | | | |
