# Metodologia

Opis modelu symulacji dla osób, które chcą wiedzieć, co dokładnie liczy aplikacja. Ten sam tekst, w prostszej
formie i z odnośnikami do literatury, jest w aplikacji na stronie `/metodologia`. Specyfikacja normatywna:
`docs/superpowers/specs/2026-11-13-portfolio-simulator-design.md` (sekcje 4.1–4.14 i poprawki R-1..R-6 z sekcji 12).
Parametry i ich źródła: `docs/DATA_SOURCES.md`. Backtest: `docs/BACKTEST.md`.

**Model nie jest prognozą ani rekomendacją inwestycyjną.** Pokazuje, jak mogą potoczyć się losy portfela przy
założeniach, które można zobaczyć i zmienić. Wzory są w aneksie na końcu; sekcja „Uproszczenia i ograniczenia”
mówi, gdzie model upraszcza lub opiera się na niesprawdzonych wartościach.

## Krok czasowy i kolejność zdarzeń (spec 4.1)

Krok miesięczny, horyzont do 80 lat. Modelujemy logarytmiczne stopy zwrotu (bez obcinania). Wpisany oczekiwany zwrot
`g` to mediana długookresowego CAGR, zmienność `σ` to odchylenie rocznego logarytmicznego zwrotu przy ustalonych
parametrach ścieżki.

Kolejność zdarzeń w miesiącu: (1) kalendarz (styczeń: ustalenie rocznej wypłaty, reset limitów IKE i IKZE, wygaśnięcie
strat; kwiecień: zapłata podatku za poprzedni rok), (2) przychody do gotówki (czynsz, odsetki, kupony, wykupy),
(3) wpłaty, wypłaty i zdarzenia jednorazowe (z góry), (4) rebalans, (5) zwroty rynkowe z TER, (6) aktualizacja
inflacji, kursów, reżimu i zapis migawki.

Sprzedaż z zyskiem zwiększa zobowiązanie płatne w kwietniu. Raportowana wartość „po podatku” to aktywa minus naliczony
podatek minus podatek od niezrealizowanych zysków przy sprzedaży całości. Ruina to pierwszy miesiąc bez możliwości
pokrycia wypłaty z płynnych aktywów; ścieżka zostaje z wartością 0 i nigdy nie jest usuwana ze statystyk.

## Liczby losowe (spec 4.2)

Generator xoshiro128** (Blackman i Vigna 2021) inicjowany SplitMix32; osobny strumień dla każdej pary (ścieżka,
czynnik); jedno losowanie to jedna liczba. Normalna przez odwrócenie dystrybuanty (algorytm AS 241, Wichura 1988).
Skutki: wynik niezależny od liczby wątków, dodanie aktywa nie zmienia pozostałych losowań, scenariusze porównujemy na
wspólnych liczbach losowych. Odrzucone: zmienne antytetyczne i quasi-Monte Carlo.

## Grube ogony (spec 4.3)

Szoki wszystkich czynników mnożymy przez jedną wspólną skalę miesiąca z tabeli 1024 kwantyli rozkładu t-Studenta
(domyślnie ν = 5, założenie), znormalizowanej do jednostkowej wariancji i o ograniczonym nośniku. Surowy rozkład t
daje nieskończoną wartość oczekiwaną wykładnika zwrotu (Geweke 2001). Przy jednej skali kowariancja szoków równa się
macierzy `R̃` dokładnie (McNeil, Frey i Embrechts 2015). Niepoprawną macierz korelacji rzutujemy na najbliższą
poprawną (Higham 2002) i pokazujemy ostrzeżenie.

## Reżimy rynku (spec 4.4)

