# Plan: symulator przyszłej wartości portfela (BTC + inne aktywa)

Status: **projekt do akceptacji** · wersja 2 · 2026-11-13

> **Dokumenty powiązane.** Normatywna specyfikacja (pełna matematyka, dane ze źródłami, testy):
> `docs/superpowers/specs/2026-11-13-portfolio-simulator-design.md`. Plan implementacji zadanie po
> zadaniu: `docs/superpowers/plans/2026-11-13-portfolio-simulator.md`. Ten plik zawiera audyt
> starego kodu, zasady, skrót modelu, UX i architekturę. Lista zmian względem wersji 1 jest w
> sekcji 10. W razie rozbieżności obowiązuje spec.

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

## 3. Specyfikacja matematyczna silnika (skrót wersji 2)

Pełne wzory, wartości kontrolne i uzasadnienia są w spec, sekcja 4. Znaczniki **[Z-n]** odsyłają
do changelogu w sekcji 10.

### 3.1 Krok czasowy i konwencje

- Krok miesięczny, horyzont do 80 lat, logarytmiczne stopy zwrotu, bez obcinania.
- „Oczekiwany zwrot” to **mediana długookresowego CAGR** `g`; `μ = ln(1+g)/12`. Zmienność `σ` to
  odchylenie rocznej logarytmicznej stopy zwrotu.
- **[Z-1]** Kolejność w miesiącu: (1) zdarzenia kalendarzowe (styczeń: roczna wypłata, limity,
  wygasanie strat; kwiecień: zapłata podatku), (2) przychody do gotówki, (3) wpłaty, wypłaty i
  zdarzenia „z góry”, (4) rebalans, (5) zwroty z TER, (6) inflacja, kursy, reżim i zapis wyników.
- **[Z-2]** Sprzedaż z zyskiem tworzy zobowiązanie płatne w kwietniu. Raportujemy wartość po
  odjęciu zobowiązania oraz wartość „po podatku przy sprzedaży całości” (domyślnie włączona).

### 3.2 Liczby losowe

- xoshiro128\*\* z ziarnem per (ścieżka, czynnik); wynik niezależny od liczby wątków; wspólne
  liczby losowe (CRN) w porównaniach i solverach.
- **[Z-3]** Rozkład normalny przez odwrócenie dystrybuanty (Wichura 1988, AS 241) zamiast Zigguratu
  i generatora gamma: jedno losowanie to jedna liczba ze strumienia.

### 3.3 Grube ogony

- `ε_t = s_t · L z_t` z jedną wspólną skalą `s_t` na miesiąc.
- **[Z-4]** Skala pochodzi z 1024-punktowej tabeli kwantyli rozkładu t (ν = 5 domyślnie),
  znormalizowanej do wariancji dokładnie 1. Surowy t-Student dla log-zwrotów daje nieskończoną
  wartość oczekiwaną ceny (Geweke 2001).
- **[Z-5]** Wspólna skala obejmuje też kursy i inflację, więc korelacje krzyżowe nie są zaniżane
  (w v1 o ok. 8% przy ν = 5).
- Macierz korelacji, która nie jest dodatnio określona, rzutujemy metodą Highama (2002) i
  pokazujemy ostrzeżenie.

### 3.4 Reżimy rynku (RSLN-2)

- Wspólny łańcuch Markowa spokój/kryzys (Hamilton 1989; Hardy 2001), start z rozkładu
  stacjonarnego. `r_i = μ_i + α_i σ_i δ_s + σ_{m,i} κ_{s,i} ε_i`.
- **[Z-6]** Ładunek kryzysowy `α_i` jest względny (mnożony przez `σ_i`), z walidacją udziału
  wariancji `ω_i ≤ 0,8`. Kalibracja pozostaje dokładna także przy zmiennej w czasie zmienności BTC.
- **[Z-7]** Korelacje wewnątrz reżimu są wyliczane tak, żeby **roczna** macierz kowariancji
  równała się wpisanej przez użytkownika.
- **[Z-8]** Usunięte osobne macierze korelacji per reżim (Forbes i Rigobon 2002).
- W modelu z reżimami dokładnie zachowana jest średnia logarytmów, a mediana wartości końcowej
  jest nieco powyżej `W₀(1+g)^T`.
- Tryby: realistyczny (domyślny), podręcznikowy GBM, bootstrap historyczny (rozszerzenie).

### 3.5 Niepewność parametrów

