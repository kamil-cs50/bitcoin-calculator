# Plan: symulator przyszłej wartości portfela (BTC + inne aktywa)

Status: **projekt do akceptacji** · wersja 1 · 2026-11-13

Aplikacja webowa (PWA, działa offline) pokazuje rozkład możliwych przyszłych wartości portfela
(BTC, akcje, obligacje, złoto, lokaty, nieruchomości, aktywa własne) w ujęciu realnym i nominalnym,
z uwzględnieniem wpłat, wypłat, inflacji, kursów walut i polskich podatków. Wszystkie obliczenia
wykonuje urządzenie użytkownika. Architektura od początku przewiduje płatną wersję z darmowym
okresem próbnym, ale teraz wszystkie funkcje są darmowe.

Pliki Pythona służą tylko jako kontekst. Nie przenoszę z nich ani jednej linii kodu ani żadnego
parametru bez sprawdzenia.

---

## 1. Audyt dostarczonego kodu: dlaczego wyniki nie mówią prawdy

Poniżej najpoważniejsze błędy. Każdy z nich zmienia wyniki o rzędy wielkości albo sprawia,
że ustawienia nie działają.

### 1.1 `sim_engine.py` + `sim_config.py` + `calculator2.py`

| # | Miejsce | Błąd | Skutek |
|---|---|---|---|
| 1 | `sim_engine.py:199-209` | Rozkład t-Studenta nie jest standaryzowany. Zmienna t(ν=4) ma wariancję ν/(ν−2)=2, a kod mnoży ją bezpośrednio przez σ. | Zmienność każdego aktywa jest zawyżona o √2 ≈ 1,41×. Domyślne 17,5% staje się 24,7%. |
| 2 | `sim_engine.py:303` | `L_sub = L[ix_(idx, idx)]`: wycinek czynnika Cholesky'ego nie jest czynnikiem Cholesky'ego podmacierzy. | Błędne korelacje, gdy aktywa nie są pierwszymi w macierzy. |
| 3 | `sim_config.py:186` vs `calculator2.py:567-569` | Korelacje działają tylko dla nazw angielskich. Domyślny portfel ma nazwy polskie („Akcje Globalne”). | Tryb „correlated” nic nie robi: aktywa są niezależne. |
| 4 | `sim_engine.py:302-305` | Tryb skorelowany zawsze losuje z rozkładu normalnego i ignoruje wybrany rozkład. | Grube ogony znikają po włączeniu korelacji. |
| 5 | `sim_engine.py:342-343` | Model reżimów całkowicie ignoruje zwroty i zmienności wpisane przez użytkownika (używa stałych z `REGIME_PARAMS`), zawsze startuje w hossie i nie jest kalibrowany. | Parametry z formularza są po cichu pomijane. |
| 6 | `sim_engine.py:679-683, 728-730` | Zwrot losowany raz na rok i rozkładany równo na 12 miesięcy. | Brak zmienności w ciągu roku: obsunięcia i ryzyko sekwencji są zaniżone. |
| 7 | `sim_engine.py:217-218` | Rozkład lognormalny ma σ logarytmów równe σ zwrotów prostych (zamiast `ln(1+σ²/(1+m)²)`). | Błędne momenty. |
| 8 | `sim_engine.py:741-745, 782-785` | Przy „inwestuj nadwyżkę” nadwyżka (dochód − koszt) jest dopisywana, a potem cały koszt i tak jest pobierany z kapitału. | Koszt jest liczony dwa razy. |
| 9 | `sim_engine.py:813-816` | Podstawa kosztowa (`total_contributions`) nigdy nie maleje po wypłatach. | Podatek Belki jest zaniżony, a w końcu przestaje być naliczany. |
| 10 | `sim_engine.py:538-549, 607-608` | Zyski kapitałowe są opodatkowane skalą PIT (12/32%), co jest niezgodne z polskim prawem (tam obowiązuje 19% liniowo). System `polish_flat` ignoruje stawkę wpisaną przez użytkownika. | Błędne podatki. |
| 11 | `sim_engine.py:1110-1156` | `build_params_from_dict` pomija `use_stress_test`, `stress_scenario`, `vpw_expected_return`, `gk_initial_rate`. GUI wysyła zwrot VPW w procentach (`calculator2.py:372`), a silnik oczekuje ułamka. | Test stresowy nigdy się nie uruchamia. VPW i Guyton-Klinger zawsze używają wartości domyślnych. |
| 12 | `sim_engine.py:933-935, 1057-1059` | „Ścieżka mediany” jest ponownie symulowana z ziarnem = indeksem w posortowanej liście, a nie oryginalnym ziarnem. | Wykres „mediany” pokazuje losową ścieżkę. |
| 13 | `sim_engine.py:1047` | Każda strategia ma inne liczby losowe (brak wspólnych liczb losowych, CRN). | Porównanie strategii jest zaszumione. Różnice mogą być artefaktem losowania. |
| 14 | `sim_engine.py:1038, 1175` | Liczba symulacji jest dzielona przez 7 dwa razy (z minimami 100/200). | Liczba symulacji jest inna niż wpisana. |
| 15 | `sim_engine.py:978-986` | Mediana i percentyle kapitału liczone są tylko z udanych symulacji. | Błąd przeżywalności: wyniki wyglądają lepiej niż są. |
| 16 | `sim_engine.py:851`, `sim_config.py:10` | Sukces oznacza przetrwanie dokładnie 100 lat. Horyzontu nie da się ustawić. Śmiertelność jest pominięta. | Metryka nie ma związku z życiem użytkownika. |
| 17 | całość | Brak kursów walut. Zwroty w USD (MSCI, S&P, BTC) są traktowane jak zwroty w PLN, a deflator to inflacja w PLN. | Pominięte ryzyko USD/PLN i błędne wartości realne. |
| 18 | `sim_engine.py:660` | Inflacja jest deterministyczna. | Brak niepewności inflacji, czyli najważniejszego ryzyka dla wartości realnej. |
| 19 | `sim_config.py:93-100` | BTC: oczekiwany zwrot 30% przy zmienności 30% przez 100 lat. Historyczna zmienność wynosiła 60–80%, obecnie 40–55%, a dryf nie zanika. | Absurdalnie optymistyczne wyniki. |
| 20 | `sim_config.py:85-92` | Złoto 1971–2023: podane 5,2% p.a. Z cen 35 → ~2060 USD wychodzi ~8% p.a. | Parametr niezgodny z opisanym źródłem. |
| 21 | `sim_config.py:352-361` | Uzupełnianie scenariuszy stresowych modyfikuje listy przy imporcie modułu. Inflacja ze scenariusza nie jest używana w symulacji. | Efekty uboczne, a test stresowy nie działa. |
| 22 | `sim_config.py:50-51` | Skośność i kurtoza są zdefiniowane, ale nigdzie nieużywane. | Pozorna precyzja. |
| 23 | `calculator2.py:729` | `self.after(...)` wywoływane z wątku roboczego (Tkinter nie jest bezpieczny wątkowo). | Losowe awarie GUI. |
| 24 | całość | Mieszkanie jest traktowane jak płynny ETF: co roku rebalansowane i sprzedawane po kawałku na koszty, bez czynszu. | Fikcja ekonomiczna. |