Wspólny łańcuch Markowa dwóch stanów, spokój i kryzys (Hamilton 1989; Hardy 2001). Parametry domyślne:
`p01 = 0,04`, `p10 = 0,20`, `κ1 = 2,2`, `Δ = 0,175` (założenia). Przesunięcie średniej w kryzysie jest względne
(`α σ δ`), a udział wariancji rocznej z reżimu `ω` jest ograniczony do 0,8. Kalibracja jest dokładna: średnia, wariancja
i korelacje roczne zgadzają się z wpisanymi. Nie ma osobnych macierzy korelacji w kryzysie (Forbes i Rigobon 2002).
Tryb eksperta pozwala wybrać model podręcznikowy (GBM: `π1 = 0`, skala ≡ 1), w którym mediana wartości końcowej
równa się `W₀(1+g)^T`; w modelu realistycznym jest nieco wyższa.

## Niepewność parametrów (spec 4.5)

Dla każdej ścieżki losujemy stałe przesunięcie rocznego dryfu o odchyleniu SE aktywa, skorelowane macierzą wpisanych
korelacji (Barberis 2000; Pástor i Stambaugh 2012). Mediana jednego aktywa pozostaje `W₀(1+g)^T`, średnia rośnie o
`exp(SE²T²/2)`, więc wynikiem głównym są mediana i pasma. Losujemy też długookresową inflację. Zmienności nie
losujemy (Merton 1980).

## Inflacja (spec 4.6)

AR(1) inflacji trendu z miesięcznym zapisem indeksu cen. Kalibracja do odchylenia i autokorelacji inflacji r/r
(lag 12) przez bisekcję `ρ₁₂(φ)`; start od ostatniego odczytu r/r; 13 ostatnich poziomów CPI w zbiorze danych.
Deflacja dozwolona. Inflacja zagraniczna stała.

## Waluty (spec 4.7)

Realny kurs wraca do średniej (półokres domyślnie 4 lata; Rogoff 1996; Taylor i Taylor 2004). `σ` kursu w tabelach to
odchylenie 12-miesięcznej zmiany logarytmu realnego kursu (R-2), z której wyznaczamy zmienność miesięczną. Domyślnie
brak trendu realnej aprecjacji (efekt Balassy i Samuelsona to parametr eksperta, 0).

## Typy aktywów (spec 4.8)

Aktywa ryzykowne: sekcje 4.3–4.5. Lokata: stopa goniąca inflację plus rozpiętość, 19% przy wypłacie odsetek.
Obligacje stałokuponowe: aktywo ryzykowne o niskiej zmienności, ujemnie skorelowane z inflacją. EDO: partie zakupu,
rok 1 stałe oprocentowanie, potem inflacja sprzed dwóch miesięcy plus marża, wykup po 10 latach i przedterminowy z
opłatą. Kryptowaluty: zanik `g(t)` i `σ(t)`, upadek jako stan pochłaniający (wpisane `g` to mediana warunkowa na
przetrwaniu, bez kompensaty `h·L`), opcjonalna nakładka potęgowa (domyślnie wyłączona, kontrowersyjna). Nieruchomość:
„mieszkam” albo „na wynajem”, niepłynna, tylko zdarzenie „sprzedaż w roku X”.

## Portfel, rebalans i koszty (spec 4.9)

Polityki: brak, roczna (styczeń), progowa (pasmo ±X pp), tylko przepływami. Koszt transakcji w punktach bazowych.
Kolejność źródeł wypłaty: gotówka i lokaty, aktywa przeważone, EDO. Konta: zwykłe, IKE, IKZE (limity wpłat, reguły
wypłat); wpłata ponad limit trafia na konto zwykłe.

## Podatki (spec 4.10)

Papiery wartościowe: 19%, FIFO osobno dla każdego rachunku, straty przez 5 lat (reguła z sekcji ograniczeń).
Kryptowaluty natywne: koszyk bez FIFO, nadwyżka kosztów bez limitu czasu, bez łączenia z papierami. ETP na kryptowalutę
to papier wartościowy; złoto fizyczne po 6 miesiącach zwolnione; ETC to papier wartościowy. Odsetki: 19% u źródła.
EDO: podatek od sumy odsetek przy wykupie. Najem: ryczałt 8,5% do 100 000 zł i 12,5% powyżej. Zapłata w kwietniu.
Tryby „bez podatków” i „stawka ogólna”. Poza zakresem: danina solidarnościowa, zaokrąglenia, dywidendy i WHT.
**Przepisy zapisane z pamięci, niezweryfikowane w ISAP.**