- Każda ścieżka losuje stałe przesunięcie dryfu `N(0, SE²)`.
- **[Z-9]** Przesunięcia są skorelowane między aktywami macierzą korelacji zwrotów.
- **[Z-10]** Wpisany CAGR pozostaje medianą wyniku dla pojedynczego aktywa. Średnia rośnie o
  `exp(SE²T²/2)`, więc UI pokazuje medianę i pasma, a średnią tylko w trybie eksperta.
- **[Z-11]** Niepewna jest też długookresowa średnia inflacji.

### 3.6 Inflacja

- AR(1) na zannualizowanej stopie trendu, indeks CPI per ścieżka, deflacja dozwolona.
- **[Z-12]** Kalibracja do odchylenia i autokorelacji (lag 12) inflacji **r/r** wzorami na sumę
  12 miesięcy, zamiast błędnego `φ_m = φ_a^{1/12}`.
- **[Z-13]** Start od odczytu r/r (3,5% za październik 2026), z 13 poziomami historii indeksu.

### 3.7 Waluty

- **[Z-14]** Realny kurs powraca do średniej (AR(1), półokres 4 lata; Rogoff 1996), a kurs
  nominalny to kurs realny plus różnica inflacji. W v1 realny kurs był błądzeniem losowym.
- Realny zwrot w PLN z aktywa w USD = realny zwrot w USD + zmiana realnego kursu.

### 3.8 Typy aktywów

Aktywo ryzykowne; kryptowaluta (zanik dryfu i zmienności, upadek); lokata (stopa podąża za
inflacją); obligacje stałokuponowe; EDO (partie, indeksacja inflacją r/r z opóźnieniem 2
miesięcy, kapitalizacja roczna, opłata 3,00 zł za przedterminowy wykup); nieruchomość
(„mieszkam” w MVP, „na wynajem” w rozszerzeniach).

- **[Z-15]** Upadek kryptowaluty jest stanem pochłaniającym, a `g` to mediana warunkowa na
  przetrwaniu. Dryfu nie kompensujemy; UI pokazuje osobno szansę upadku do roku T.
- Nakładka potęgowa dla BTC: opcjonalna, domyślnie wyłączona, oznaczona jako kontrowersyjna.

### 3.9 Portfel, rebalans, koszty

Polityki: brak / co rok / progowa / tylko przepływami. Koszty transakcji w punktach bazowych.
Każda pozycja należy do opakowania `taxable | IKE | IKZE` (limity i reguły wypłat w
rozszerzeniach).

### 3.10 Podatki (Polska)

- Papiery wartościowe: 19%, FIFO na partiach, osobno per rachunek.
- **[Z-16]** Straty z papierów: 5 lat, w całości (limit 50% z v1 nie wiąże przez jednorazowe
  odliczenie do 5 mln zł).
- **[Z-17]** Kryptowaluty: bez FIFO; koszty roku plus nadwyżka kosztów z lat poprzednich,
  przenoszona bez limitu czasu.
- **[Z-18]** Forma posiadania zmienia podatek: BTC jako ETP to papier wartościowy; złoto fizyczne
  po pół roku bez PIT.
- Lokaty i obligacje 19% u źródła; najem ryczałt 8,5% / 12,5%; zapłata PIT-38 w kwietniu.

### 3.11 Przepływy

Wpłaty z indeksacją. Wypłaty: stała realna kwota, stały % portfela, amortyzacja (ABW).
Guyton–Klinger przeniesiony do rozszerzeń. Zdarzenia jednorazowe realne lub nominalne.

### 3.12 Śmiertelność (rozszerzenie)

Tablice GUS 2025; `P = Σ_t P̂(ruina w t)·S(t)`.

### 3.13 Statystyki

- Wachlarz percentyli 5–95, kwantyle typu 7, przedziały Wilsona i z statystyk pozycyjnych.
- **[Z-19]** Stałe etapy 1 000 → 4 000 → 10 000 ścieżek zamiast reguły stopu zależnej od wyniku.
- **[Z-20]** Obsunięcia liczone co miesiąc w kernelu na indeksie ważonym czasem.
- **[Z-21]** Solvery: bisekcja po kwocie z CRN, bez założenia ścisłej monotoniczności, ze startem
  z rozwiązania zamkniętego; wynik z przedziałem ufności.

### 3.14 Wydajność

- **[Z-22]** Siatka wyników do 161 punktów, trzy macierze `Float32` (do 48 MB przy 25 000 ścieżek).
- Budżet: 10 000 ścieżek × 30 lat × 6 aktywów < 2 s na telefonie średniej klasy.
- **[Z-23]** Bez planu WASM, dopóki pomiar nie pokaże takiej potrzeby.

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