### 1.2 `calculator_other_version.py` („poprawiona” wersja, ma własne poważne błędy)

| # | Miejsce | Błąd | Skutek |
|---|---|---|---|
| 1 | `:279` | `mixed = 0.7·t + 0.3·Z`. | Wariancja wynosi 0,49+0,09=0,58, więc zmienność jest zaniżona o ~24%. Korelacja spada do ~0,3·ρ. |
| 2 | `:285` i inne | `clip(±40%)` miesięcznie. | Obcina krachy i rajdy BTC, co zaburza średnią i ogony. |
| 3 | `:266-283` | Średnia miesięczna liczona jako roczna/12 na zwrotach prostych (mylenie średniej arytmetycznej z geometryczną). | Systematyczny błąd dryfu. |
| 4 | `:329-372` | Długości reżimów losowane w miesiącach (zakresy wyglądają na lata). Mnożniki średnich (1,5/0,3/0,6) nie są normalizowane. | Średnia bezwarunkowa jest inna niż wpisana. |
| 5 | `:423` | Bootstrap: roczny zwrot /12 użyty jako miesięczny zwrot prosty i składany 12×. Lista „MSCI World 1972–2025” nie ma źródła i nie zgadza się z danymi (np. rok 1972: −2,5% w liście, w rzeczywistości ok. +20%). | Zmyślone dane. |
| 6 | `:722-740, 857` | `StochasticInflationModel` nigdy nie jest tworzony (zawsze stała inflacja). Gdyby był, losowałby niezależny szum co miesiąc, bez trwałości. | Niepewność inflacji jest fikcyjna. |

**Wniosek:** obu silników nie da się naprawić łatkami. Silnik piszę od zera, według specyfikacji
z sekcji 3, z testami statystycznymi, które sprawdzają, czy symulacja odtwarza zadane parametry.

---

## 2. Zasady projektu

1. **Prawda przed efektownością.** Domyślnie wyniki są pokazane w realnych (dzisiejszych) złotych.
   Medianę pokazujemy przed średnią i zawsze podajemy rozrzut. Nigdy nie pokazujemy jednej liczby
   jako „prognozy”.
2. **Oddzielamy dane od założeń.** Każdy parametr ma etykietę: *dane historyczne*, *prognoza
   instytucji* albo *założenie modelowe*. Do tego źródło, datę i poziom pewności, widoczne w UI.
3. **Niepewność parametrów jest częścią modelu.** Nie znamy prawdziwego oczekiwanego zwrotu (dla BTC
   prawie wcale), więc każda symulowana przyszłość losuje własną wartość dryfu.
4. **Weryfikowalność.** Każdy model ma testy, które odtwarzają zadane momenty, korelacje i wzory
   zamknięte. UI pokazuje panel „Kontrola modelu”: wejście vs wynik symulacji.
5. **Prosto dla użytkownika, rzetelnie pod spodem.** Tryb prosty ma 3 kroki. Tryb eksperta odsłania
   wszystkie parametry.
6. **Local-first.** Dane użytkownika nie opuszczają urządzenia. Aplikacja działa offline.

---

## 3. Specyfikacja matematyczna silnika

### 3.1 Krok czasowy i konwencje

- Krok **miesięczny**. Horyzont ustawiany przez użytkownika (rok docelowy albo wiek), maks. 80 lat.
- Modelujemy **logarytmiczne stopy zwrotu**: ceny są zawsze dodatnie, więc nie trzeba niczego
  obcinać (`clip`).
- Parametr wejściowy „oczekiwany zwrot” to **średnioroczna stopa geometryczna g (CAGR)**, czyli
  liczba, którą ludzie porównują z historią. Dryf miesięczny to `μ = ln(1+g)/12`. Interfejs
  pokazuje też odpowiadającą jej średnią arytmetyczną `E[R] = exp(12μ + σ²/2) − 1` i tłumaczy różnicę
  („efekt zmienności”).