## Wpłaty i wypłaty (spec 4.11)

Wpłaty z indeksacją (brak, inflacja, inflacja plus wzrost realny). Wypłaty: stała kwota realna, stały procent
(styczeń, 12 rat), amortyzacja (PMT z góry; Waring i Siegel 2015), reguły Guytona i Klingera (2006) ze stałymi
parametrami (próg 20%, korekta 10%, limit indeksacji 6%, ochrona kapitału tylko gdy do końca zostaje więcej niż 15
lat). Zdarzenia jednorazowe.

## Śmiertelność (spec 4.12)

Tablice trwania życia GUS 2025 (`q_x`, wiek 0–100, mężczyźni i kobiety). Prawdopodobieństwo ruiny za życia to suma
prawdopodobieństw ruiny w miesiącu `t` ważona prawdopodobieństwem dożycia. Opcja „+2 lata” (założenie). Przedział
uwzględnia tylko błąd symulacji.

## Statystyki i solvery (spec 4.13)

Percentyle 5/10/25/50/75/90/95, typ 7 (Hyndman i Fan 1996). Przedziały Wilsona (1927) dla prawdopodobieństw,
nieparametryczne dla percentyli. Stałe etapy 1 000, 4 000, 10 000 (opcjonalnie 25 000) ścieżek. Obsunięcia liczone
co miesiąc na indeksie portfela; CVaR 5%. Solvery: bisekcja po kwocie na wspólnych liczbach losowych, zwracany
mniej korzystny koniec przedziału. Bootstrap parami ścieżek dla różnic scenariuszy. Wkład aktywów w ryzyko:
dekompozycja Eulera.

## Wydajność i pamięć (spec 4.14)

Pula Web Workerów, pętla bez alokacji, wyniki jako `Transferable`. Siatka wyników: miesięczna do 10 lat, kwartalna do
40, półroczna powyżej. Limit ścieżek: 10 000 (telefon), 25 000 (komputer). Budżet pamięci wyników 64 MB.
Anulowanie po zmianie parametrów (debounce 250 ms), wyniki progresywne.

## Jak sprawdzamy poprawność

Testy T1–T10 (spec sekcja 9): generatory, wzory zamknięte, kalibracja reżimów i ogonów (w 4 błędach standardowych,
ustalone ziarno), księgowość na każdej ścieżce, ręcznie policzone przypadki podatkowe, strategie wypłat, własności
(fast-check), migawki regresji, backtest na danych Shillera (T9) oraz testy e2e i wydajności. Bootstrap stacjonarny
(Politis i Romano 1994) jest w silniku, ale nie jest podłączony do interfejsu.

## Skąd są dane

Prognozy instytucji, dane (GUS, obligacje skarbowe, zmienność BTC) i założenia, każdy parametr z rodzajem i statusem
weryfikacji (`docs/DATA_SOURCES.md`). Nieruchomość: Jordà i in. 2019, wartości są założeniami. Kalibracja używa
estymatora Ledoita i Wolfa 2004. Aplikacja zawiera tylko statystyki pochodne; CoinGecko i NBP tylko na żądanie
użytkownika.

## Uproszczenia i ograniczenia

1. **Backtest nie dowodzi, że model jest dobry.** T9 (rozkład 10- i 20-letnich realnych zwrotów akcji USA z modelu
   obejmuje historyczne okna Shillera 1871–2024) przechodzi tylko z niepewnością parametrów; bez niej (skala 0) nie
   przechodzi (górny ogon). Zgodność wynika z szerokości rozkładu, nie z jego środka: mediana modelu to ok. 3% realnie,
   w historii ok. 7%, bo domyślne założenia to ostrożna prognoza (6% nominalnie), a nie dopasowanie do historii.
   Okna nakładają się (kilkanaście niezależnych obserwacji dla 10 lat, kilka dla 20), dotyczą jednego kraju, który
   przetrwał (survivorship), a deflator w teście jest stały (3%). Szczegóły: `docs/BACKTEST.md`.
