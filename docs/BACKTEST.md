# Backtest modelu na danych historycznych (spec T9)

Kryterium T9: rozkład 10- i 20-letnich **realnych** zwrotów akcji USA z modelu obejmuje okna historyczne.
Historyczny 5. i 95. percentyl leży między 1. a 99. percentylem modelu.

## Dane i licencja

Źródło: Robert J. Shiller, `ie_data.xls` (shillerdata.com), kolumna „Real Total Return Price” (realna cena S&P Composite
z reinwestowanymi dywidendami, deflowana CPI USA). Zgodnie ze spec 6.5 (brak licencji, tylko wyłączenie
odpowiedzialności) **szeregu nie dołączamy do repozytorium ani do aplikacji**: skrypt czyta plik lokalny, a w
repozytorium jest tylko wynik (statystyki pochodne). Bootstrap historyczny (`engine/src/models/bootstrap.ts`) jest
biblioteką bez danych; w interfejsie wolno go używać tylko na szeregach wgranych przez użytkownika.

Plik użyty w pomiarze: wersja z komunikatu pliku „Last Saved 2024-09-04” (dane do 2024-09), pobrana lokalnie z linku
ze strony shillerdata.com (CDN `img1.wsimg.com`). Link `econ.yale.edu/~shiller/data/ie_data.xls` zwrócił starszą wersję
(zapis 2023-09).

## Jak uruchomić

1. Pobierz `ie_data.xls` ze strony shillerdata.com (sekcja „Data”) do katalogu poza repozytorium.
2. Wyeksportuj arkusz „Data” do CSV (separator przecinek), np.
   `soffice --headless --convert-to 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1' ie_data.xls`
   (powstaje `ie_data-Data.csv`) albo w Excelu „Zapisz jako CSV” dla arkusza „Data”.
3. Z katalogu `packages/data`:
   `pnpm exec tsx scripts/backtest-shiller.ts --input /ścieżka/ie_data-Data.csv --write-md ../../docs/BACKTEST.md`
   Opcje: `--since YYYY-MM`, `--paths 20000`, `--seed 20261113`. Bez `--write-md` skrypt wypisuje JSON; kod wyjścia
   jest 1, gdy T9 (wariant z niepewnością parametrów) nie przechodzi.

Skrypt przepisuje tylko blok między znacznikami `backtest:begin` i `backtest:end`.

## Metoda

- Historia: nakładające się okna 120 i 240 miesięcy na szeregu realnego total return; CAGR = (P_{t+n}/P_t)^{12/n} − 1.
- Model: `MarketSimulator` (to samo jądro rynku co symulacja, spec 4.3–4.5) dla aktywa `usEquity` ze zbioru 2026.11:
  reżimy, rozkład t-Studenta, niepewność parametrów (skala 1, jak w aplikacji; dla porównania też skala 0). Zwrot
  nominalny w walucie notowania, bez kosztów i podatków, realny = nominalny − stała inflacja (`inflation.longRun`
  ze zbioru, 3%). Wspólne ścieżki dla obu horyzontów, ziarno stałe.
- Porównanie: p1, p5, p50, p95, p99 modelu i historii oraz udział okien historycznych poza [p1, p99] modelu.

## Wynik

<!-- backtest:begin -->
Wykonano: 2026-11-14, plik wejściowy: arkusz „Data” ie_data.xls (okno 1871-01 do 2024-09, 1845 miesięcy), model: zbiór danych 2026.11, 20000 ścieżek, ziarno 20261113.

Parametry modelu (aktywo `usEquity`): g = 6,0%, σ = 16,0%, se = 2,0%, α = 1, b = 1; ν = 5; reżimy p01 = 0.04, p10 = 0.2, κ₁ = 2.2, Δ = 0.175; deflator 3,0% rocznie.

Roczne zwroty złożone (CAGR), realne, z reinwestowanymi dywidendami; okna historyczne nakładają się (efektywnie mało niezależnych obserwacji).

| Horyzont | Źródło | Okna / ścieżki | p1 | p5 | p50 | p95 | p99 | T9 |
|---|---|---|---|---|---|---|---|---|
| 10 lat | historia | 1725 | -3,8% | -2,2% | 7,0% | 15,1% | 18,1% | |
| 10 lat | model, z niepewnością parametrów (tak jak w aplikacji, skala 1) | 20000 | -10,7% | -6,6% | 3,3% | 12,4% | 16,3% | przechodzi |
| 10 lat | model, bez niepewności parametrów (skala 0) | 20000 | -10,1% | -6,0% | 3,4% | 11,7% | 15,0% | NIE przechodzi |
| 20 lat | historia | 1605 | 0,7% | 1,8% | 6,8% | 11,8% | 12,8% | |
| 20 lat | model, z niepewnością parametrów (tak jak w aplikacji, skala 1) | 20000 | -7,2% | -4,3% | 3,1% | 10,3% | 13,1% | przechodzi |
| 20 lat | model, bez niepewności parametrów (skala 0) | 20000 | -6,3% | -3,5% | 3,2% | 9,3% | 11,7% | NIE przechodzi |

Wynik T9 (wariant z niepewnością parametrów, oba horyzonty): **przechodzi**.
<!-- backtest:end -->

## Interpretacja i ograniczenia

- Okna historyczne nakładają się, więc 1 725 okien 10-letnich to w przybliżeniu kilkanaście niezależnych
  obserwacji, a 20-letnich: kilka. Percentyle historyczne mają duży błąd próbkowania; T9 jest testem zgodności
  zasięgu, nie dopasowania.
- Parametry `usEquity` w zbiorze to prognoza (g = 6% nominalnie, `verified: 'no'` dla σ i `se`), a nie
  dopasowanie do historii. Mediana modelu leży więc wyraźnie poniżej historycznej mediany (historia: ok. 7% realnie
  od 1871 r.), a dolny ogon modelu jest znacznie niższy od najgorszego historycznego okna. T9 jest spełnione głównie
  dzięki szerokości rozkładu modelu, nie jego środkowi.
- Deflator modelu jest stały: model nie ma tu szumu inflacji USA, więc rozkład realny jest odrobinę węższy niż
  realny z historii (test jest przez to surowszy). Inflacja ze zbioru to inflacja polska, a nie USA.
- Wariant bez niepewności parametrów (skala 0) nie przechodzi T9 (górny ogon). To znaczy, że zgodność T9 zależy od
  uwzględnienia niepewności parametrów (spec 4.5), co aplikacja robi domyślnie.
- Historia 1871–2024 dotyczy jednego kraju i jednej ścieżki; przeżycie USA zawyża historyczne zwroty (survivorship).