- Zmienność σ to roczne odchylenie standardowe logarytmicznych stóp zwrotu.
  Skalowanie: `σ_m = σ/√12` (dla modelu z reżimami kalibrujemy dokładniej, patrz 3.4).
- Kolejność zdarzeń w miesiącu (udokumentowana i testowana):
  1. zwroty rynkowe,
  2. opłaty (TER),
  3. przychody z aktywów (czynsz, odsetki),
  4. wpłaty i wypłaty oraz zdarzenia jednorazowe,
  5. rebalans według polityki,
  6. naliczenie zobowiązań podatkowych; zapłata w kwietniu następnego roku (PIT-38).

### 3.2 Generator liczb losowych

- PRNG: **xoshiro128\*\*** (32-bitowy, szybki w JS przez `Math.imul`), ziarna z **SplitMix32**.
- **Strumienie per (ścieżka, czynnik)**: ścieżka *p* i czynnik *k* (aktywo identyfikowane stałym ID,
  inflacja, FX, reżim, mieszanie t) dostają własny strumień `hash(seed, p, k)`. Skutki:
  - wynik nie zależy od liczby wątków (deterministyczny),
  - **wspólne liczby losowe (CRN)** w porównaniach scenariuszy i strategii oraz w solverach,
  - dodanie aktywa nie zmienia losowań pozostałych aktywów.
- Rozkład normalny: algorytm **Ziggurat** (Marsaglia–Tsang 2000 z poprawką Doornika 2005).
  Gamma/χ²: **Marsaglia–Tsang 2000**.

### 3.3 Innowacje: wielowymiarowy t-Student (grube ogony i wspólne krachy)

`ε_t = L·z_t · √((ν−2)/W_t)`, gdzie `z_t ~ N(0, I)`, `W_t ~ χ²_ν` jest **wspólne dla wszystkich
aktywów ryzykownych**, a `L` to czynnik Cholesky'ego macierzy korelacji R.

- Standaryzacja daje Cov(ε) = R dokładnie (inaczej niż w starym kodzie).
- Wspólne W daje **zależność w ogonach**: krachy przychodzą razem, czego model normalny nie potrafi.
- Domyślnie ν = 5 (do kalibracji w Fazie 1 na danych miesięcznych metodą największej
  wiarygodności).

**Macierz korelacji od użytkownika** może nie być dodatnio określona. Wtedy rzutujemy ją na
**najbliższą macierz korelacji** (Higham 2002, naprzemienne rzuty), pokazujemy ostrzeżenie i
macierz po korekcie. Bez cichych fallbacków.

### 3.4 Model rynku: dwa reżimy (RSLN-2) z kalibracją do zadanych momentów

Wspólny dla rynku łańcuch Markowa `s_t ∈ {spokój, kryzys}` (Hamilton 1989; Hardy 2001, standard
aktuarialny dla akcji). Macierz przejść miesięcznych `p₀₁, p₁₀`, rozkład stacjonarny `π`.

Zwrot aktywa i:
`r_{i,t} = μ_i(t) + a_i·δ_{s_t} + σ_{m,i}(t)·κ_{s_t}·ε_{i,t}`, z korelacjami `R_{s_t}`
(w kryzysie korelacje rosną).

- `δ` to przesunięcia średniej o zerowej średniej stacjonarnej (`π₀δ₀ + π₁δ₁ = 0`). Dzięki temu
  **bezwarunkowa średnia log-zwrotu jest dokładnie równa μ_i** wpisanej przez użytkownika.
- `κ` to mnożniki zmienności w reżimach. `σ_{m,i}` wyznaczamy **analitycznie** tak, żeby
  **roczna** wariancja (z autokowariancją wynikającą z trwałości reżimu) równała się σ_i²:
  `Var(S₁₂) = 12σ_m²(π₀κ₀² + π₁κ₁²) + a_i²·π₀π₁(δ₀−δ₁)²·[12 + 2Σ_{k=1}^{11}(12−k)λ^k]`,
  gdzie `λ = 1 − p₀₁ − p₁₀`.
- Start ze stanu stacjonarnego, a nie „zawsze hossa”.
- Kształt reżimów (p₀₁, p₁₀, κ, δ, korelacje kryzysowe) kalibrujemy w Fazie 1 na miesięcznych
  danych akcji globalnych. Punkt odniesienia: Hardy 2001 (p₀₁≈0,04, p₁₀≈0,2).

Modele do wyboru w trybie eksperta:
1. **Realistyczny (domyślny):** RSLN-2 + wielowymiarowy t.
2. **Podręcznikowy (GBM):** log-normalny i.i.d., do porównania i dla przejrzystości.
3. **Bootstrap historyczny** (Faza 5): stacjonarny bootstrap blokowy (Politis–Romano 1994) na
   miesięcznych danych, które licencyjnie wolno dołączyć.

### 3.5 Niepewność parametrów (ryzyko estymacji)

Dla każdej ścieżki losujemy `μ_i^{(p)} ~ N(μ̂_i, SE_i²)`. Niepewność dryfu rośnie z horyzontem
proporcjonalnie do T², a nie do T, więc dla długich horyzontów i BTC jest dominująca
(Barberis 2000; Pástor & Stambaugh 2012).

- Domyślne SE: akcje ≈ σ/√N lat historii, z korektą na rozbieżność prognoz instytucji. BTC: bardzo
  duże.
- W UI jako suwak „Jak pewny jesteś oczekiwanego zwrotu?” z opisem.

### 3.6 Inflacja (Polska, stochastyczna)