2. **Większość parametrów to założenia** (`verified: 'no'`): `σ`, korelacje, SE, `α`, `b`, parametry reżimów, `ν`.
   Inflacja nie została skalibrowana na miesięcznym szeregu GUS (nie udało się go pobrać). `σ` kursu z NBP jest
   nominalne, a model potrzebuje realnego.
3. **Przepisy podatkowe z pamięci, niezweryfikowane w ISAP** (serwis odpowiadał pętlą przekierowań 307). Dotyczy
   stawek, reguł krypto, strat, ryczałtu najmu, 5 lat zwolnienia nieruchomości i ustawy o IKE i IKZE. Limity IKE i IKZE
   (2026: 28 260 zł i 11 304 zł; 2027: 30 099 zł i 12 039,60 zł) pochodzą ze źródeł wtórnych; Monitor Polski był
   niedostępny.
4. **Reguła strat z papierów (art. 9 ust. 3 PIT, R-3) to heurystyka zachłanna.** Jednorazowe odliczenie (do 5 mln zł) w
   pierwszym roku z dodatnim dochodem, potem 50% pierwotnej straty rocznie, ważność 5 lat, od najstarszych roczników.
   Rzeczywisty podatnik może wybrać lepszy rok; model nie optymalizuje.
5. **Podatek od niezrealizowanych zysków jest przybliżeniem.** Likwidacja całości w jednym roku podatkowym, rok
   likwidacji traktowany jak rok otwarty. Krypto: 19%·max(0, przychody roku + wartość − koszty roku − nadwyżka z lat
   poprzednich). Pomijamy złoto fizyczne trzymane krócej niż 6 miesięcy i zysk w IKE i IKZE. Rozłożenie sprzedaży na
   lata dałoby inny podatek.
6. **IKE i IKZE.** Limity rosną w symulacji o inflację plus 1 pp (założenie). Wypłata z IKE po 60. r.ż. bez podatku,
   wcześniej 19% od zysku (FIFO sprzedanej części). IKZE po 65. r.ż. 10% od całej kwoty, wcześniej 19% od zysku, bez
   zwrotu wcześniej odliczonych kwot. Pominięty warunek 5 lat wpłat do IKE. Wpłaty początkowe nie zużywają limitu. Wiek
   startowy jest zakładany (35 lat), dopóki go nie wpiszesz.
7. **Nieruchomość.** Niepłynna; brak częściowej i automatycznej sprzedaży; przy ruinie jej wartość też jest zerowana w
   modelu (spójność bilansu). Podatek od sprzedaży 19% od zysku bez kosztów zbycia i nakładów; ryczałt 8,5% i 12,5%
   (progi niezweryfikowane). Interfejs nie ma jeszcze pól: rok zakupu, cena zakupu, rok sprzedaży.
8. **Krypto.** Parametry dryfu są założeniami. Upadek to stan pochłaniający, wpisane `g` jest medianą warunkową na
   przetrwaniu. Nakładka potęgowa (opcjonalna) opiera się na regresji bez podstaw ekonomicznych; jej parametry są
   niezweryfikowane.
9. **Waluty.** Wzór na zmienność miesięczną kursu (R-2) jest przybliżeniem: pomija tłumienie składnika reżimowego przez
   powrót do średniej (w symulacji odchylenie roczne o 2–5% niższe od wpisanego dla silnego wpływu kryzysu). Dla
   czynników AR(1) (inflacja, kurs) wpisana korelacja dotyczy szoków miesięcznych (R-1). Inflacja USA i strefy euro
   jest stała.
10. **Drobne przypadki.** Niezapłacony podatek przechodzi na kolejny kwiecień i nie jest ruiną. EDO początkowe traktowane
    jak kupione w t = 0; wykup przedterminowy liniowy, bez zaokrąglania do obligacji po 100 zł. Przedział
    prawdopodobieństwa ruiny za życia uwzględnia tylko błąd symulacji. Solver zwraca mniej korzystny koniec przedziału.