### 4.2 Wartości domyślne (zestaw `2026.11`, stan weryfikacji na 2026-11-13)

Pełne tabele ze źródłami, URL-ami i statusem każdej liczby: spec, sekcje 6.1–6.5. Skrót:

| Aktywo (waluta) | g (mediana CAGR) | σ | Rodzaj | Najważniejsze źródła |
|---|---|---|---|---|
| Akcje globalne (USD) | 6,5% (5,9–7,5%) | 16% | prognoza | J.P. Morgan LTCMA 2027: 7,5%; Vanguard VCMM 09.2026: ok. 5,9%; AQR 2026: 4,2% realnie |
| Akcje USA (USD) | 6,0% (3,4–7,5%) | 16% | prognoza | JPM 7,5%; Vanguard 4,8–6,8%; AQR 3,9% realnie; RA ok. 3,4% |
| Akcje rynków wschodzących (USD) | 6,5% (4,7–9,1%) | 21% | prognoza | JPM 7,1%; Vanguard 3,7–5,7%; AQR 5,1% realnie |
| Akcje polskie WIG (PLN) | 7,0% | 21% | założenie | niezweryfikowane |
| Obligacje skarbowe PL (PLN) | bieżąca rentowność | 6% | dane | niezweryfikowane |
| EDO (PLN) | rok 1: 5,35%; potem inflacja + 2,00% | — | dane MF | EDO1136, obligacjeskarbowe.pl, zweryfikowane |
| Lokata (PLN) | inflacja − 0,5 pp | — | założenie | niezweryfikowane |
| Złoto (USD) | 4,5% (3,8–5,5%) | 15% | prognoza/dane | JPM 5,5%; DMS: 1,3% realnie od 1900 |
| **BTC (USD), bazowy** | 15% → 5,5% (τ = 7 lat) | 50% → 30% | **założenie** | zmienność zrealizowana 90 dni: 40,5% (obliczenie własne); upadek 1%/rok |
| ETH (USD), bazowy | 12% → 5% | 70% → 40% | **założenie** | upadek 2,5%/rok |
| Inflacja PL | start 3,5% r/r; długookresowo 3,0% ± 0,5 pp | r/r 2,5 pp | dane + założenie | GUS, komunikat z 2026-11-13; cel NBP 2,5% ± 1 pp |
| USD/PLN (realny) | 0 | 11% | założenie | półokres 4 lata; niezweryfikowane |
| Nieruchomości PL | inflacja + 1% + czynsz netto 3,5% | 9% | założenie | niezweryfikowane |

Limity 2026: IKE 28 260 zł, IKZE 11 304 zł (16 956 zł dla działalności). Tablice trwania życia
GUS 2025: dalsze trwanie życia w wieku 60 lat to 20,04 (mężczyźni) i 24,71 (kobiety).

Każdy parametr w kodzie ma metadane
`{value, range, kind, verified, sources[{title, publisher, year, url, accessed}], note}`. UI
pokazuje je w panelu „Założenia i źródła” oraz pod ikoną ⓘ; parametr niezweryfikowany ma
widoczną plakietkę. Scenariusz zapisuje wersję zbioru danych, z którą go policzono.

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
  View Transitions, arkusze dolne (bottom sheets) na telefonie.
- Dostępność **WCAG 2.2 AA**: kontrast, klawiatura, czytniki ekranu, tabelaryczna alternatywa dla
  wykresów, palety bezpieczne dla daltonistów.
- Formatowanie `Intl` pl-PL. Język polski na start, i18n gotowe na angielski.
- Stałe zastrzeżenie: „Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej”.

---

## 6. Architektura techniczna

### 6.1 Stos

- **TypeScript (strict)**, monorepo **pnpm**.
- `apps/web`: **React + Vite**, **Tailwind CSS v4**, prymitywy **Radix UI** (komponenty w stylu
  shadcn/ui), **Zustand** (stan), **Zod** (walidacja i schematy scenariuszy), **Dexie**
  (IndexedDB), **Comlink** (workery), wykresy jako własne SVG na **d3-scale/d3-shape** (pełna
  kontrola, motywy, dostępność, mały rozmiar), **KaTeX**, **Lingui** (i18n),
  **vite-plugin-pwa/Workbox** (offline, instalowalność).