AR(1) na zannualizowanej stopie miesięcznej:
`i_t = ī + φ_m(i_{t−1} − ī) + σ_η·η_t`, `φ_m = φ_a^{1/12}`, `η_t` t-Student (szoki typu 2022).

- Start: ostatni odczyt GUS. Poziom długookresowy ī: cel NBP 2,5% ± tolerancja, porównany ze
  średnią historyczną po 2000 r. (Faza 1).
- σ_η kalibrowana tak, żeby **odchylenie inflacji r/r** w stanie stacjonarnym zgadzało się z danymi.
  Test to sprawdza.
- Indeks cen `CPI_t` per ścieżka służy jako deflator wartości realnych, do indeksacji wypłat i wpłat
  oraz do obligacji indeksowanych.
- Korelacja szoków inflacji ze zwrotami obligacji stałokuponowych jest ujemna.

### 3.7 Waluty

- Waluta bazowa: domyślnie PLN (opcjonalnie USD/EUR). Każde aktywo ma walutę notowania.
- `ln(USDPLN)` ma dryf równy różnicy inflacji (względny PPP) i zmienność ~10% p.a. (kalibracja na
  tabelach A NBP). Kurs jest **skorelowany z akcjami**: w kryzysach złoty słabnie, co amortyzuje
  spadki aktywów w USD dla polskiego inwestora.
- Zwrot aktywa w PLN = zwrot lokalny + zmiana kursu. Panel kontroli pokazuje zmienność efektywną
  `√(σ_a² + σ_fx² + 2ρσ_aσ_fx)`.

### 3.8 Typy aktywów

| Typ | Model |
|---|---|
| Akcje / ETF / złoto / aktywo własne | Ogólne aktywo ryzykowne (3.3–3.5), TER pobierany miesięcznie jako `(1−TER)^{1/12}`. |
| **Bitcoin** (i opcjonalnie ETH) | Ogólne aktywo + **zanikający dryf i zmienność**: `μ(t) = μ_∞ + (μ_0−μ_∞)e^{−t/τ}`, to samo dla σ. Uzasadnienie empiryczne: 4-letnie CAGR BTC maleją z cyklu na cykl (≈2013→17: ~100%/r, 2017→21: ~35%/r, 2021→25: ~20%/r; do weryfikacji na danych). Dodatkowo **ryzyko upadku**: zdarzenie Poissona z intensywnością h/rok, które mnoży wartość przez np. 0,05 (założenie modelowe, wyraźnie oznaczone). Trzy zestawy założeń: pesymistyczny / bazowy / optymistyczny. |
| Lokata / konto oszczędnościowe | Oprocentowanie podąża za inflacją z opóźnieniem: `d_t = d_{t−1} + k(i_t + s − d_{t−1})`, z podłogą 0. Belka od odsetek przy kapitalizacji. |
| Obligacje skarbowe stałokuponowe / globalne | Oczekiwany zwrot ≈ bieżąca rentowność do wykupu (najlepszy znany predyktor zwrotu w horyzoncie duration). Zmienność zależna od duration. Ujemna korelacja z szokami inflacji. |
| **Obligacje EDO** (indeksowane, 10 lat) | Rok 1 ze stałym oprocentowaniem, dalej inflacja (z opóźnieniem zgodnym z listem emisyjnym) + marża, kapitalizacja roczna, rolowanie po wykupie, opłata za przedterminowy wykup. Parametry z aktualnego listu emisyjnego MF (do weryfikacji). |
| Nieruchomość | Wybór: *mieszkanie, w którym mieszkam* (poza portfelem inwestycyjnym, wliczane tylko do majątku netto) albo *na wynajem*: wzrost ceny (zmienność po „odgładzeniu” indeksu, Geltner) + czynsz netto jako przepływ (ryczałt 8,5%/12,5%). Aktywo **niepłynne**: bez rebalansu i bez częściowej sprzedaży, tylko zdarzenie „sprzedaż w roku X”. |

### 3.9 Portfel, rebalans, koszty transakcyjne

- Polityki rebalansu: brak / co rok / progowa (pasmo ±X pp lub ±Y% względnie) / tylko przepływami
  (wpłaty dokupują niedoważone aktywa, wypłaty sprzedają przeważone, bez dodatkowego podatku).
- Koszt transakcji per aktywo (spread i prowizja, w punktach bazowych).
- Każda sprzedaż przechodzi przez moduł podatkowy (3.10). Rebalans ma więc realny koszt podatkowy
  i UI to pokazuje.

### 3.10 Podatki (Polska; moduł wymienny)

- **Papiery wartościowe:** 19% od dochodu, **FIFO na partiach zakupu** (art. 24 ust. 10 ustawy o
  PIT). Strata rozliczana przez 5 lat, maks. 50% w roku (wariant konserwatywny).
- **Kryptowaluty:** osobny „koszyk” (art. 22 ust. 14–16): koszty zakupu się kumulują, a nadwyżka
  kosztów przechodzi na kolejne lata. Strat z krypto nie łączymy z papierami.
- Odsetki z lokat: 19% przy kapitalizacji. Najem: ryczałt.
- **IKE / IKZE** jako opakowania kont: zwolnienie z Belki lub odliczenie i 10% przy wypłacie, z
  rocznymi limitami. Szczegóły i aktualne limity do weryfikacji w Fazie 1.
- Zapłata podatku w kwietniu następnego roku (przepływ pieniężny w symulacji).
- Tryb „bez podatków” i „stawka ogólna” dla użytkowników spoza PL.

### 3.11 Przepływy: wpłaty, wypłaty, zdarzenia