11. **Poza modelem:** zmiany przepisów, niepewność zmienności, dywidendy i WHT, danina solidarnościowa, koszty życia
    poza wpisanymi wypłatami, trwały trend realnego kursu złotego.

## Aneks: wzory

Symbole: `g` mediana rocznego CAGR, `σ` zmienność roczna, `ν` stopnie swobody rozkładu t, `T` horyzont w latach, `i`
aktywo, `p` ścieżka, `t` miesiąc.

### Krok czasowy i liczby losowe

Dryf miesięczny z mediany CAGR i krok wartości portfela z kosztem funduszu (TER).

$$
\mu = \frac{\ln(1+g)}{12}, \qquad V \leftarrow V\,e^{r}\,(1-\mathrm{TER})^{1/12}
$$

Ziarno strumienia dla ścieżki p i czynnika k (fmix32 to finalizator MurmurHash3).

$$
\mathrm{seed}_{p,k} = \operatorname{fmix32}\!\bigl(\operatorname{fmix32}(\mathrm{seed}\oplus 0\mathrm{x}9\mathrm{E}3779\mathrm{B}9\,(p+1))\oplus 0\mathrm{x}85\mathrm{EBCA}6\mathrm{B}\,(k+1)\bigr)
$$

Liczba jednostajna z 32-bitowego wyniku generatora, zawsze ściśle między 0 a 1.

$$
u = \frac{x + 0{,}5}{2^{32}} \in (0,1)
$$

### Grube ogony

Tabela skali z kwantyli rozkładu chi-kwadrat, znormalizowana do jednostkowej wariancji.

$$
s_k = \sqrt{\frac{\nu-2}{Q_{\chi^2_\nu}(u_k)}},\quad u_k = \frac{k+\tfrac12}{K},\quad \frac1K\sum_{k=1}^{K} s_k^2 = 1
$$

Szok miesięczny: wspólna skala razy czynnik Cholesky’ego razy standardowy szum normalny.

$$
\varepsilon_t = s_t\, L\, z_t,\qquad z_t \sim N(0, I),\qquad \operatorname{Cov}(\varepsilon_t) = \tilde{R}
$$

Średnia arytmetyczna wykładnika zwrotu w modelu bez reżimów (liczona z tabeli skali).

$$
E\!\left[e^{r}\right] = e^{\mu}\cdot\frac1K\sum_{k=1}^{K}\exp\!\Bigl(\tfrac{\sigma_m^2 s_k^2}{2}\Bigr)
$$

To samo w modelu z reżimami (rozkład stacjonarny reżimów razem z tabelą skali).

$$
E\!\left[e^{r}\right] = e^{\mu}\sum_{s}\pi_s\, e^{\alpha\sigma\delta_s}\;\frac1K\sum_{k=1}^{K}\exp\!\Bigl(\tfrac{\sigma_m^2\kappa_s^2 s_k^2}{2}\Bigr)
$$

### Reżimy rynku

Rozkład stacjonarny łańcucha dwóch stanów i jego trwałość.

$$
\pi_1 = \frac{p_{01}}{p_{01}+p_{10}},\quad \pi_0 = 1-\pi_1,\quad \lambda = 1-p_{01}-p_{10}
$$

Zwrot czynnika i w miesiącu t: dryf, przesunięcie kryzysowe i szok z mnożnikiem zmienności.

$$
r_{i,t} = \mu_i(t) + \alpha_i\,\sigma_i(t)\,\delta_{s_t} + \sigma_{m,i}(t)\,\kappa_{s_t,i}\,\varepsilon_{i,t}
$$

Przesunięcia reżimowe o zerowej średniej i ich wariancja.

$$
\delta_0 = \pi_1\Delta,\quad \delta_1 = -\pi_0\Delta,\quad V_\delta = \pi_0\pi_1\Delta^2
$$

Mnożnik zmienności aktywa w reżimie i macierz mnożników.

