# Symulator przyszłej wartości portfela: spec projektu (v2)

Data: 2026-11-13 · Status: do akceptacji użytkownika · Zastępuje sekcje 3, 4.2, 8 i 9 z
`docs/PLAN.md` w wersji 1. W razie rozbieżności między dokumentami obowiązuje ten spec.

Decyzje oznaczone **[D]** pochodzą od użytkownika (sekcja DECYZJE zlecenia). Decyzje oznaczone
**[DD]** to „decyzja domyślna (do zmiany przez użytkownika)”: podjąłem je sam, bo w tej sesji nikt
nie odpowiadał na pytania.

---

## 1. Intencja

Aplikacja webowa (PWA, responsywna, offline) pokazuje **rozkład** możliwych przyszłych wartości
portfela (BTC, akcje, obligacje w tym EDO, złoto, lokaty, nieruchomości, aktywa własne) na
przestrzeni lat, w złotych realnych i nominalnych, po polskich podatkach. Wszystkie obliczenia
wykonuje urządzenie użytkownika w Web Workerach.

Po co: stary kalkulator w Pythonie (audyt w `docs/PLAN.md`, sekcja 1) pokazywał wyniki błędne o
rzędy wielkości. Użytkownik chce narzędzia, które **mówi prawdę**: pokazuje rozrzut zamiast jednej
liczby, uczciwie traktuje niepewność (zwłaszcza BTC), a każde założenie ma widoczne źródło.

### Cele

1. Silnik symulacji, którego każdy model przechodzi testy statystyczne odtwarzania zadanych
   parametrów (sekcja 9).
2. Interfejs prosty: 3 kroki do pierwszego wyniku, tryb eksperta na żądanie.
3. Parametry domyślne z cytowanych źródeł, z datą dostępu i etykietą rodzaju, widoczne w UI.
4. Działanie offline, dane użytkownika wyłącznie na urządzeniu.
5. Architektura gotowa na wersję płatną z okresem próbnym. Teraz wszystko jest darmowe.

### Nie-cele (świadomie poza zakresem)

- Rekomendacje inwestycyjne, optymalizacja portfela, „najlepsza alokacja”.
- Konta użytkowników, backend, synchronizacja, płatności (dopiero przed monetyzacją).
- Kredyt hipoteczny i dźwignia, opcje, instrumenty pochodne.
- Ścieżki docelowej alokacji zmienne w czasie (glidepath).
- Dywidendy z podatkiem u źródła i rozliczeniem zagranicznego WHT (aktywa traktujemy jak
  akumulujące; opcjonalna stopa dywidendy z 19% to rozszerzenie).
- Przenoszenie kodu lub parametrów ze starego Pythona.

### Anty-cele (porażka, nawet gdyby działało)

- Jedna liczba pokazana jako „prognoza”.
- Wynik, który cicho ignoruje ustawienie użytkownika albo cicho poprawia dane wejściowe.
- Parametr bez źródła i etykiety (dane / prognoza instytucji / założenie).
- Fałszywa precyzja (np. „P = 87,34%” przy błędzie losowania ±1 pp).
- Jakikolwiek ruch sieciowy z danymi portfela użytkownika.

---

## 2. Ograniczenia i decyzje stałe

- **[D]** Stos: React + TypeScript (strict) + Vite + Tailwind CSS v4, monorepo pnpm.
- **[D]** Język polski na start, i18n od pierwszego dnia (Lingui), angielski w fazie rozszerzeń.
  Waluta bazowa PLN, opcjonalnie USD i EUR.
- **[D]** IKE/IKZE: architektura „opakowań kont” od MVP, pełne reguły i limity w fazie rozszerzeń.
- **[D]** BTC: trzy zestawy założeń z zanikającym dryfem i ryzykiem upadku. Model potęgowy tylko
  jako opcjonalna nakładka, domyślnie wyłączona, oznaczona jako kontrowersyjna.
- **[D]** ETH: gotowy preset z większą niepewnością niż BTC.
- **[D]** Nazwa robocza w jednym miejscu konfiguracji (`apps/web/src/app/appConfig.ts`).
  Propozycje: **„Wachlarz”** (od wykresu wachlarzowego, sedna aplikacji), **„Horyzont”**,
  **„Tysiąc Jutr”**. **[DD]** Nazwa robocza: „Wachlarz”.