- Wpłaty miesięczne: kwota, rok końca, indeksacja (inflacja, inflacja + realny wzrost płac lub brak).
- Wypłaty od roku X, strategie zaimplementowane zgodnie z publikacjami:
  1. **Stała realna kwota** (np. koszty życia indeksowane symulowaną inflacją).
  2. **Stały % portfela** (liczony raz w roku, wypłacany co miesiąc).
  3. **Guyton–Klinger 2006** w pełnej wersji: reguła wypłaty, reguła ochrony kapitału (nie stosujemy
     jej w ostatnich 15 latach), reguła dobrobytu, limit indeksacji.
  4. **Amortyzacja (ABW/VPW)**: roczna rata `PMT(r, n, W)`, gdzie `r` to **oczekiwany realny zwrot
     tego portfela z modelu** (a nie stałe 4,5%), a `n` to pozostały horyzont. Opcjonalna podłoga i
     sufit.
- Zdarzenia jednorazowe w realnych albo nominalnych złotych z datą (zakup mieszkania, spadek).
- Kolejność źródeł wypłaty: gotówka, potem aktywa przeważone (minimalizacja podatku i rebalans).

### 3.12 Śmiertelność

Opcjonalnie wiek i płeć. Tablice trwania życia GUS (najnowsze). Prawdopodobieństwo wyczerpania
środków **za życia** liczymy analitycznie: `P = Σ_t f_ruin(t)·S(t)` (rynki są niezależne od
śmiertelności), więc bez szumu losowania. Możliwa korekta kohortowa (Faza 5).

### 3.13 Statystyki i wyniki

- **Wachlarz (fan chart):** percentyle 5/10/25/50/75/90/95 wartości realnej i nominalnej w każdym
  punkcie czasu (kwantyle typu 7 wg Hyndmana–Fana). To pasma punktowe, a nie „ścieżka mediany”.
  Opcjonalnie kilka **prawdziwych przykładowych ścieżek** dobranych według kwantyla wartości
  końcowej, wyraźnie podpisanych.
- Rozkład wartości w wybranym roku (histogram), mediana i średnia z objaśnieniem różnicy.
- Prawdopodobieństwo osiągnięcia celu (realna kwota do daty), prawdopodobieństwo realnej straty,
  prawdopodobieństwo wyczerpania środków (za życia).
- Ryzyko: rozkład maksymalnego obsunięcia, najgorszy 12-miesięczny okres, CVaR 5%.
- Rozkład CAGR (TWR, realny) portfela.
- **Wkład aktywów w ryzyko** (dekompozycja Eulera `RC_i = w_i(Σw)_i/σ_p²`), np. „BTC to 10%
  wartości i 55% ryzyka”.
- Faza wypłat: wachlarz realnych wydatków i lata poniżej podłogi.
- **Solvery (z CRN, bisekcja):** „Ile mogę bezpiecznie wypłacać przy P(sukces) ≥ 90%?” i „Ile muszę
  wpłacać, żeby osiągnąć cel z prawdopodobieństwem X?”. CRN gwarantuje monotoniczność, więc
  bisekcja jest poprawna.
- **Dokładność symulacji:** przedział Wilsona dla prawdopodobieństw, nieparametryczny przedział
  ufności dla kwantyli (statystyki pozycyjne). Adaptacyjna liczba ścieżek: kończymy, gdy połowa
  szerokości przedziału < 0,5 pp. UI wyjaśnia, że to błąd losowania, a nie błąd modelu.
- **Niepewność modelu** pokazujemy osobno: przełącznik zestawów założeń
  (pesymistyczny/bazowy/optymistyczny) i porównanie scenariuszy na wspólnych liczbach losowych.

### 3.14 Wydajność

- Pula Web Workerów (`navigator.hardwareConcurrency − 1`), Comlink, wyniki jako `Transferable`
  `Float32Array`.
- Pętla per ścieżka (stan zależny od ścieżki: partie FIFO, strategie) na prealokowanych tablicach
  typowanych, bez alokacji w pętli.
- **Wyniki progresywne:** najpierw ~1 000 ścieżek (natychmiastowy podgląd), potem doliczanie do
  dokładności docelowej. Anulowanie przy zmianie parametrów (debounce ~250 ms).
- Siatka zapisu: miesięcznie do 20 lat, rzadziej dalej (≤ 241 punktów). Per aktywo rocznie. Budżet
  pamięci ≤ 64 MB, na telefonach mniej ścieżek.
- Cel: 10 000 ścieżek × 30 lat × 6 aktywów w < 1,5 s na średnim telefonie (pomiar w Fazie 6).
  Gdyby się nie udało, kernel przenosimy do WASM (Rust) bez zmiany API.

---

## 4. Dane domyślne i źródła

### 4.1 Metodologia

- Akcje i obligacje: **konsensus długoterminowych prognoz instytucji** (J.P. Morgan LTCMA,
  Vanguard VCMM, BlackRock, AQR, Research Affiliates; najnowsze edycje). Uwzględniają bieżące wyceny,
  np. wysoki CAPE w USA. Druga opcja do porównania: **średnie historyczne** (Dimson–Marsh–Staunton /
  UBS Global Investment Returns Yearbook; Jordà i in. 2019 „The Rate of Return on Everything”;
  Shiller).
- Zmienności i korelacje: estymowane przez nas z danych miesięcznych (okno opisane w UI),
  ze skurczeniem **Ledoita–Wolfa**. Korelacje BTC z akcjami zmieniają się w czasie (≈0 przed 2020,
  ≈0,3–0,5 później), więc reżim kryzysowy ma wyższe korelacje.