- `packages/engine`: czysty TS bez DOM, uruchamialny w workerze, w Node i kiedyś na serwerze.
- `packages/data`: wersjonowane JSON-y parametrów i źródeł, schematy Zod, skrypty kalibracyjne.
- Jakość: **Vitest** + **fast-check** (testy własności), **Playwright** (e2e), ESLint, Prettier,
  CI na GitHub Actions (lint, typecheck, testy, build, budżet Lighthouse).
- Hosting statyczny na **Vercel** (SPA/PWA bez funkcji serwerowych, `vercel.json` z rewrite i
  nagłówkami; spec, sekcja 8). Brak backendu na tym etapie. Plan Hobby jest niekomercyjny, więc
  przed monetyzacją potrzebny jest plan Pro.

### 6.2 Struktura repozytorium

Normatywna mapa plików jest w planie implementacji (sekcja „Mapa plików”) i w spec, sekcja 5.
Trzy pakiety: `apps/web` (React, workery, zapis lokalny), `packages/engine` (czysty TypeScript:
`rng`, `math`, `linalg`, `models`, `portfolio`, `tax/pl`, `cashflows`, `stats`, `solvers`,
`kernel.ts`, `runner.ts`) i `packages/data` (schematy, zestawy danych, skrypty kalibracyjne).

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

Normatywna tabela testów T1–T10 z kryteriami liczbowymi jest w spec, sekcja 9, a ich miejsce w
kolejności prac w planie implementacji. Skrót:

1. **Generatory (T1):** wektory referencyjne, χ², KS, momenty, niezależność strumieni.
2. **Wzory zamknięte (T2):** mediana i wariancja GBM, `σ = 0`, renta.
3. **Kalibracja (T3):** roczna średnia, zmienność i korelacje równe wejściu w 4 SE dla modelu z
   reżimami i ogonami; inflacja r/r; kurs realny; BTC z zanikiem i upadkiem; niepewność
   parametrów.
4. **Księgowość (T4):** tożsamość przepływów na każdej ścieżce z dokładnością 10⁻⁹.
5. **Podatki (T5):** ręcznie policzone przypadki FIFO, strat, koszyka krypto, lokaty i EDO.
6. **Strategie (T6)** i **własności na CRN (T7)**, **regresja (T8)**, **backtest (T9)**,
   **E2E i wydajność (T10)**.

Tolerancja statystyczna to `4·SE` przy ustalonym ziarnie. Nieudany test kalibracji oznacza błąd
w modelu, a nie powód do poluzowania tolerancji.

---

## 8. Etapy realizacji

| Faza | Zakres | Kryterium ukończenia | Zadania planu |
|---|---|---|---|
| **0. Fundament** | Monorepo, CI, szkielet PWA, konfiguracja nazwy | CI zielone, aplikacja instaluje się i działa offline | 1–2 |
| **1. Dane** | Schematy, zestaw `2026.11`, skrypty kalibracyjne | **Tabela parametrów ze źródłami do akceptacji użytkownika** | 3–4, 14 |
| **2. Silnik: rdzeń** | RNG, matematyka, modele rynku, inflacji i kursów | Testy T1–T3 zielone | 5–13 |
| **3. Przepływy i podatki** | Partie, podatki PL, lokata, EDO, wpłaty i wypłaty, rebalans, kernel, runner, statystyki, solvery | Testy T4–T8 zielone, budżet wydajności w Node | 15–26 |
| **4. UI MVP** | Workery, zapis lokalny, onboarding, plan, dashboard, źródła, uprawnienia, e2e | Pełny przepływ na telefonie i desktopie, e2e zielone | 27–35 |
| **5. Rozszerzenia** | Porównanie scenariuszy, śmiertelność, IKE/IKZE z limitami, najem, Guyton–Klinger, wkład w ryzyko, backtest i bootstrap, metodologia, EN, nakładka potęgowa | Testy funkcji | 36–45 |
| **6. Jakość** | WCAG 2.2 AA, wydajność na telefonie, Lighthouse | Lighthouse ≥ 95 | 46 |
| **7. Wdrożenie na Vercel** | `vercel.json` (rewrite SPA, CSP, cache), dokumentacja wdrożenia | Nagłówki sprawdzone, PWA działa offline z produkcji | 47 |

MVP = fazy 0–4 i 7. **Uwaga:** plan Hobby na Vercel jest tylko do użytku niekomercyjnego, więc
przed monetyzacją potrzebny jest plan Pro. Po każdej fazie: commit i push na gałąź
`claude/pensive-cerf-xu4cnj` oraz krótki raport z wynikami testów.