$$
\kappa_{s,i} = 1 + b_i(\kappa_s - 1),\qquad K_{ij} = \pi_0\kappa_{0,i}\kappa_{0,j} + \pi_1\kappa_{1,i}\kappa_{1,j}
$$

Udział wariancji rocznej pochodzący z reżimu (ograniczony walidacją do 0,8).

$$
A = 12 + 2\sum_{k=1}^{11}(12-k)\lambda^{k},\qquad \omega_i = \alpha_i^{2}\,V_\delta\,A \;\le\; 0{,}8
$$

Zmienność miesięczna szoków tak, aby roczna wariancja zgadzała się z wpisaną.

$$
\sigma_{m,i} = \sigma_i\sqrt{\frac{1-\omega_i}{12\,K_{ii}}}
$$

Korelacja szoków wewnątrz reżimu, dla której korelacja roczna równa się wpisanej.

$$
\tilde{R}_{ij} = \frac{\rho_{ij} - \alpha_i\alpha_j V_\delta A}{\sqrt{(1-\omega_i)(1-\omega_j)}\;\dfrac{K_{ij}}{\sqrt{K_{ii}K_{jj}}}}
$$

### Niepewność parametrów

Skorelowane przesunięcia dryfu na ścieżkę; mediana bez zmian, średnia rośnie o podany czynnik.

$$
\Delta\mu^{(p)} = D\,L_\rho\,z,\quad D = \operatorname{diag}(\mathrm{SE}_i),\qquad \operatorname{mediana}(W_T) = W_0(1+g)^T,\quad \frac{E[W_T]}{W_0(1+g)^T} \approx e^{\mathrm{SE}^2 T^2/2}
$$

### Inflacja

Proces inflacji trendu i indeks cen.

$$
x_{t+1} = \bar\imath^{(p)} + \varphi\,(x_t - \bar\imath^{(p)}) + \sigma_\eta\,\varepsilon^{\pi}_{t+1},\qquad \ln \mathrm{CPI}_{t+1} = \ln \mathrm{CPI}_t + \frac{x_{t+1}}{12}
$$

Inflacja rok do roku i losowana długookresowa średnia ścieżki.

$$
\mathrm{yy}_t = \frac{\mathrm{CPI}_t}{\mathrm{CPI}_{t-12}} - 1,\qquad \bar\imath^{(p)} = \bar\imath + \mathrm{SE}_{\bar\imath}\, z
$$

Wariancja inflacji rok do roku jako suma 12 przyrostów miesięcznych procesu.

$$
G(\varphi) = 12 + 2\sum_{k=1}^{11}(12-k)\varphi^{k},\quad \operatorname{Var}\bigl(\ln(1+\mathrm{yy})\bigr) = \frac{V_x}{144}\,G(\varphi),\quad V_x = \frac{\sigma_\eta^2}{1-\varphi^2}
$$

Autokorelacja inflacji rok do roku przy opóźnieniu 12 miesięcy (rozwiązywana bisekcją względem φ).

$$
\rho_{12}(\varphi) = \frac{\varphi\,(1-\varphi^{12})^{2}}{(1-\varphi)^{2}\,G(\varphi)}
$$

### Waluty

Realny kurs wraca do średniej z półokresem H lat.

$$
q_{t+1} = \varphi_q\,q_t + \alpha_q\sigma_q\delta_{s_t} + \sigma_{q,m}\,\kappa\,\varepsilon^{fx},\qquad \varphi_q = 2^{-1/(12H)}
$$

Kurs nominalny z realnego kursu, inflacji polskiej i zagranicznej.

$$
\ln S_t = \ln S_0 + q_t + \bigl(\ln \mathrm{CPI}^{PL}_t - \ln \mathrm{CPI}^{PL}_0\bigr) - \pi^{F}\,\frac{t}{12}
$$

Wariancja 12-miesięcznej zmiany realnego kursu, z której wyznaczamy zmienność miesięczną.