- **[D]** Hosting: Vercel, statyczny SPA/PWA bez funkcji serwerowych. Plan Hobby jest ograniczony
  do użytku niekomercyjnego, więc przed monetyzacją wymagany jest plan Pro
  (źródło: https://vercel.com/docs/limits/fair-use-guidelines, dostęp 2026-11-13).
- Obliczenia wyłącznie po stronie klienta. Brak analityki zbierającej dane portfela.
- Dostępność WCAG 2.2 AA. Formatowanie `Intl` pl-PL.
- Stałe zastrzeżenie w UI: „Symulacja edukacyjna, nie stanowi rekomendacji inwestycyjnej”.

---

## 3. Podejścia

Rozważyłem trzy sposoby zbudowania silnika.

| Podejście | Zalety | Wady | Decyzja |
|---|---|---|---|
| **A. Parametryczny Monte Carlo w TypeScript** (reżimy + grube ogony + niepewność parametrów), pętla per ścieżka w workerach | Pełna kontrola nad podatkami i przepływami zależnymi od ścieżki, testowalny wzorami zamkniętymi, działa offline, jeden język | Wymaga starannej kalibracji i testów statystycznych | **Wybrane** |
| B. Bootstrap historyczny jako model główny | Mało założeń o rozkładzie | Brak historii dla BTC i krótkie dla PLN, problemy licencyjne z danymi, nie da się wpisać własnych oczekiwań | Odrzucone jako główne. Zostaje jako opcjonalny model porównawczy w fazie rozszerzeń |
| C. Kernel w Rust/WASM od początku | Szybszy o 2–4× | Drugi język i łańcuch narzędzi, trudniejsze debugowanie, a budżet wydajności jest osiągalny w TS | Odrzucone (YAGNI). Wracamy do tematu tylko wtedy, gdy pomiar w zadaniu 22 planu nie spełni budżetu |

Użytkownik wybrał stos i ogólny kształt w `docs/PLAN.md` v1, więc podejście A jest kontynuacją
tej decyzji. **[DD]** B i C odrzucam z powodów powyżej.

---

## 4. Specyfikacja matematyczna silnika (normatywna)

Każda zmiana względem wersji 1 ma znacznik **[Z-n]** i jest opisana w changelogu w
`docs/PLAN.md`, sekcja 10.

### 4.1 Krok czasowy i konwencje

- Krok miesięczny, `t = 0, 1, …, T`, horyzont maks. 80 lat (`T ≤ 960`).
- Modelujemy logarytmiczne stopy zwrotu. Niczego nie obcinamy.
- Wejście „oczekiwany zwrot” aktywa to **mediana długookresowego CAGR** `g`. Dryf miesięczny
  `μ = ln(1+g)/12`.
- Zmienność `σ` to odchylenie standardowe **rocznej** logarytmicznej stopy zwrotu
  (sumy 12 miesięcy), warunkowo na parametrach ścieżki.
- **[Z-1] Kolejność zdarzeń w miesiącu `t → t+1`** (stan na początek miesiąca, potem zwrot):
  1. Zdarzenia kalendarzowe: w styczniu ustalenie rocznej wypłaty, reset limitów IKE/IKZE,
     wygaśnięcie strat starszych niż 5 lat; w kwietniu zapłata podatku za poprzedni rok.
  2. Przychody do gotówki: czynsz netto, odsetki lokat (po 19%), kupony, wykupy obligacji.
  3. Wpłaty, wypłaty i zdarzenia jednorazowe (przepływy „z góry”, na początek miesiąca).
  4. Rebalans według polityki (sprzedaże przechodzą przez moduł podatkowy).
  5. Zwroty rynkowe za miesiąc razem z TER: `V ← V·exp(r)·(1−TER)^{1/12}`.
  6. Aktualizacja inflacji, kursów, reżimu; zapis migawki na siatce wyników.

  W v1 przepływy następowały po zwrotach i nie było zdefiniowane, z czego płaci się podatek.
  Kolejność „przepływ z góry” odpowiada rencie płatnej z góry i jest spójna z `PMT(…, typ=1)`
  w strategii amortyzacyjnej (4.11).
- **[Z-2] Rezerwa podatkowa i wartość „po podatku”.** Sprzedaż z zyskiem zwiększa zobowiązanie
  `taxDue[rok]`, płatne w kwietniu roku następnego. Raportowana wartość portfela to
  `aktywa − naliczone zobowiązanie`. Dodatkowo liczymy **wartość po podatku przy sprzedaży
  całości** (minus podatek od niezrealizowanych zysków). **[DD]** Przełącznik „po podatku” jest
  domyślnie włączony dla wartości końcowej i prawdopodobieństwa celu, bo to jest kwota, którą
  użytkownik realnie może wydać.
- **Ruina:** pierwszy miesiąc, w którym wypłaty nie da się pokryć z płynnych aktywów. Ścieżka
  zostaje z wartością 0, a niedobory są sumowane. Ścieżek z ruiną nigdy nie usuwamy ze statystyk.

### 4.2 Liczby losowe

- PRNG: **xoshiro128\*\*** (Blackman i Vigna 2021, „Scrambled linear pseudorandom number
  generators”, ACM TOMS 47(4)). Stan inicjowany przez **SplitMix32** z ziarna strumienia.
- Strumień per (ścieżka `p`, czynnik `k`): `seed_{p,k} = fmix32(fmix32(seed ^ 0x9E3779B9·(p+1)) ^ 0x85EBCA6B·(k+1))`
  (`fmix32` to finalizator MurmurHash3). `k` to stały identyfikator: aktywo (hash stabilnego ID),
  kurs USD, kurs EUR, inflacja, reżim, skala ogonów, upadek krypto, niepewność parametrów.
- Jednostajna: `u = (x + 0,5) / 2³²`, zawsze w (0, 1).
- **[Z-3] Normalna przez odwrócenie dystrybuanty** (Wichura 1988, algorytm AS 241, wariant
  PPND16) zamiast Zigguratu i generatora gamma. Jedno losowanie to dokładnie jedna liczba ze
  strumienia, więc wspólne liczby losowe (CRN) są wyrównane w czasie z konstrukcji, a kod jest
  krótszy i łatwiejszy do zweryfikowania. Koszt: do ~2× wolniej na losowanie, mieści się w
  budżecie 4.14.
- Skutki: wynik nie zależy od liczby wątków; dodanie aktywa nie zmienia losowań pozostałych;
  scenariusze i solvery porównujemy na CRN.
- **Odrzucone:** zmienne antytetyczne (psują niezależność ścieżek, na której opierają się
  przedziały ufności z 4.13) i quasi-Monte Carlo (wymiar rzędu 10⁴).

### 4.3 Grube ogony: mieszanka skali o ograniczonym nośniku

Szoki wszystkich czynników rynkowych (aktywa, kursy, inflacja) to
`ε_t = s_t · L z_t`, gdzie `z_t ~ N(0, I)`, `L` to czynnik Cholesky'ego macierzy `R̃` (4.4), a
`s_t > 0` to **jedna wspólna** skala na miesiąc.

- **[Z-4] Skala z tabeli kwantyli zamiast surowego t-Studenta.** Budujemy tabelę
  `s_k = √((ν−2) / Q_{χ²_ν}(u_k))` dla `u_k = (k+0,5)/K`, `K = 1024`, i normalizujemy ją tak,
  żeby `(1/K)·Σ s_k² = 1` dokładnie. Losowanie: `s_t = s_{⌊u·K⌋}`. Dla ν=5 największa skala to
  ok. 4,4 (przed normalizacją), więc pojedynczy miesiąc może mieć zmienność ponad czterokrotnie
  wyższą od typowej, ale nie dowolnie wysoką.
  Powód: przy logarytmicznych stopach o rozkładzie t-Studenta `E[exp(r)] = ∞` (rozkład t nie ma
  funkcji tworzącej momenty; Geweke 2001, „A note on some limitations of CRRA utility”,
  Economics Letters 71). Średnia wartość portfela z v1 formalnie nie istniała, a w symulacji
  była zdominowana przez pojedyncze losowania. Ograniczona skala zachowuje grube ogony i
  zależność w ogonach, a daje skończone momenty i dokładnie jednostkową wariancję.
- **[Z-5] Wspólna skala obejmuje wszystkie czynniki**, także kursy walut i inflację. W v1 czynniki
  spoza grupy t miały własny szum, co zaniżało korelacje krzyżowe o czynnik
  `c_ν = √((ν−2)/2)·Γ((ν−1)/2)/Γ(ν/2)` (0,921 dla ν=5; 0,886 dla ν=4). Przy jednej skali
  `Cov(ε) = R̃` dokładnie i żadna korekta nie jest potrzebna (własność mieszanek skali rozkładu
  normalnego; McNeil, Frey i Embrechts 2015, „Quantitative Risk Management”, rozdz. 6).
- Średnia arytmetyczna do pokazania w UI (model bez reżimów):
  `E[e^{r}] = e^{μ}·(1/K)·Σ_k exp(σ_m² s_k²/2)`, liczona z tej samej tabeli.
- Domyślnie ν = 5 (**założenie** do czasu łącznej kalibracji z reżimami; reżimy same generują
  kurtozę, więc łączna estymacja może dać większe ν). `ν ≥ 3` wymuszone walidacją.
- Macierz korelacji od użytkownika, która nie jest dodatnio określona, rzutujemy na najbliższą
  macierz korelacji (Higham 2002, „Computing the nearest correlation matrix”, IMA J. Numer.
  Anal. 22), pokazujemy ostrzeżenie i macierz po korekcie.

### 4.4 Reżimy rynku (RSLN-2) z dokładną kalibracją rocznych momentów

Wspólny łańcuch Markowa `s_t ∈ {0 spokój, 1 kryzys}` (Hamilton 1989; Hardy 2001, „A
regime-switching model of long-term stock returns”, NAAJ 5(2)). Prawdopodobieństwa przejścia
`p₀₁, p₁₀`, rozkład stacjonarny `π₁ = p₀₁/(p₀₁+p₁₀)`, `π₀ = 1−π₁`, `λ = 1−p₀₁−p₁₀`. Start z
rozkładu stacjonarnego.

Zwrot czynnika `i`:

`r_{i,t} = μ_i(t) + α_i σ_i(t) δ_{s_t} + σ_{m,i}(t) κ_{s_t,i} ε_{i,t}`

- `δ₀ = π₁Δ`, `δ₁ = −π₀Δ`, więc `π₀δ₀ + π₁δ₁ = 0` i bezwarunkowa średnia log-zwrotu to `μ_i`.
  `V_δ = π₀π₁Δ²`.
- `κ_{s,i} = 1 + b_i(κ_s − 1)`, `b_i ∈ [0,1]` (lokata i EDO mają `b = 0`).
- `A = 12 + 2·Σ_{k=1}^{11} (12−k) λ^k`, `K_{ij} = π₀κ_{0,i}κ_{0,j} + π₁κ_{1,i}κ_{1,j}`.
- **[Z-6] Ładunek kryzysowy jest względny:** przesunięcie średniej to `α_i σ_i δ_s`, a nie `a_i δ_s`.
  Udział wariancji rocznej pochodzący z reżimu to `ω_i = α_i² V_δ A` i nie zależy od `σ_i`.
  Dzięki temu kalibracja pozostaje dokładna także wtedy, gdy `σ_i(t)` zmienia się w czasie (BTC),
  a macierz `R̃` jest stała. Walidacja wymusza `ω_i ≤ 0,8`; w v1 dla aktywów o niskiej zmienności
  wzór dawał ujemną wariancję bez żadnego komunikatu.
- Zmienność miesięczna: `σ_{m,i} = σ_i · √((1 − ω_i) / (12·K_{ii}))`.
- **[Z-7] Korelacja wewnątrz reżimu wyznaczana z korelacji wpisanej przez użytkownika:**
  `R̃_{ij} = (ρ_{ij} − α_iα_j V_δ A) / (√((1−ω_i)(1−ω_j)) · K_{ij}/√(K_{ii}K_{jj}))`.
  Wtedy kowariancja rocznych log-zwrotów równa się `σ_iσ_jρ_{ij}` **dokładnie**. W v1 korelacje
  wpisane przez użytkownika były używane wprost jako korelacje szoków, więc wspólne przesunięcia
  średniej zawyżały korelacje roczne ponad wartości z formularza. Jeżeli `R̃` wychodzi poza
  [−1, 1] albo nie jest dodatnio określona, stosujemy rzut Highama i pokazujemy ostrzeżenie.
- **[Z-8] Usunięte: osobne macierze korelacji per reżim.** Wzrost współruchu w kryzysie dają już
  trzy mechanizmy: wspólne przesunięcie średniej, wspólny mnożnik zmienności i wspólna skala
  ogonów. Znaczna część obserwowanego „wzrostu korelacji w kryzysach” to efekt samej wyższej
  zmienności (Forbes i Rigobon 2002, „No contagion, only interdependence”, Journal of Finance
  57(5)), a dodatkowa macierz to kilkadziesiąt parametrów, których nie da się wiarygodnie
  oszacować ani pokazać użytkownikowi.
- Parametry kształtu (domyślne, **założenie** do kalibracji; punkt odniesienia Hardy 2001):
  `p₀₁ = 0,04`, `p₁₀ = 0,20`, `κ₀ = 1`, `κ₁ = 2,2`, `Δ = 0,175` (bezwymiarowe: dla `α = 1`
  średni miesięczny log-zwrot w kryzysie jest niższy niż w spokoju o `0,175·σ_i`, czyli o 2,8 pp
  przy `σ = 16%`, jak u Hardy'ego). Wartości kontrolne: `π₁ = 1/6`, `λ = 0,76`,
  `V_δ = 0,0042535`, `A = 62,5910`, `ω = 0,2662` dla `α = 1`, `K = 1,64` dla `b = 1`, a dla `σ = 16%`:
  `σ_m = 3,0895%`.
  Domyślne `α`: akcje 1; BTC/ETH 0,6; złoto 0; obligacje stałokuponowe −0,2; USD/PLN i EUR/PLN
  −0,5 ze znakiem takim, że złoty słabnie w kryzysie (wszystkie **założenia** do kalibracji).
- **Uwaga o medianie:** w modelu z reżimami rozkład sumy log-zwrotów jest lekko lewoskośny, więc
  mediana wartości końcowej jest nieco powyżej `W₀(1+g)^T`. Dokładnie zachowana jest średnia
  logarytmów, i to ją sprawdzają testy. Zgodność mediany testujemy tylko dla modelu GBM.

Modele do wyboru w trybie eksperta: (1) **realistyczny** (domyślny): reżimy + ogony;
(2) **podręcznikowy (GBM)**: `π₁ = 0`, `s_t ≡ 1`; (3) bootstrap historyczny (faza rozszerzeń).

### 4.5 Niepewność parametrów

Dla każdej ścieżki losujemy stałe przesunięcie rocznego dryfu logarytmicznego:
`Δμ^{(p)} = D · L_ρ z`, `D = diag(SE_i)`, `L_ρ` to czynnik Cholesky'ego **wpisanej** macierzy
korelacji; dryf miesięczny to `μ_i(t) + Δμ_i^{(p)}/12`.

- **[Z-9] Przesunięcia są skorelowane między aktywami** macierzą `ρ`. Błąd estymacji wektora
  średnich ma kowariancję proporcjonalną do kowariancji zwrotów, więc jeśli premia za ryzyko
  okaże się niższa, to dla wszystkich akcji naraz. W v1 losowania były niezależne, co zaniżało
  niepewność zdywersyfikowanego portfela (Barberis 2000, „Investing for the long run when
  returns are predictable”, Journal of Finance 55(1); Pástor i Stambaugh 2012, „Are stocks
  really less volatile in the long run?”, Journal of Finance 67(2)).
- **[Z-10] Semantyka `g` przy niepewności.** Rozkład przesunięcia jest symetryczny w logarytmach,
  więc dla jednego aktywa bez przepływów **mediana wartości końcowej pozostaje `W₀(1+g)^T`**,
  czyli wpisany CAGR jest medianą. Średnia rośnie o czynnik `exp(SE²T²/2)`: dla SE = 2 pp i 30
  lat to +20%, dla SE = 8 pp (BTC) to ×18. Dlatego UI pokazuje medianę i pasma jako wynik
  główny, a średnią tylko w trybie eksperta z opisem „zawyżana przez rzadkie skrajnie dobre
  scenariusze”.
- Domyślne SE: rozrzut prognoz instytucji i historyczny błąd takich prognoz (tabela 6.2).
  Suwak w UI: „Jak pewny jesteś oczekiwanego zwrotu?” (mnożnik 0–2 dla wszystkich SE).
- **[Z-11] Niepewność długookresowej inflacji:** `ī^{(p)} = ī + SE_ī·z`. Przez 30 lat różnica
  między inflacją 2,5% a 3,5% zmienia wartość realną o 25%, a wiarygodność celu NBP jest
  założeniem, nie faktem.
- Niepewności `σ` nie modelujemy: wariancję szacuje się z danych o rząd wielkości dokładniej niż
  średnią (Merton 1980, „On estimating the expected return on the market”, JFE 8).

### 4.6 Inflacja (Polska)

Stan `x_t`: zannualizowana, ciągła stopa inflacji trendu.

`x_{t+1} = ī^{(p)} + φ·(x_t − ī^{(p)}) + σ_η·ε^π_{t+1}`, `ln CPI_{t+1} = ln CPI_t + x_{t+1}/12`.

Inflacja r/r: `yy_t = CPI_t / CPI_{t−12} − 1`.

- **[Z-12] Poprawna kalibracja do danych r/r.** Inflacja r/r to suma 12 miesięcznych przyrostów,
  więc `Var(ln(1+yy)) = (V_x/144)·G(φ)`, `V_x = σ_η²/(1−φ²)`,
  `G(φ) = 12 + 2·Σ_{k=1}^{11}(12−k)φ^k`, a autokorelacja r/r przy opóźnieniu 12 miesięcy to
  `ρ₁₂(φ) = φ(1−φ^{12})² / ((1−φ)²·G(φ))`.
  Kalibracja: z danych bierzemy odchylenie i autokorelację r/r (lag 12), rozwiązujemy `ρ₁₂(φ)`
  bisekcją (funkcja rosnąca), potem wyznaczamy `σ_η`. W v1 było `φ_m = φ_a^{1/12}`, co myli
  autokorelację szeregu r/r (średniej ruchomej) z autokorelacją procesu miesięcznego. Wartości
  kontrolne: `ρ₁₂ = 0,4 → φ = 0,87709, G = 91,214`; przy odchyleniu r/r 2 pp `σ_η = 0,01207`.
- **[Z-13] Start i historia.** `x₀` to ostatni odczyt **r/r** (3,5% za październik 2026), a nie
  odczyt miesięczny (−0,4% m/m dałoby −4,7% w skali roku). Zbiór danych zawiera 13 ostatnich
  poziomów indeksu CPI, żeby inflacja r/r i indeksacja EDO były poprawne od pierwszego miesiąca.
- Deflacja jest dozwolona (Polska 2014–2016). `CPI_t` per ścieżka służy jako deflator, do
  indeksacji wpłat i wypłat oraz do EDO.
- Szok `ε^π` jest częścią wspólnego wektora czynników (4.3), z ujemną korelacją z obligacjami
  stałokuponowymi.
- **Inflacja zagraniczna** (USD, EUR) jest stała, podana jako parametr (uproszczenie; patrz 4.7).

### 4.7 Waluty

- Każde aktywo ma walutę notowania. Baza: PLN (opcjonalnie USD, EUR).
- **[Z-14] Realny kurs walutowy powraca do średniej.** `q_t` to logarytm odchylenia realnego
  kursu od poziomu startowego: `q_{t+1} = φ_q q_t + α_q σ_q δ_{s_t} + σ_{q,m} κ ε^{fx}`,
  `φ_q = 2^{−1/(12·H)}`, domyślnie półokres `H = 4` lata (`φ_q = 0,98566`).
  Kurs nominalny: `ln S_t = ln S₀ + q_t + (ln CPI^{PL}_t − ln CPI^{PL}_0) − π^{F}·t/12`.
  W v1 kurs był błądzeniem losowym wokół dryfu PPP, więc wariancja realnego kursu rosła bez
  ograniczeń (po 50 latach odchylenie ok. 70% w logarytmach). Dane pokazują powolny powrót do
  PPP z półokresem 3–5 lat (Rogoff 1996, „The purchasing power parity puzzle”, JEL 34(2);
  Taylor i Taylor 2004, „The purchasing power parity debate”, JEP 18(4)).
- Skutek uboczny, zgodny z ekonomią: realny zwrot w PLN z aktywa w USD to realny zwrot w USD
  plus zmiana realnego kursu. Polska inflacja się skraca.
- Domyślnie brak trendu realnej aprecjacji złotego (**założenie**; efekt Balassy–Samuelsona jest
  parametrem eksperta, domyślnie 0).
- Panel kontroli pokazuje zmienność efektywną aktywa w PLN: `√(σ_a² + σ_fx² + 2ρσ_aσ_fx)`
  dla horyzontu rocznego.

### 4.8 Typy aktywów

| Typ | Model |
|---|---|
| Aktywo ryzykowne (akcje, ETF, złoto, własne) | 4.3–4.5. Parametry: `g, σ, SE, α, b`, waluta, TER, forma podatkowa. |
| Kryptowaluta (BTC, ETH) | Jak wyżej plus zanik i upadek, patrz niżej. |
| Lokata / konto | `d_{t+1} = max(0, d_t + k·(x_t + s − d_t))`, odsetki miesięcznie, 19% przy wypłacie odsetek. `k`, `s` to założenia. |
| Obligacje stałokuponowe (fundusz o stałym duration) | Aktywo ryzykowne z `g` = bieżąca rentowność, `σ` z duration, ujemna korelacja z `ε^π`, `α < 0`. |
| EDO | Partie zakupu. Rok 1: stałe oprocentowanie. Lata 2–10: `max(0, yy_{m−2}) + marża`, gdzie `m` to miesiąc rozpoczęcia okresu odsetkowego (inflacja ogłoszona w miesiącu poprzedzającym dotyczy miesiąca `m−2`). Kapitalizacja roczna, w trakcie roku odsetki proste. Wykup po 10 latach: 19% od całych odsetek, środki kupują nową serię (oprocentowanie roku 1 przyszłych serii `= max(0, x_t) + marża`, **założenie**). Przedterminowy wykup: najstarsze partie, opłata 3,00 zł na obligację 100 zł, nie więcej niż narosłe odsetki. |
| Nieruchomość | „Mieszkam” (tylko majątek netto) albo „na wynajem”: cena jako aktywo ryzykowne w ujęciu realnym + czynsz netto jako przepływ, ryczałt 8,5% do 100 000 zł przychodu rocznie i 12,5% powyżej. Niepłynna: bez rebalansu i częściowej sprzedaży, tylko zdarzenie „sprzedaż w roku X” (19% od zysku, zwolnienie po 5 latach podatkowych). |

**Kryptowaluty:**

- Zanik: `g(t) = g_∞ + (g₀ − g_∞)·e^{−t/τ_g}`, `σ(t) = σ_∞ + (σ₀ − σ_∞)·e^{−t/τ_σ}`,
  `μ(t) = ln(1+g(t))/12`. UI pokazuje wynikową medianę ceny w roku docelowym i średni CAGR w
  horyzoncie.
- **[Z-15] Upadek jest stanem pochłaniającym, a `g` to mediana warunkowa na przetrwaniu.**
  Zdarzenie Poissona o intensywności `h` na rok (własny strumień losowy): wartość mnożona przez
  `1 − L` (domyślnie `L = 0,95`), po czym dryf wynosi 0, a zmienność `σ_∞`. Dryfu **nie**
  kompensujemy o `h·L`. W v1 nie było powiedziane, czy `g` zawiera ryzyko upadku: skok o −95%
  obniża średni log-zwrot o `h·ln(0,05) ≈ −3 pp` rocznie przy `h = 1%`, ale prawie nie rusza
  mediany, więc kompensacja zawyżałaby typowy wynik. UI pokazuje osobno
  `P(upadek do roku T) = 1 − e^{−hT}`.
- Presety w tabeli 6.3. Wszystkie parametry dryfu BTC to **założenia**, nie dane.
- **Nakładka potęgowa** (domyślnie wyłączona, etykieta „model kontrowersyjny”): zastępuje `g(t)`
  pochodną trendu `ln P = a + b·ln(dni od 2009-01-03)`. Zastrzeżenie w UI: regresja ceny na
  czasie jest podatna na regresję pozorną i nie ma podstaw ekonomicznych; parametry `a, b` są
  niezweryfikowane.
- Forma posiadania wpływa na podatek: **natywnie** (koszyk krypto) albo **ETP/ETF na giełdzie**
  (papier wartościowy, FIFO).

### 4.9 Portfel, rebalans, koszty

- Polityki: brak / co rok (styczeń) / progowa (pasmo ±X pp) / tylko przepływami.
- Koszt transakcji per aktywo w punktach bazowych od wartości transakcji.
- Sprzedaż zawsze przechodzi przez moduł podatkowy. Aktywa niepłynne i EDO nie biorą udziału w
  rebalansie.
- Kolejność źródeł wypłaty: gotówka i lokaty, potem aktywa przeważone względem celu, na końcu
  EDO (przedterminowy wykup).
- **Opakowania kont [D]:** każda pozycja należy do opakowania `taxable | IKE | IKZE`. W MVP
  istnieje typ i routing podatkowy (IKE/IKZE: brak podatku w trakcie), a limity wpłat i reguły
  wypłat dochodzą w fazie rozszerzeń.

### 4.10 Podatki (Polska; moduł wymienny)

- **Papiery wartościowe** (art. 30b ust. 1 ustawy o PIT): 19% od dochodu rocznego, koszt metodą
  **FIFO** na partiach (art. 24 ust. 10, osobno dla każdego rachunku; opakowanie = rachunek).
- **[Z-16] Straty z papierów** (art. 9 ust. 3): rozliczane w 5 kolejnych latach, **w całości**,
  najstarsze najpierw. W v1 był limit 50% rocznie, ale od 2019 r. przepis pozwala też na
  jednorazowe odliczenie do 5 000 000 zł, więc dla praktycznie każdego użytkownika limit 50% nie
  wiąże. Przy stracie powyżej 5 mln zł pokazujemy ostrzeżenie, że model upraszcza.
- **[Z-17] Kryptowaluty** (art. 30b ust. 1a, art. 22 ust. 14–16): bez FIFO. Dochód roczny =
  przychody ze sprzedaży − (wydatki na zakup poniesione **w tym roku**, także na niesprzedane
  jednostki, + nadwyżka kosztów z lat poprzednich). Nadwyżka kosztów przechodzi na kolejny rok
  **bez limitu czasu**. Nie łączy się z papierami. V1 opisywał koszyk poprawnie w zarysie, ale
  planował wspólny mechanizm strat 5-letnich, który krypto nie dotyczy.
- **[Z-18] Forma posiadania:** BTC jako ETP na giełdzie to papier wartościowy; złoto fizyczne
  sprzedane po upływie pół roku od końca miesiąca nabycia nie podlega PIT (art. 10 ust. 1 pkt 8
  lit. d), a ETC na złoto to papier wartościowy.
- Odsetki lokat i obligacji: 19% u źródła (art. 30a), bez kompensaty ze stratami. EDO: podatek
  od sumy odsetek przy wykupie.
- Najem: ryczałt 8,5% / 12,5% od przychodu.
- Zapłata podatku z PIT-38 w kwietniu następnego roku (4.1, krok 1).
- Tryby: „bez podatków”, „stawka ogólna” (jedna stawka od zysku przy sprzedaży) dla
  użytkowników spoza PL.
- Poza zakresem: danina solidarnościowa 4% (dochody powyżej 1 mln zł), zaokrąglenia do pełnych
  złotych, dywidendy i WHT.

### 4.11 Przepływy

- Wpłaty miesięczne: kwota, rok końca, indeksacja (brak / inflacja / inflacja + realny wzrost).
- Wypłaty od roku X:
  1. **Stała realna kwota** (indeksowana symulowaną inflacją).
  2. **Stały % portfela** (ustalany w styczniu, wypłacany w 12 ratach).
  3. **Amortyzacja (ABW)**: w styczniu `rata = PMT(r, n, W, typ=1)`, `r` = mediana realnego
     zwrotu portfela z modelu po kosztach, `n` = pozostałe lata; opcjonalna podłoga i sufit.
     (Waring i Siegel 2015, „The only spending rule article you will ever need”, FAJ 71(1).)
  4. **Guyton–Klinger 2006** (pełne reguły) w fazie rozszerzeń. **[DD]** Przeniesione z MVP:
     cztery sprzężone reguły to dużo testów przy małej wartości dla pierwszego wydania.
- Zdarzenia jednorazowe: kwota realna albo nominalna, data, znak.

### 4.12 Śmiertelność (faza rozszerzeń)

Wiek i płeć opcjonalnie. Tablice GUS 2025 (`q_x` per wiek i płeć). Prawdopodobieństwo
wyczerpania środków za życia: `P = Σ_t P̂(ruina w miesiącu t)·S(t)`, gdzie `S(t)` to
prawdopodobieństwo dożycia. Śmiertelność całkujemy analitycznie (bez dodatkowego szumu), ale
`P̂` nadal ma błąd losowania z symulacji rynku. Tablice okresowe zaniżają długość życia kohort,
więc UI to mówi i daje opcję „+2 lata” (**założenie**).

### 4.13 Statystyki

- **Wachlarz:** percentyle 5/10/25/50/75/90/95 wartości realnej i nominalnej na siatce czasu.
  Kwantyle typu 7 (Hyndman i Fan 1996); typ 7 jest domyślny w NumPy i Excelu, co ułatwia
  niezależną weryfikację.
- **Przedziały ufności:** Wilsona dla prawdopodobieństw; dla kwantyli nieparametryczny z
  statystyk pozycyjnych (indeksy z rozkładu dwumianowego).
- **[Z-19] Stałe etapy zamiast reguły stopu:** 1 000 → 4 000 → 10 000 ścieżek (opcjonalnie 25 000
  w trybie eksperta). W v1 symulacja kończyła się, gdy przedział zszedł poniżej 0,5 pp;
  zatrzymywanie zależne od wyniku psuje pokrycie przedziałów i komplikuje determinizm.
  Plakietka pokazuje osiągniętą dokładność.
- Prawdopodobieństwo celu (realna kwota do daty), realnej straty, ruiny.
- **[Z-20] Obsunięcia liczone w kernelu** na jednostkowym indeksie portfela (zwrot ważony czasem),
  co miesiąc, a nie z rzadszej siatki wyników i nie z wartości zniekształconej wpłatami.
  Raportujemy rozkład maksymalnego obsunięcia i najgorsze 12 miesięcy.
- „Najgorsze 5% przyszłości: średnio X” (CVaR 5% wartości końcowej, bez żargonu w UI).
- Rozkład realnego CAGR portfela (ważony czasem).
- Wkład aktywów w ryzyko (dekompozycja Eulera na kowariancji rocznych log-zwrotów w walucie
  bazowej, dla wag początkowych) w fazie rozszerzeń.
- Kilka prawdziwych ścieżek przykładowych dobranych po kwantylu wartości końcowej, podpisanych.
- Niepewność modelu osobno: przełącznik zestawów założeń i porównanie scenariuszy na CRN.

**Solvery [Z-21].** „Ile mogę bezpiecznie wypłacać przy P(sukces) ≥ X?” i „Ile muszę wpłacać,
żeby osiągnąć cel z prawdopodobieństwem X?”.

- V1 twierdził, że CRN gwarantuje monotoniczność. To prawda tylko bez podatków, progów rebalansu
  i reguł dyskretnych (wtedy wartość na ścieżce jest afiniczna i malejąca względem wypłaty). W
  ogólnym przypadku większa wypłata może uruchomić rebalans, który akurat pomoże, więc `P̂(w)`
  jest funkcją schodkową **prawie** monotoniczną.
- Algorytm: (1) przedział startowy z rozwiązania zamkniętego per ścieżka dla wariantu bez
  podatków (maksymalna stała wypłata na ścieżce to `W₀·…/Σ` czynników dyskontowych; kwantyl
  rzędu `1−X` daje punkt startowy); (2) bisekcja po **kwocie** na `P̂(w) − X` z CRN, stop przy
  szerokości przedziału < 0,5% kwoty albo po 20 iteracjach; (3) zwracamy najmniej korzystny
  koniec przedziału (niższą wypłatę, wyższą wpłatę), `P̂` w tym punkcie i jego przedział Wilsona.
- Solver używa 4 000 ścieżek; wynik końcowy potwierdzamy pełnym przebiegiem.

### 4.14 Wydajność i pamięć

- Pula workerów (`hardwareConcurrency − 1`, min. 1, maks. 8), Comlink, wyniki jako
  `Transferable`.
- Pętla per ścieżka na prealokowanych `Float64Array`, bez alokacji w pętli. Partie FIFO w
  buforach pierścieniowych.
- **[Z-22] Siatka wyników:** miesięczna dla horyzontu ≤ 10 lat, kwartalna ≤ 40 lat, półroczna
  powyżej (≤ 161 punktów). Przechowujemy trzy macierze `Float32` (wartość nominalna, wartość
  nominalna po podatku i indeks CPI): 25 000 × 161 × 3 × 4 B ≈ 48 MB w najgorszym razie. Dane per aktywo tylko jako
  sumy bieżące (średni udział w roku), bez macierzy per ścieżka. V1 planował siatkę 241 punktów
  i roczne dane per aktywo per ścieżka, co przy 6 aktywach przekraczało budżet 64 MB.
- Limit ścieżek: 10 000 na telefonie, 25 000 na desktopie.
- Budżet: podgląd 1 000 ścieżek < 300 ms; 10 000 ścieżek × 30 lat × 6 aktywów < 2 s na
  telefonie średniej klasy i < 0,5 s na desktopie (pomiar w planie, zadanie 22). **[Z-23]**
  Usunięty plan przeniesienia do WASM; wraca tylko po nieudanym pomiarze.
- Anulowanie przy zmianie parametrów (debounce 250 ms), wyniki progresywne po każdym etapie.

---

## 5. UX i architektura

Sekcje 5 (UX/UI) i 6 (architektura) z `docs/PLAN.md` pozostają w mocy z tymi zmianami:

- Hosting: Vercel zamiast Cloudflare Pages **[D]**.
- Usunięte jako przekombinowane względem wartości dla użytkownika **[DD]**: paleta ⌘K,
  biblioteka Motion (wystarczą przejścia CSS i View Transitions), szczegóły licencji JWS i
  passkeys (zostaje tylko rejestr funkcji z `FREE_FOR_ALL = true`).
- KaTeX ładowany leniwie tylko na stronie metodologii.
- Ceny z sieci są opcjonalne: kursy z API NBP; ceny krypto z CoinGecko wymagają atrybucji
  „Powered by CoinGecko” i nie mogą być trwale przechowywane poza 24-godzinnym cache (6.5). Bez
  sieci użytkownik wpisuje cenę ręcznie.
- Nowe elementy UI wynikające z sekcji 4: przełącznik „po podatku”, wiersz „szansa upadku BTC do
  roku T”, plakietka etapów dokładności, ostrzeżenia o korekcie macierzy korelacji.

### Struktura repozytorium (normatywna dla planu)

```
apps/web/                      React + Vite + Tailwind v4, PWA
  src/app/appConfig.ts         nazwa robocza i stałe aplikacji (jedno miejsce)
  src/features/…               onboarding, portfolio, plan, results, compare, assumptions,
                               methodology, settings
  src/charts/…                 FanChart, Histogram, …
  src/workers/…                sim.worker.ts, pool.ts
  src/state/…                  store'y, Dexie, migracje
  src/entitlements/…           rejestr funkcji, FREE_FOR_ALL
  src/i18n/…
packages/engine/src/
  rng/  math/  linalg/  models/  portfolio/  tax/pl/  cashflows/  stats/  solvers/
  kernel.ts  runner.ts  types.ts  validate.ts
packages/data/
  src/ (schematy Zod, loader)  datasets/2026.11/*.json  scripts/ (kalibracja)
vercel.json
```

---

## 6. Dane domyślne i źródła (stan na 2026-11-13)

Etykiety: **dane** (pomiar), **prognoza** (instytucja), **założenie** (nasze). Status
weryfikacji: ✅ zweryfikowane u źródła w tej sesji, ◐ tylko źródło wtórne, ❌ niezweryfikowane.

### 6.1 Prognozy instytucji i dane historyczne

| Źródło | Wartości | Status |
|---|---|---|
| J.P. Morgan, 2027 LTCMA (publ. 2026-10-19, dane na 2026-09-30; USD, nominalnie, 10–15 lat) | Akcje USA duże 7,5%; akcje globalne 7,5%; rynki wschodzące 7,1%; obligacje skarbowe USA średnioterminowe 4,6%; obligacje globalne (aggregate) 5,3%; złoto 5,5%; surowce 4,8%; portfel 60/40 7,0%; inflacja globalna 2,6% | ✅ komunikat prasowy. ❌ zmienności i korelacje (tylko w plikach do pobrania), rynki rozwinięte bez USA, gotówka, inflacja USA |
| Vanguard VCMM (strona z 2026-10-21, przebieg na 2026-09-30; USD, nominalnie, geometrycznie, 10 lat) | Akcje USA 4,8–6,8%; rozwinięte bez USA 5,3–7,3%; wschodzące 3,7–5,7%; obligacje USA aggregate 5,1–6,1% | ✅. ◐ mediany zmienności (akcje USA 15,2%, poza USA 18,8%, obligacje 6,3%) pochodzą z wyniku wyszukiwarki bez daty przebiegu |
| AQR, 2026 Capital Market Assumptions (publ. 2026-01-14, dane na 2025-12-31; **realnie**, 5–10 lat, waluta lokalna) | Akcje USA duże 3,9%; rozwinięte bez USA 4,9%; wschodzące 5,1%; świat 4,2%; globalny 60/40 3,4%; surowce 4,3%; 10-letnie obligacje USA nominalnie 4,8% | ✅ PDF, tabela w aneksie |
| Research Affiliates, Asset Allocation Interactive (początek 2026; nominalnie, 10 lat) | Akcje USA duże ~3,4%; wschodzące ~9,1% | ◐ cytat z artykułu RA w serwisie zewnętrznym, bez daty przebiegu |
| BlackRock Capital Market Assumptions (aktualizacja kwartalna, dane na 2026-06-30) | Brak liczb | ❌ strona interaktywna, wartości nieodczytane |
| UBS Global Investment Returns Yearbook 2026 (Dimson, Marsh, Staunton; publ. 2026-03-03) | USA 1900–2025: akcje 9,8% nominalnie i 6,6% realnie, obligacje 4,6% i 1,6%, bony 3,4% i 0,5%, inflacja 2,9%; złoto realnie 1,3% od 1900 i 4,7% (USD) od 1971; rynki rozwinięte 8,5% vs wschodzące 6,9% od 1900; ryzyko walutowe dodaje ok. 6 pp do zmienności | ✅ streszczenie publiczne. ◐ odchylenie standardowe indeksu światowego 17,3% i realny zwrot świata bez USA 4,5% (omówienie PWL Capital). ❌ realny zwrot indeksu światowego, premia za ryzyko |

URL-e: am.jpmorgan.com/us/en/asset-management/institutional/about-us/media/press-releases/jp-morgan-releases-2027-long-term-capital-market-assumptions/ ·
corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html ·
www.aqr.com/insights/research/alternative-thinking/2026-capital-market-assumptions-for-major-asset-classes ·
www.researchaffiliates.com/aai ·
www.blackrock.com/institutions/en-global/institutional-insights/thought-leadership/capital-market-assumptions ·
www.ubs.com/content/dam/assets/wm/static/cio/documents/giry2026-summary-public.pdf
(dostęp do wszystkich: 2026-11-13).

Uwaga licencyjna: liczby DMS/UBS mają zastrzeżenie „Not to be reproduced without express written
permission from the authors”. W aplikacji płatnej cytujemy je z podaniem źródła jako punkt
odniesienia, a przed monetyzacją trzeba uzyskać zgodę albo ograniczyć się do krótkiego cytatu.

### 6.2 Parametry domyślne aktywów (zestaw `2026.11`)

`g` to mediana CAGR nominalnie w walucie notowania. Wszystkie `σ`, korelacje, `SE` i parametry
reżimów pozostają **niezweryfikowane (❌)** do czasu uruchomienia skryptów kalibracyjnych
(zadanie 14 planu), chyba że zaznaczono inaczej.

| Aktywo (waluta) | g | Zakres w źródłach | σ | SE | Rodzaj | Uzasadnienie |
|---|---|---|---|---|---|---|
| Akcje globalne (USD) | 6,5% | 5,9–7,5% | 16% | 1,5 pp | prognoza | JPM 7,5; Vanguard ok. 5,9 (ważone regionami); AQR 4,2 realnie + 2,4 inflacji = 6,6 |
| Akcje USA (USD) | 6,0% | 3,4–7,5% | 16% | 2,0 pp | prognoza | JPM 7,5; Vanguard 5,8; AQR 6,3; RA 3,4 (◐) |
| Akcje rynków wschodzących (USD) | 6,5% | 4,7–9,1% | 21% | 2,5 pp | prognoza | JPM 7,1; Vanguard 4,7; AQR 7,5; RA 9,1 (◐) |
| Akcje polskie WIG (PLN) | 7,0% | — | 21% | 3,0 pp | założenie | ❌ brak prognoz instytucji; do kalibracji na danych GPW |
| Obligacje skarbowe PL stałokuponowe (PLN) | bieżąca rentowność 10-letnia | — | 6% | 1,0 pp | dane | ❌ rentowność nieodczytana w tej sesji |
| Obligacje globalne hedged (USD) | 5,3% | 5,1–6,1% | 6% | 1,0 pp | prognoza | JPM 5,3; Vanguard 5,2–6,2 |
| Złoto (USD) | 4,5% | 3,8–5,5% | 15% | 2,0 pp | prognoza/dane | JPM 5,5; DMS realnie 1,3% od 1900 + inflacja 2,5 = 3,8 |
| Lokata (PLN) | inflacja − 0,5 pp | — | — | — | założenie | ❌ `k = 0,15/mies.`, `s = −0,5 pp` |
| EDO (PLN) | patrz 6.4 | — | — | — | dane MF | ✅ |
| Nieruchomość PL (PLN) | inflacja + 1,0% + czynsz netto 3,5% | — | 9% | 1,5 pp | założenie | ❌ Jordà i in. 2019; baza cen NBP do kalibracji |
| USD/PLN (realny kurs) | 0 | — | 11% | — | założenie | ❌ półokres 4 lata, korelacja z akcjami −0,3; tabele A NBP |
| EUR/PLN (realny kurs) | 0 | — | 7% | — | założenie | ❌ jw. |
| Inflacja USA / strefy euro | 2,5% / 2,0% | 2,0–2,9% | — | — | założenie | Cel Fed i EBC 2%; JPM globalnie 2,6%; DMS historycznie 2,9% |

### 6.3 Kryptowaluty (wszystko **założenie**, poza zmiennością zrealizowaną)

Zmienność zrealizowana BTC (zannualizowana, log-zwroty):

| Okno | Wartość | Źródło i status |
|---|---|---|
| 90 dni do 2026-11-13 | 40,5% | ✅ obliczenie własne z 120 cen CoinGecko (odstęp ok. 18 h) |
| ok. 1 rok | ok. 45% | ◐ obliczenie własne z cen co ok. 42 dni (9 obserwacji, duży błąd) |
| ok. 4 lata | ok. 49% | ◐ jw., 35 obserwacji |
| 2026, okna 30-dniowe | 23–47% | ◐ serwisy branżowe (cryptobriefing.com, stealthex.io), rozbieżne |

Obserwacja kontrolna: cena z listopada 2022 do listopada 2026 daje ok. 43% rocznie (od dołka),
a szczyt 2021 do szczytu 2025 ok. 17% rocznie. Wynik zależy od punktów końcowych, więc
historycznych CAGR **nie** używamy do kalibracji dryfu.

| Preset | g₀ → g_∞ (τ_g) | σ₀ → σ_∞ (τ_σ) | h (upadek/rok) | SE |
|---|---|---|---|---|
| BTC pesymistyczny | 5% → 2,5% (5 lat) | 55% → 35% (8 lat) | 2,0% | 6 pp |
| BTC bazowy | 15% → 5,5% (7 lat) | 50% → 30% (8 lat) | 1,0% | 6 pp |
| BTC optymistyczny | 25% → 7,5% (10 lat) | 45% → 30% (8 lat) | 0,5% | 6 pp |
| ETH bazowy | 12% → 5% (7 lat) | 70% → 40% (8 lat) | 2,5% | 9 pp |

Logika presetów: `g_∞` bazowy to okolice złota i wzrostu nominalnego (aktywo dojrzałe bez
przepływów pieniężnych), pesymistyczny to sama inflacja. Korelacja BTC z akcjami 0,35
(❌ założenie). Zmienność zrealizowana ETH ❌. J.P. Morgan podaje w LTCMA 2027 przedział zwrotu
BTC, ale wartości nie odczytałem (❌).

### 6.4 Polska: inflacja, obligacje, limity, tablice

| Parametr | Wartość | Źródło | Status |
|---|---|---|---|
| CPI październik 2026 | 3,5% r/r; −0,4% m/m | GUS, komunikat z 2026-11-13, stat.gov.pl/obszary-tematyczne/ceny-handel/wskazniki-cen/ | ✅ |
| CPI wrzesień 2026 | 4,1% r/r | finwire.pl | ◐ |
| 13 ostatnich poziomów indeksu CPI | — | GUS | ❌ do pobrania w zadaniu 14 |
| Cel inflacyjny NBP | 2,5% ± 1 pp | nbp.pl (strona zablokowała pobranie); pasmo 1,5–3,5% wg finwire.pl | ◐ |
| Stopa referencyjna NBP | 3,75% (od 2026-10-07) | finwire.pl | ◐ |
| Inflacja długookresowa `ī`, `SE_ī` | 3,0%; 0,5 pp | między celem NBP a średnią historyczną | założenie, ❌ średnia historyczna |
| Odchylenie i autokorelacja r/r | 2,5 pp; 0,4 | — | założenie, ❌ do kalibracji na danych GUS |
| EDO1136 (sprzedaż 1–30.11.2026) | rok 1: 5,35%; potem inflacja + 2,00%; kapitalizacja roczna; opłata za przedterminowy wykup 3,00 zł, nie więcej niż narosłe odsetki; wykup możliwy po 7 dniach | obligacjeskarbowe.pl/oferta-obligacji/obligacje-10-letnie-edo/ | ✅. ❌ dokładne brzmienie limitu opłaty w liście emisyjnym |
| COI1130 | rok 1: 4,75%; potem inflacja + 1,50%; opłata 2,00 zł | obligacjeskarbowe.pl | ✅ |
| TOS (3-letnie stałe) | 4,40% | obligacjeskarbowe.pl (lista produktów) | ✅ |
| Limit IKE 2026 / 2027 | 28 260 zł / 30 099 zł (M.P. 2026 poz. 1081) | czasopismo.legeartis.org | ◐ (treść Monitora Polskiego nieodczytana) |
| Limit IKZE 2026 | 11 304 zł; 16 956 zł dla działalności | xyz.pl | ◐ |
| Limit IKZE 2027 | 12 039,60 zł; 18 059,40 zł | xyz.pl | ◐, źródła sprzeczne co do publikacji obwieszczenia |
| Tablice trwania życia GUS 2025 (publ. 2026-07-27) | Dalsze trwanie życia: w wieku 0: M 75,37, K 82,48; w wieku 60: M 20,04, K 24,71; w wieku 65: M 16,50, K 20,47. Plik XLSX „Tablica A” zawiera `q_x` dla wieku 0–100, osobno dla płci | stat.gov.pl/obszary-tematyczne/ludnosc/trwanie-zycia/trwanie-zycia-w-2025-r-,2,20.html | ✅ odczytane z pliku |
| Stawki i zasady podatkowe (19%, FIFO, koszyk krypto, straty, ryczałt najmu) | sekcja 4.10 | ustawa o PIT, ustawa o ryczałcie | ❌ przepisy cytowane z pamięci, do sprawdzenia w ISAP |

### 6.5 Licencje danych

| Źródło | Warunki | Skutek dla aplikacji | Status |
|---|---|---|---|
| CoinGecko API (regulamin z 2025-09-05) | Wolno pobierać opłaty za produkt używający API; zakaz redystrybucji dostępu, tworzenia danych pochodnych i trwałego przechowywania; cache ≤ 24 h; wymagana atrybucja „Powered by CoinGecko” | Tylko cena bieżąca na żądanie użytkownika, z atrybucją. **Nie** do kalibracji parametrów wysyłanych w aplikacji | ✅ |
| NBP Web API | Brak osobnej licencji; „All rights reserved”; kursy od 2002, złoto od 2013; zapytanie maks. 93 dni | Kursy bieżące w aplikacji; do kalibracji statystyki pochodne. Przed monetyzacją zapytać NBP | ✅ (brak warunków to też ustalenie) |
| GUS | Kopiowanie i własne opracowania dozwolone z podaniem źródła | CPI i tablice życia można dołączyć z atrybucją | ✅ |
| FRED API | Serie stron trzecich mogą mieć prawa autorskie; wymagana klauzula o braku certyfikacji | Tylko w skryptach kalibracyjnych, serie bez oznaczenia „Copyright” | ✅ |
| Shiller (shillerdata.com) | Brak licencji, tylko wyłączenie odpowiedzialności | Tylko w skryptach (backtest), bez dołączania szeregów | ✅ |
| Stooq | Serwer zwrócił błąd 503 | Nie używać do czasu sprawdzenia regulaminu | ❌ |
| MSCI, LBMA, CoinMetrics | Nie sprawdzano w tej sesji | Nie dołączać surowych szeregów | ❌ |

Zasada: aplikacja zawiera wyłącznie **statystyki pochodne i cytowania**. Surowe szeregi pobierają
skrypty kalibracyjne lokalnie.

### 6.6 Format metadanych

Każdy parametr w `packages/data`:
`{ value, range?, kind: 'data'|'forecast'|'assumption', verified: 'yes'|'secondary'|'no', sources: [{title, publisher, year, url, accessed}], note }`.
UI pokazuje to w panelu „Założenia i źródła” i pod ikoną ⓘ. Parametr z `verified ≠ 'yes'`
dostaje widoczną plakietkę. Scenariusz zapisuje wersję zbioru danych.

---

## 7. Fazy

| Faza | Zakres | Kryterium |
|---|---|---|
| 0. Fundament | Monorepo, CI, szkielet PWA, konfiguracja nazwy | CI zielone, instalacja i działanie offline |
| 1. Dane | Schematy, zestaw `2026.11`, skrypty kalibracyjne | Tabela parametrów ze źródłami przekazana użytkownikowi do akceptacji |
| 2. Silnik: rdzeń | RNG, matematyka, modele, kernel, runner, statystyki | Testy T1–T4 (sekcja 9) zielone, budżet wydajności w Node |
| 3. Przepływy i podatki | Wpłaty, 3 strategie wypłat, rebalans, podatki PL, solvery | Testy T5–T8 zielone |
| 4. UI MVP | Onboarding, portfel, plan, dashboard, źródła, workery, zapis lokalny | Pełny przepływ na telefonie i desktopie, e2e zielone |
| 5. Rozszerzenia | Porównanie scenariuszy, śmiertelność, IKE/IKZE z limitami, najem, Guyton–Klinger, wkład w ryzyko, bootstrap, metodologia, backtest, EN, nakładka potęgowa | Testy funkcji |
| 6. Jakość | WCAG 2.2 AA, wydajność na telefonie, Lighthouse | Lighthouse ≥ 95 |
| 7. Wdrożenie na Vercel | `vercel.json`, nagłówki, podgląd i produkcja | Sekcja 8 spełniona |

MVP = fazy 0–4 i 7. EDO jest w MVP (faza 3), bo to aktywo wymienione wprost w celu projektu.

---

## 8. Wdrożenie (Vercel)

- Statyczny build `apps/web/dist`, bez funkcji serwerowych, bez zmiennych środowiskowych z
  sekretami.
- `vercel.json`: rewrite wszystkich ścieżek bez pliku na `/index.html`; nagłówki:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.nbp.pl https://api.coingecko.com; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`
  - `/sw.js` i `/registerSW.js`: `Cache-Control: no-cache, no-store, must-revalidate`
  - `/assets/*` (pliki z hashem): `Cache-Control: public, max-age=31536000, immutable`
  - `/index.html` i `/manifest.webmanifest`: `Cache-Control: no-cache`
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
    `Cross-Origin-Opener-Policy: same-origin`.
- **Plan Hobby na Vercel jest tylko do użytku niekomercyjnego.** Dopóki aplikacja jest darmowa i
  bez reklam, Hobby wystarcza. Przed włączeniem płatności, reklam lub linków afiliacyjnych trzeba
  przejść na plan Pro.

---

## 9. Weryfikacja (testy statystyczne, normatywne)

Zasada tolerancji: test porównuje statystykę z wartością teoretyczną w granicach `z·SE`
z `z = 4` (fałszywy alarm ok. 6·10⁻⁵ na asercję) przy ustalonym ziarnie; ziarno jest częścią
testu.

| ID | Co sprawdza | Kryterium |
|---|---|---|
| T1 | Generatory | xoshiro128** zgodny z wektorami referencyjnymi; jednostajna: χ² na 100 przedziałach, p > 10⁻⁴; normalna: średnia, wariancja, skośność, kurtoza w 4 SE przy n = 10⁶ i test KS, p > 10⁻⁴; tabela skali: `mean(s²) = 1 ± 10⁻¹²`, `max(s) < 8` dla ν = 5; strumienie (p,k) nieskorelowane (|r| < 4/√n); powtarzalność ziarna |
| T2 | Wzory zamknięte | GBM: mediana `W_T` zgodna z `W₀(1+g)^T` w przedziale ufności kwantyla; `ln W_T` ma średnią `T·ln(1+g)` i wariancję `Tσ²` (T w latach); `σ = 0` daje dokładnie `W₀(1+g)^T(1−TER)^T` (błąd względny < 10⁻¹²); `PMT` zgodne z wartościami referencyjnymi |
| T3 | Kalibracja | Reżimy + ogony: średnia rocznych log-zwrotów `ln(1+g)`, wariancja `σ²`, korelacje roczne równe wpisanym `ρ` (wszystko w 4 SE, n ≥ 200 000 lat-ścieżek); udział miesięcy w kryzysie `π₁`; BTC: wariancja roczna w roku `y` zgodna z `σ(y)²`; częstość upadku `1 − e^{−hT}`; niepewność parametrów: mediana jednego aktywa `W₀(1+g)^T`, korelacja przesunięć równa `ρ`; inflacja: odchylenie i autokorelacja r/r (lag 12) zgodne z celami kalibracji; kurs: wariancja `q` w stanie stacjonarnym `σ_{q,m}²/(1−φ_q²)` (model GBM) i półokres; zmienność efektywna w PLN zgodna ze wzorem z 4.7 |
| T4 | Księgowość | Na każdej ścieżce: `W_end = W_start + zyski rynkowe + wpłaty − wypłaty − podatki zapłacone − opłaty − koszty`, błąd względny < 10⁻⁹ |
| T5 | Podatki | Ręcznie policzone przypadki: FIFO na 3 partiach; strata rozliczona po 3 latach i wygasła po 5; koszyk krypto z nadwyżką kosztów przeniesioną przez 2 lata i z zakupem bez sprzedaży w tym samym roku; lokata; EDO (wykup po 10 latach i przedterminowy z opłatą); zapłata w kwietniu |
| T6 | Strategie | Stały % nigdy nie wyczerpuje portfela; ABW przy `σ = 0` wyczerpuje portfel dokładnie w ostatnim miesiącu; stała realna kwota rośnie z CPI ścieżki |
| T7 | Własności (fast-check, CRN) | Bez podatków i rebalansu progowego: większa wypłata nie zwiększa wartości na żadnej ścieżce; większa wpłata nie zmniejsza; dodanie aktywa z wagą 0 nie zmienia wyników; wynik nie zależy od liczby workerów; solver zwraca kwotę, dla której `P̂ ≥ X` |
| T8 | Regresja | Migawka wyników dla 3 scenariuszy wzorcowych z ustalonym ziarnem |
| T9 | Backtest (faza 5) | Rozkład 10- i 20-letnich realnych zwrotów akcji USA z modelu obejmuje historyczne okna (dane Shillera): historyczny 5. i 95. percentyl leży między 1. a 99. percentylem modelu |
| T10 | E2E i wydajność | Playwright (telefon, desktop); budżety z 4.14; aplikacja działa offline po pierwszym załadowaniu |

---

## 10. Co zostaje wykonawcy

- Dokładny wygląd komponentów w ramach zasad z `docs/PLAN.md`, sekcja 5.
- Nazwy wewnętrznych funkcji pomocniczych, których plan nie wymienia.
- Dobór ziaren testowych (muszą być ustalone i zapisane w teście).
- Skrypty kalibracyjne: język (TypeScript w Node) i źródła surowych danych zgodnie z 6.5.

## 11. Przegląd „oczami wykonawcy” (wykonany samodzielnie, bez subagenta)

Pytania, które zadałby wykonawca, i rozstrzygnięcia:

1. *Czy `σ` przy niepewności parametrów to zmienność łączna?* Nie, warunkowa na parametrach
   ścieżki (4.1).
2. *Jak liczyć `g` portfela dla ABW?* Mediana realnego CAGR portfela z szybkiego przebiegu 1 000
   ścieżek bez przepływów, liczona raz na scenariusz (**[DD]**).
3. *Co z gotówką po wykupie EDO, gdy użytkownik nie chce rolować?* Opcja „po wykupie: nowa seria
   / do gotówki”, domyślnie nowa seria (**[DD]**).
4. *Z czego płacić podatek w kwietniu?* Jak wypłata: gotówka, potem aktywa przeważone. Sprzedaż
   tworzy zobowiązanie na kolejny rok (ciąg zbieżny, bez iteracji).
5. *Czy `α` i `b` są widoczne dla użytkownika?* Tylko w trybie eksperta, jako „wrażliwość na
   kryzysy”.
6. *Jak traktować aktywo w walucie bazowej innej niż PLN?* Ten sam mechanizm: kurs realny
   względem PLN odwrócony; inflacja bazowa to inflacja waluty bazowej (dla USD i EUR stała).

Decyzje wymagające użytkownika (nie blokują planu): akceptacja tabel 6.2–6.3, nazwa aplikacji,
domyślne włączenie przełącznika „po podatku”.