---

## 9. Decyzje

Rozstrzygnięte przez użytkownika (domyślne, można je zmienić):

1. **Stos:** React + TypeScript (strict) + Vite + Tailwind CSS v4, monorepo pnpm.
2. **Język i waluta:** polski na start, i18n od pierwszego dnia, angielski w fazie 5. Baza PLN,
   opcjonalnie USD i EUR.
3. **IKE/IKZE:** opakowania kont w architekturze od MVP, pełne reguły i limity w fazie 5.
4. **BTC:** trzy zestawy założeń z zanikającym dryfem i ryzykiem upadku. Model potęgowy tylko jako
   opcjonalna nakładka, domyślnie wyłączona, oznaczona jako kontrowersyjna.
5. **ETH:** gotowy preset z większą niepewnością niż BTC.
6. **Nazwa:** robocza, w jednym miejscu konfiguracji. Propozycje: „Wachlarz” (robocza),
   „Horyzont”, „Tysiąc Jutr”.
7. **Hosting:** Vercel, statyczny SPA/PWA bez funkcji serwerowych.

Decyzje domyślne podjęte przy pisaniu wersji 2 (do zmiany przez użytkownika):

- Wartości „po podatku przy sprzedaży całości” są domyślnie włączone.
- Guyton–Klinger i nieruchomość na wynajem są w rozszerzeniach; EDO jest w MVP.
- Usunięte z zakresu: paleta ⌘K, biblioteka Motion, plan WASM, szczegóły licencji JWS i passkeys
  (zostaje rejestr funkcji z `FREE_FOR_ALL = true`).
- Tabele parametrów 4.2 (spec 6.2–6.3) czekają na akceptację po uruchomieniu skryptów
  kalibracyjnych.

---

## 10. Changelog: wersja 2 względem wersji 1

Każda zmiana ma jedno zdanie uzasadnienia i źródło. Pełny opis: spec, sekcja 4.

### Poprawione (błędy w wersji 1)

| # | Zmiana | Uzasadnienie | Źródło |
|---|---|---|---|
| Z-4 | Skala ogonów z ograniczonej tabeli kwantyli zamiast surowego t-Studenta | Dla log-zwrotów o rozkładzie t wartość oczekiwana ceny jest nieskończona, więc średnie z symulacji nie miały sensu. | Geweke 2001, Economics Letters 71 |
| Z-5 | Jedna wspólna skala dla wszystkich czynników (także kursów i inflacji) | Osobny szum czynników spoza grupy t zaniżał korelacje krzyżowe o czynnik `c_ν` (0,92 dla ν = 5). | McNeil, Frey, Embrechts 2015, rozdz. 6 |
| Z-6 | Względny ładunek kryzysowy `α_i σ_i` z walidacją `ω_i ≤ 0,8` | Wzór z v1 dawał ujemną wariancję dla aktywów o niskiej zmienności i nie działał przy zmiennej w czasie zmienności BTC. | Hardy 2001, NAAJ 5(2) |
| Z-7 | Korelacja wewnątrz reżimu wyliczana z korelacji wpisanej | Wspólne przesunięcia średniej dodawały kowariancję, więc korelacje roczne były wyższe niż w formularzu. | Hamilton 1989, Econometrica 57(2) |
| Z-9 | Skorelowana niepewność dryfów | Błąd estymacji średnich ma kowariancję proporcjonalną do kowariancji zwrotów; niezależne losowania zaniżały ryzyko portfela. | Barberis 2000; Pástor i Stambaugh 2012 |
| Z-10 | Jawna semantyka: `g` to mediana; średnia tylko w trybie eksperta | Przy niepewności parametrów średnia rośnie o `exp(SE²T²/2)` i przestaje opisywać typowy wynik. | Pástor i Stambaugh 2012, JF 67(2) |
| Z-12 | Kalibracja inflacji do statystyk r/r wzorami na sumę 12 miesięcy | `φ_m = φ_a^{1/12}` myliło autokorelację średniej ruchomej z autokorelacją procesu miesięcznego. | Box, Jenkins, Reinsel, „Time Series Analysis”, rozdz. 3 |
| Z-13 | Start inflacji od odczytu r/r i 13 poziomów historii | Odczyt miesięczny (−0,4% m/m) dałby absurdalny stan początkowy, a EDO potrzebuje inflacji r/r od pierwszego miesiąca. | GUS, komunikat z 2026-11-13 |
| Z-14 | Realny kurs walutowy powracający do średniej | Błądzenie losowe wokół PPP daje nieograniczoną wariancję realnego kursu, sprzeczną z danymi. | Rogoff 1996, JEL 34(2); Taylor i Taylor 2004 |
| Z-15 | Upadek krypto jako stan pochłaniający; `g` warunkowe na przetrwaniu | V1 nie mówił, czy `g` zawiera ryzyko upadku; kompensacja dryfu zawyżałaby medianę. | Merton 1976, JFE 3 (skoki a dryf) |
| Z-16 | Straty z papierów rozliczane w całości w ciągu 5 lat | Od 2019 r. można jednorazowo odliczyć do 5 mln zł, więc limit 50% nie wiąże. | Art. 9 ust. 3 ustawy o PIT |
| Z-17 | Koszyk krypto bez FIFO i bez wygasania nadwyżki kosztów | Koszty krypto potrąca się w roku poniesienia, a nadwyżka przechodzi dalej bez limitu czasu. | Art. 22 ust. 14–16 ustawy o PIT |
| Z-21 | Solvery bez założenia ścisłej monotoniczności | Z podatkami i progami rebalansu większa wypłata może wyjątkowo poprawić wynik ścieżki. | Glasserman 2004, „Monte Carlo Methods in Financial Engineering”, rozdz. 4 |