$$
\operatorname{Var}(q_{t+12}-q_t) = 2V_q\,(1-\varphi_q^{12}) + \omega_q\,\sigma_q^{2},\qquad V_q = \frac{\sigma_{q,m}^2\,K_q}{1-\varphi_q^{2}}
$$

Roczna zmienność aktywa zagranicznego w złotych.

$$
\sigma_{\mathrm{PLN}} = \sqrt{\sigma_a^2 + \sigma_{fx}^2 + 2\rho\,\sigma_a\sigma_{fx}}
$$

### Typy aktywów

Stopa lokaty podąża za inflacją plus rozpiętość z szybkością k, bez wartości ujemnych.

$$
d_{t+1} = \max\bigl(0,\; d_t + k\,(x_t + s - d_t)\bigr)
$$

Zanik wzrostu i zmienności kryptowaluty od wartości początkowych do długookresowych.

$$
g(t) = g_\infty + (g_0 - g_\infty)\,e^{-t/\tau_g},\qquad \sigma(t) = \sigma_\infty + (\sigma_0 - \sigma_\infty)\,e^{-t/\tau_\sigma}
$$

Upadek: strata części L wartości i prawdopodobieństwo upadku do roku T.

$$
V \leftarrow V\,(1-L),\qquad P(\text{upadek do roku } T) = 1 - e^{-hT}
$$

### Podatki i księgowość

Papiery wartościowe: P to przychody, K koszt metodą FIFO, O odliczenie strat z poprzednich lat.

$$
\text{podatek} = 0{,}19\cdot\max\bigl(0,\; P - K - O\bigr)
$$

Kryptowaluty: przychody roku minus wydatki roku i nadwyżka kosztów z lat poprzednich.

$$
\text{dochód}_{\text{rok}} = P_{\text{rok}} - \bigl(W_{\text{rok}} + C_{\text{z lat poprzednich}}\bigr)
$$

Tożsamość księgowa sprawdzana testem na każdej ścieżce.

$$
W_{\mathrm{end}} = W_{\mathrm{start}} + Z_{\mathrm{rynek}} + F_{\mathrm{wpłaty}} - F_{\mathrm{wypłaty}} - T_{\mathrm{podatki}} - O_{\mathrm{opłaty}} - K_{\mathrm{koszty}}
$$

Wartość realna jako wartość nominalna podzielona przez indeks cen ścieżki.

$$
W^{\mathrm{real}}_t = \frac{W^{\mathrm{nom}}_t}{\mathrm{CPI}_t}
$$

### Wypłaty

Rata amortyzacji płatna z góry: r to oczekiwany realny zwrot, n pozostałe lata, W wartość portfela.

$$
\operatorname{PMT}(r,n,W,1) = \frac{r\,W}{(1+r)\,\bigl(1-(1+r)^{-n}\bigr)}
$$

### Statystyki

Percentyl typu 7.

$$
Q(p) = x_{(\lfloor h\rfloor)} + (h-\lfloor h\rfloor)\bigl(x_{(\lfloor h\rfloor+1)} - x_{(\lfloor h\rfloor)}\bigr),\qquad h = (n-1)p+1
$$

Przedział ufności Wilsona dla prawdopodobieństwa.

$$
\frac{\hat p + \dfrac{z^2}{2n} \pm z\sqrt{\dfrac{\hat p(1-\hat p)}{n} + \dfrac{z^2}{4n^2}}}{1 + \dfrac{z^2}{n}}
$$

Nieparametryczny przedział ufności percentyla ze statystyk pozycyjnych.

$$
\bigl[\,x_{(\lfloor np - z\sqrt{np(1-p)}\rfloor)},\; x_{(\lceil np + z\sqrt{np(1-p)}\rceil)}\,\bigr]
$$

Średnia z najgorszych 5% wartości końcowych.

$$
\mathrm{CVaR}_{5\%} = \frac{1}{\lceil 0{,}05\,n\rceil}\sum_{j=1}^{\lceil 0{,}05\,n\rceil} x_{(j)}
$$