- BTC: zmienność zrealizowana i jej trend z danych dziennych. Dryf to **założenie** z trzema
  wariantami i zanikiem (3.8). Model potęgowy (power law) **tylko** jako opcjonalna, wyraźnie
  oznaczona nakładka „model kontrowersyjny” (pokazuję go wyłącznie po Twojej akceptacji).
  Stock-to-Flow świadomie pomijamy (model obalony po 2021).
- Polska: GUS (CPI, tablice trwania życia), NBP (cel inflacyjny, stopy, tabele kursów A, baza cen
  nieruchomości mieszkaniowych), MF (listy emisyjne obligacji detalicznych), GPW (WIG).
- **Licencje:** do aplikacji płatnej dołączamy tylko **statystyki pochodne** i cytowania. Surowych
  szeregów z restrykcyjną licencją nie dołączamy (np. CoinMetrics Community: CC BY-NC; LBMA/IBA:
  ceny złota; MSCI). Skrypty kalibracyjne leżą w repo, a surowe dane pobiera się lokalnie.

### 4.2 Wstępne wartości (rząd wielkości; **każda do weryfikacji i zatwierdzenia w Fazie 1**)

| Aktywo (waluta) | g (CAGR) | σ | Rodzaj | Uwagi |
|---|---|---|---|---|
| Akcje globalne MSCI ACWI (USD) | ~6,5–7,5% | ~15–16% | prognoza | historycznie (DMS, świat) ~8% nominalnie USD |
| Akcje USA S&P 500 (USD) | ~5,5–7% | ~16–17% | prognoza | prognozy niższe od historii przez wyceny |
| Akcje rynków wschodzących (USD) | ~7–8% | ~20–22% | prognoza | |
| Akcje polskie WIG (PLN) | ~7–8% | ~20–23% | hist. + założenie | krótka historia, duża niepewność |
| Obligacje skarbowe PL stałokuponowe (PLN) | ≈ bieżąca YTM | ~5–6% | dane rynkowe | |
| EDO (PLN) | inflacja + marża | — | list emisyjny | |
| Lokata (PLN) | inflacja − ~0,5 pp | ~0 | założenie | |
| Złoto (USD) | ~4–6% | ~15–16% | prognoza/hist. | 1971–2024 ~8% |
| **BTC (USD), bazowy** | start ~15–20% → ~5–6% (τ≈6–8 lat) | start ~45–55% → ~30% | **założenie** | h upadku ~1%/rok, bardzo duże SE |
| Inflacja PL | ī ~2,5–3,0% | σ r/r ~2 pp | dane GUS/NBP | φ_a ~0,7–0,8 |
| USD/PLN | dryf ≈ różnica inflacji | ~10% | dane NBP | ρ z akcjami ~ −0,3 |
| Nieruchomości PL | inflacja + ~1% + czynsz netto ~3–4% | ~8–10% | Jordà i in., NBP | |

Każdy parametr w kodzie ma metadane:
`{wartość, zakres w źródłach, rodzaj, pewność, źródła[{tytuł, wydawca, rok, URL, data dostępu}], notatka}`.
UI pokazuje je w panelu „Założenia i źródła” oraz w ikonie ⓘ przy każdym polu. Zbiór danych jest
wersjonowany (`dataset 2026.11`), a scenariusz zapisuje wersję, z którą go policzono.

---

## 5. UX / UI

### 5.1 Przepływ

1. **Start (3 kroki, ~60 s):**
   - (a) *Co masz?* Kafelki aktywów (BTC, ETF na świat, S&P 500, obligacje EDO, lokata, złoto,
     mieszkanie, własne). Kwota w PLN **albo w jednostkach** („0,35 BTC”) z ceną wpisaną ręcznie lub
     pobraną, gdy jest sieć (NBP API dla kursów i złota, publiczne API cen krypto). Działa też offline
     z ostatnią znaną ceną.
   - (b) *Plan:* wpłaty i wypłaty, horyzont lub wiek, opcjonalny cel.
   - (c) *Wynik.*
2. **Dashboard** (siatka „bento”, mobile-first):
   - Pasek górny: nazwa scenariusza, przełącznik **Realnie / Nominalnie**, waluta, motyw.
   - Kafelki KPI: „Typowy wynik za N lat (w dzisiejszych zł)”, „W 8 na 10 przyszłości między X a Y”,
     „Szansa na cel”, „Ryzyko spadku o ponad 30%”.
   - Wachlarz z suwakiem czasu: przeciągasz rok, wszystkie kafelki się aktualizują. Tooltip w języku
     naturalnym („w 9 na 10 scenariuszy więcej niż …”).
   - Karta **„Bitcoin: rozkład ceny w roku X”** (percentyle ceny BTC w USD i PLN).
   - Struktura portfela w czasie, wkład w ryzyko, „Ile mogę bezpiecznie wydawać?”.
   - Plakietka jakości: „10 000 przyszłości · dokładność ±0,4 pp · model skalibrowany ✓”.
3. **Porównanie** do 3 scenariuszy obok siebie (np. „z 10% BTC” vs „bez BTC”) na wspólnych liczbach
   losowych.
4. **Założenia i źródła:** każdy parametr z wartością, źródłem, rodzajem, pewnością i przyciskiem
   „przywróć domyślne”.
5. **Metodologia:** prosty opis + aneks techniczny ze wzorami (KaTeX).
6. **Ustawienia:** język, waluta, eksport i import JSON, link do scenariusza (stan skompresowany w
   URL, bez serwera), reset.