### Doprecyzowane lub dodane

| # | Zmiana | Uzasadnienie | Źródło |
|---|---|---|---|
| Z-1 | Kolejność zdarzeń z przepływami „z góry” i kalendarzem podatkowym | V1 nie określał, z czego płaci się podatek ani kiedy ustala się roczną wypłatę. | Waring i Siegel 2015, FAJ 71(1) |
| Z-2 | Rezerwa podatkowa i wartość „po podatku” | 19% od zysków po 30 latach to znacząca część portfela, a v1 pokazywał kwotę przed podatkiem. | Art. 30b ustawy o PIT |
| Z-11 | Niepewność długookresowej inflacji | Różnica 1 pp inflacji przez 30 lat zmienia wartość realną o 25%. | Stock i Watson 2007, JMCB 39 |
| Z-18 | Forma posiadania (krypto natywnie vs ETP; złoto fizyczne vs ETC) | Ten sam zysk jest opodatkowany inaczej zależnie od formy. | Art. 10 ust. 1 pkt 8 lit. d i art. 30b ustawy o PIT |
| Z-20 | Obsunięcia liczone co miesiąc na indeksie ważonym czasem | Rzadsza siatka i wpłaty zaniżały obsunięcia. | Magdon-Ismail i in. 2004, J. Appl. Probab. 41 |
| — | Tabela danych 4.2 ze źródłami i statusem weryfikacji | Wymóg „źródła widoczne w interfejsie” wymaga metadanych per parametr. | Spec 6.1–6.6 |
| — | Faza 7: wdrożenie na Vercel | Decyzja użytkownika; plan Hobby jest niekomercyjny. | vercel.com/docs/limits/fair-use-guidelines |

### Usunięte lub uproszczone

| # | Zmiana | Uzasadnienie | Źródło |
|---|---|---|---|
| Z-3 | Ziggurat i generator gamma zastąpione odwróceniem dystrybuanty i tabelą | Mniej kodu, brak losowań odrzucanych, prostsze CRN. | Wichura 1988, Applied Statistics 37(3) |
| Z-8 | Osobne macierze korelacji per reżim | Wzrost korelacji w kryzysach to w dużej mierze efekt wyższej zmienności; dodatkowych parametrów nie da się wiarygodnie oszacować. | Forbes i Rigobon 2002, JF 57(5) |
| Z-19 | Adaptacyjna reguła stopu zastąpiona stałymi etapami | Zatrzymywanie zależne od wyniku psuje pokrycie przedziałów ufności. | Glynn i Whitt 1992, Ann. Appl. Probab. 2(1) |
| Z-22 | Mniejsza siatka wyników, bez macierzy per aktywo per ścieżka | V1 przekraczał własny budżet 64 MB przy 6 aktywach. | Obliczenie w spec 4.14 |
| Z-23 | Plan WASM | Budżet jest osiągalny w TypeScript; drugi język to koszt bez dowodu potrzeby. | Pomiar w zadaniu 22 planu |
| — | Guyton–Klinger i najem przeniesione do rozszerzeń; paleta ⌘K, Motion, JWS i passkeys usunięte | Mała wartość dla pierwszego wydania względem kosztu testów. | Decyzja domyślna |