Realny roczny zwrot portfela ważony czasem (I to indeks portfela, T horyzont w miesiącach).

$$
\mathrm{CAGR}_{\mathrm{real}} = \exp\!\Bigl(\frac{12}{T}\bigl(\ln I_T - \ln \mathrm{CPI}_T\bigr)\Bigr) - 1
$$

Prawdopodobieństwo wyczerpania środków za życia z krzywą przeżycia S.

$$
P = \sum_{t} \hat P(\text{ruina w miesiącu } t)\,S(t)
$$

Bootstrap stacjonarny: nowy blok zaczyna się z prawdopodobieństwem 1/L w każdym kroku.

$$
P(\text{nowy blok}) = \frac1L,\qquad E[\text{długość bloku}] = L
$$

## Literatura

- Barberis, N. (2000). Investing for the long run when returns are predictable. *The Journal of Finance*, 55(1), 225–264.
- Blackman, D., Vigna, S. (2021). Scrambled linear pseudorandom number generators. *ACM Transactions on Mathematical Software*, 47(4), 1–32.
- Forbes, K. J., Rigobon, R. (2002). No contagion, only interdependence: measuring stock market comovements. *The Journal of Finance*, 57(5), 2223–2261.
- Geweke, J. (2001). A note on some limitations of CRRA utility. *Economics Letters*, 71(3), 341–345.
- Guyton, J. T., Klinger, W. J. (2006). Decision rules and maximum initial withdrawal rates. *Journal of Financial Planning*, 19(3), 48–58.
- Hamilton, J. D. (1989). A new approach to the economic analysis of nonstationary time series and the business cycle. *Econometrica*, 57(2), 357–384.
- Hardy, M. R. (2001). A regime-switching model of long-term stock returns. *North American Actuarial Journal*, 5(2), 41–53.
- Higham, N. J. (2002). Computing the nearest correlation matrix: a problem from finance. *IMA Journal of Numerical Analysis*, 22(3), 329–343.
- Hyndman, R. J., Fan, Y. (1996). Sample quantiles in statistical packages. *The American Statistician*, 50(4), 361–365.
- Jordà, Ò., Knoll, K., Kuvshinov, D., Schularick, M., Taylor, A. M. (2019). The rate of return on everything, 1870–2015. *The Quarterly Journal of Economics*, 134(3), 1225–1298.
- Ledoit, O., Wolf, M. (2004). A well-conditioned estimator for large-dimensional covariance matrices. *Journal of Multivariate Analysis*, 88(2), 365–411.
- McNeil, A. J., Frey, R., Embrechts, P. (2015). *Quantitative Risk Management: Concepts, Techniques and Tools* (wyd. poprawione). Princeton University Press.
- Merton, R. C. (1980). On estimating the expected return on the market: an exploratory investigation. *Journal of Financial Economics*, 8(4), 323–361.
- Pástor, Ľ., Stambaugh, R. F. (2012). Are stocks really less volatile in the long run?. *The Journal of Finance*, 67(2), 431–478.
- Politis, D. N., Romano, J. P. (1994). The stationary bootstrap. *Journal of the American Statistical Association*, 89(428), 1303–1313.
- Rogoff, K. (1996). The purchasing power parity puzzle. *Journal of Economic Literature*, 34(2), 647–668.
- Taylor, A. M., Taylor, M. P. (2004). The purchasing power parity debate. *Journal of Economic Perspectives*, 18(4), 135–158.
- Waring, M. B., Siegel, L. B. (2015). The only spending rule article you will ever need. *Financial Analysts Journal*, 71(1), 91–99.
- Wichura, M. J. (1988). Algorithm AS 241: the percentage points of the normal distribution. *Journal of the Royal Statistical Society, Series C (Applied Statistics)*, 37(3), 477–484.
- Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. *Journal of the American Statistical Association*, 22(158), 209–212.
- Shiller, R. J. (2024). Online data: U.S. stock markets 1871–present and CAPE ratio (ie_data.xls). https://shillerdata.com (dostęp: 2026-11-14).