### 5.2 Zasady

- Stopniowe odsłanianie: tryb prosty domyślnie, **tryb eksperta** jako przełącznik.
- Komunikacja ryzyka w **częstościach naturalnych** („w 8 na 10 przyszłości”, Gigerenzer) zamiast
  „P=0,8”. Bez fałszywej precyzji: w długich horyzontach zaokrąglamy do 2 cyfr znaczących.
- Żargon schowany: zamiast „Monte Carlo” piszemy „10 000 możliwych przyszłości”.
- Natychmiastowa odpowiedź: wyniki progresywne, skeletony, mikroanimacje (z poszanowaniem
  `prefers-reduced-motion`).
- Trendy 2025–26 stosowane z umiarem: bento, duże cyfry tabelaryczne, tryb ciemny i jasny,
  View Transitions, ⌘K dla zaawansowanych, arkusze dolne (bottom sheets) na telefonie.
- Dostępność **WCAG 2.2 AA**: kontrast, klawiatura, czytniki ekranu, tabelaryczna alternatywa dla
  wykresów, palety bezpieczne dla daltonistów.
- Formatowanie `Intl` pl-PL. Język polski na start, i18n gotowe na angielski.
- Stałe zastrzeżenie: „Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej”.

---

## 6. Architektura techniczna

### 6.1 Stos

- **TypeScript (strict)**, monorepo **pnpm**.
- `apps/web`: **React + Vite**, **Tailwind CSS v4**, prymitywy **Radix UI** (komponenty w stylu
  shadcn/ui), **Motion**, **Zustand** (stan), **Zod** (walidacja i schematy scenariuszy), **Dexie**
  (IndexedDB), **Comlink** (workery), wykresy jako własne SVG na **d3-scale/d3-shape** (pełna
  kontrola, motywy, dostępność, mały rozmiar), **KaTeX**, **Lingui** (i18n),
  **vite-plugin-pwa/Workbox** (offline, instalowalność).
- `packages/engine`: czysty TS bez DOM, uruchamialny w workerze, w Node i kiedyś na serwerze.
- `packages/data`: wersjonowane JSON-y parametrów i źródeł, schematy Zod, skrypty kalibracyjne.
- Jakość: **Vitest** + **fast-check** (testy własności), **Playwright** (e2e), ESLint, Prettier,
  CI na GitHub Actions (lint, typecheck, testy, build, budżet Lighthouse).
- Hosting statyczny (np. Cloudflare Pages). Brak backendu na tym etapie.

### 6.2 Struktura repozytorium

```
apps/web/src/
  app/            routing, layout, motywy
  features/       onboarding, portfolio, plan, results, compare, assumptions, methodology, settings
  components/ui/  system projektowy (tokeny, przyciski, karty, pola, arkusze)
  charts/         FanChart, Histogram, AllocationDonut, RiskBar, PricePercentiles, Sparkline
  workers/        sim.worker.ts, pool.ts (podział ścieżek, progres, anulowanie)
  state/          store'y, persystencja (Dexie), migracje schematu
  entitlements/   rejestr funkcji i planów (teraz wszystko darmowe)
  i18n/
packages/engine/src/
  rng/            xoshiro128**, splitmix32, ziggurat, gamma, chi2, studentT
  linalg/         cholesky, nearestCorrelation (Higham), utils
  models/         inflationAR1, fx, regimeRS2 (+kalibracja), riskyAsset, btcDecay+jump,
                  deposit, edoBond, fixedBond, realEstate, paramUncertainty
  portfolio/      holdings, lotsFIFO, rebalancePolicies, transactionCosts
  tax/pl/         securitiesFIFO, cryptoPool, lossCarryForward, deposits, rental, ike, ikze
  cashflows/      contributions, withdrawals (fixedReal, percent, guytonKlinger, abw), events
  kernel.ts       symulacja jednej ścieżki
  runner.ts       partie ścieżek, CRN, siatka zapisu
  stats/          quantiles, wilson, quantileCI, drawdown, cagr, histogram, riskContribution, mortality
  solvers/        safeWithdrawal, requiredContribution
  calibration/    kontrola momentów (używana w testach i w panelu UI)
packages/data/
  assets.json, correlations.json, regimes.json, inflation.json, fx.json, lifeTables.json,
  taxPL.json, sources.json, CHANGELOG.md, scripts/
docs/
  PLAN.md, METHODOLOGY.md, DATA_SOURCES.md, adr/
```

### 6.3 Gotowość na wersję płatną (bez blokowania czegokolwiek teraz)

- **Rejestr funkcji** `features.ts` (np. `compare`, `solver.safeWithdrawal`, `paths.max`,
  `export.pdf`) i macierz planów `free / trial / pro`. Flaga `FREE_FOR_ALL = true`. Jeden komponent
  `<Gate feature=…>` i hook `useEntitlement()`, bez rozproszonych `if`-ów.
- **Licencja offline (później):** podpisany token JWS (Ed25519) z `plan`, `trialEndsAt`, `exp`.
  Aplikacja weryfikuje go lokalnie kluczem publicznym, z okresem łaski offline. Uczciwie: przy
  obliczeniach po stronie klienta blokada jest do obejścia. Wartość płatnej wersji powinna więc
  wynikać z aktualizacji danych i założeń, synchronizacji, raportów PDF i porównań, a nie z
  „zamka”.
- Płatności później przez dostawcę typu **Merchant of Record** (np. Paddle albo Lemon Squeezy:
  rozlicza VAT UE za Ciebie). Konta: passkeys.
- Prawne przed monetyzacją: regulamin, polityka prywatności (RODO; teraz nic nie zbieramy), prawo
  odstąpienia dla treści cyfrowych, konsultacja, żeby narzędzie nie było „rekomendacją
  inwestycyjną” w rozumieniu MAR/KNF.
- Migracje schematu danych od wersji 1, żeby scenariusze użytkowników przetrwały aktualizacje.

---

## 7. Strategia weryfikacji („czy to mówi prawdę?”)

1. **Generatory:** momenty, testy KS i χ² (normalny, gamma, t), niezależność strumieni, powtarzalność
   ziarna.
2. **Wzory zamknięte:** GBM, czyli mediana `W₀(1+g)^T` i rozkład lognormalny wartości końcowej (w
   granicach błędu MC); σ=0 daje dokładne składanie z opłatami; renta (PMT) zgodna z arkuszem.
3. **Kalibracja modeli:** dla każdego modelu (GBM, RS-2+t, BTC z zanikiem) roczna średnia
   log-zwrotów, roczna zmienność i korelacje zgadzają się z wejściem w ±2 SE. Inflacja: średnia,
   odchylenie r/r i autokorelacja. FX: efektywna zmienność w PLN.
4. **Księgowość:** na każdej ścieżce `W_end = W_start·wzrost + wpłaty − wypłaty − podatki − opłaty −
   koszty` z dokładnością 1e-9.
5. **Podatki:** ręcznie policzone przypadki FIFO, koszyka krypto, przenoszenia strat 50%/5 lat,
   IKE/IKZE.
6. **Strategie:** testy reguł Guytona–Klingera na przykładach z publikacji; stały % nigdy nie
   wyczerpuje portfela.
7. **Testy własności (fast-check, CRN):** większa wypłata nie zwiększa P(sukces); większa wpłata
   przesuwa rozkład w prawo; dodanie aktywa nie zmienia losowań pozostałych.
8. **Testy regresyjne** z ustalonym ziarnem (zmiana wyniku wymaga świadomej aktualizacji).
9. **Backtest (Faza 5):** porównanie rozkładów 10/20-letnich zwrotów z modelu z historycznymi oknami
   (dane Shillera, akcje USA od 1871).
10. **E2E i wydajność:** Playwright na telefonie i desktopie, budżety czasu i pamięci.

---

## 8. Etapy realizacji

| Faza | Zakres | Kryterium ukończenia |
|---|---|---|
| **0. Fundament** | Monorepo, CI, lint, tokeny designu, szkielet PWA, `docs/adr` | `pnpm test` i build zielone w CI, aplikacja instaluje się i działa offline |
| **1. Dane i kalibracja** | Research źródeł, skrypty kalibracyjne (σ, korelacje Ledoit–Wolf, reżimy, ν, inflacja AR(1), FX, trend zmienności BTC), `sources.json`, `DATA_SOURCES.md` | **Przekazuję Ci tabelę parametrów ze źródłami do akceptacji** |
| **2. Silnik: rdzeń** | RNG, algebra liniowa, modele 3.3–3.8, kernel, runner z CRN, statystyki | Wszystkie testy kalibracji (pkt 7.1–7.4) zielone, budżet wydajności spełniony w Node |
| **3. Przepływy i podatki** | Wpłaty, 4 strategie wypłat, zdarzenia, rebalans, podatki PL (FIFO, krypto, straty), solvery | Testy 7.5–7.8 zielone |
| **4. UI MVP** | Onboarding, portfel (kwoty i jednostki), plan, dashboard (KPI, wachlarz, histogram, karta BTC), panel „Założenia i źródła”, workery z wynikami progresywnymi, zapis lokalny | Pełny przepływ na telefonie i desktopie, e2e zielone |
| **5. Rozszerzenia** | Porównanie scenariuszy, wkład w ryzyko, śmiertelność GUS, IKE/IKZE, nieruchomości na wynajem, EDO, bootstrap historyczny, metodologia z wzorami, backtest, wersja EN, opcjonalna nakładka power law | Testy funkcji, przegląd metodologii |
| **6. Jakość i wydanie** | Audyt WCAG 2.2 AA, wydajność na realnym telefonie, Lighthouse, warstwa uprawnień (`FREE_FOR_ALL`), wdrożenie statyczne | Lighthouse ≥ 95 (wydajność i dostępność), brak błędów krytycznych |

MVP = fazy 0–4. Po każdej fazie: commit i push na gałąź `claude/pensive-cerf-xu4cnj` oraz krótki
raport z wynikami testów.

---

## 9. Decyzje do potwierdzenia

1. **Stos:** React + TypeScript + Vite + Tailwind (rekomendacja ze względu na ekosystem i przyszłe
   zatrudnienie) czy coś innego (np. Svelte)?
2. **Waluta i język:** PLN jako baza i polski interfejs na start, angielski w Fazie 5. Czy angielski
   ma być od razu?
3. **Podatki w MVP:** pełne polskie zasady (FIFO, koszyk krypto, straty) w Fazie 3, a IKE/IKZE w
   Fazie 5. Czy IKE/IKZE mają być w MVP?
4. **BTC:** domyślnie trzy zestawy założeń z zanikającym dryfem i ryzykiem upadku. Czy dodać
   opcjonalną, wyraźnie oznaczoną nakładkę „model potęgowy (power law)”?
5. **Inne kryptowaluty:** tylko BTC, czy też ETH jako gotowe aktywo (z jeszcze większą
   niepewnością)?
6. **Nazwa aplikacji** (do UI, PWA i przyszłej domeny): masz propozycję?
