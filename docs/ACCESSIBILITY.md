# Dostępność (zadanie 46)

Cel: WCAG 2.2 AA, Lighthouse accessibility ≥ 0,95, obsługa samą klawiaturą, oba motywy i oba języki.

> **Do wykonania przez właściciela.** Tabela „Wynik ręcznego przejścia” na końcu tego dokumentu jest **pusta**:
> przejście czytnikiem ekranu (NVDA/VoiceOver/TalkBack) oraz ręczna kontrola klawiatury i kontrastu na realnych
> urządzeniach wymagają człowieka i sprzętu, których agent nie ma. Zadanie 46 jest więc spełnione tylko w części
> zautomatyzowanej (axe, Lighthouse, e2e klawiatury); nie należy czytać tego dokumentu jako potwierdzenia pracy
> z czytnikiem ekranu.

## Co zostało sprawdzone automatycznie (i jest w CI)

| Kontrola | Gdzie | Wynik |
|---|---|---|
| axe-core (tagi wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa), brak naruszeń `serious`/`critical` | `apps/web/e2e/a11y.spec.ts` | 0 naruszeń na trasach `/`, `/portfel`, `/plan`, `/wynik`, `/porownanie`, `/zalozenia`, `/ustawienia`, `/metodologia`, 404; motyw jasny i ciemny × polski i angielski (4 przebiegi), na profilach Pixel 7 i Desktop Chrome |
| Kontrast kolorów (reguła axe `color-contrast`, w zestawie powyżej) | j.w. | spełniony w obu motywach (`prefers-reduced-motion` włączone w teście, żeby axe nie trafił w środek animacji koloru) |
| Lighthouse accessibility | `lighthouserc.json`, job „Lighthouse” | 1,00 na `/`, `/portfel`, `/zalozenia`, `/ustawienia`, `/metodologia` (próg 0,95) |
| Nawigacja klawiaturą: Tab przez całą stronę na każdej trasie | `apps/web/e2e/keyboard.spec.ts` | fokus za każdym razem się przesuwa, na koniec opuszcza dokument (brak pułapek), Shift+Tab wraca; każdy element fokusowalny ma widoczny wskaźnik (obrys lub cień) i jest widoczny |
| Link „Przejdź do treści” | `keyboard.spec.ts` | pierwszy element po Tab, widoczny po fokusie, Enter przenosi fokus do `main#tresc` |
| Przepływ portfel → wynik bez myszy | `keyboard.spec.ts` | Tab do kafelka, Enter, wpisanie kwoty, zatwierdzenie Enterem, wynik policzony |
| Brak przewijania poziomego, nawigacja mieści się na wąskim ekranie | `a11y.spec.ts` | spełnione (Pixel 7) |
| Cele dotykowe ≥ 44 px | klasy `min-h-11` na przyciskach, linkach, suwakach | stosowane w całej aplikacji (kontrola kodu, nie automatyczny pomiar wszystkich elementów) |

Znalezione i poprawione przy audycie: przewijany region wzoru w metodologii bez fokusu (zadanie 43, `tabIndex=0`,
`role=region`, etykieta). W zadaniu 46 audyt nie wykrył dalszych naruszeń axe ani pułapek fokusu.

## Czego NIE da się sprawdzić w środowisku agenta: do wykonania przez użytkownika

Ręczne przejście czytnikiem ekranu i pomiar na realnych urządzeniach nie zostały wykonane (brak czytnika ekranu i
urządzeń w środowisku agenta). Automatyczne testy (axe, Tab) nie zastępują tych kroków: axe wykrywa ok. 30–50% problemów,
a nie ocenia sensowności kolejności czytania ani zrozumiałości opisów wykresów.

### Lista kontrolna: czytnik ekranu (VoiceOver na iOS/macOS albo NVDA/TalkBack)

Dla każdego kroku zanotuj: OK / problem + opis. Wykonaj po polsku i po angielsku (Ustawienia → Język).

- [ ] Strona główna: tytuł strony i nagłówek `h1` odczytane, link „Przejdź do treści” działa.
- [ ] Nawigacja główna ma etykietę „Główna nawigacja”; bieżąca pozycja jest oznaczona (aria-current).
- [ ] Portfel: kafelki aktywów odczytywane jako przyciski z nazwą; formularz ma etykiety pól („Kwota”, „Liczba BTC”);
      po dodaniu pozycji czytnik zapowiada zmianę (suma „Razem”) lub da się ją znaleźć.
- [ ] Plan: pola (horyzont, wpłata miesięczna, wypłaty, wiek) mają etykiety i opisy błędów powiązane z polem.
- [ ] Wynik: stan „Liczymy …” jest zapowiedziany (role=status); ostrzeżenia silnika (role=alert) są odczytane.
- [ ] Wachlarz możliwych wartości: wykres ma opis tekstowy (`role=img` + etykieta) i tabelę danych jako alternatywę;
      suwak roku odczytuje wartość („za 10 lat (2036)”); kafelki KPI odczytują sensowne zdania.
- [ ] Histogram: opis i tabela danych dostępne.
- [ ] Przełączniki „Realnie”, „Po podatku”, „Tryb eksperta”: odczytywany stan włączony/wyłączony.
- [ ] Porównanie, Założenia (tabele z nagłówkami, linki do źródeł), Ustawienia (przełącznik języka i motywu, eksport/import).
- [ ] Metodologia: wzory (region przewijany, `aria-label`) i wersja MathML są czytelne; przypisy literatury działają.
- [ ] Okna dialogowe (np. potwierdzenia): fokus trafia do okna, Escape zamyka, fokus wraca na wywołujący element.
- [ ] Banner aktualizacji PWA („Dostępna nowa wersja”) jest zapowiedziany i dostępny z klawiatury.

### Lista kontrolna: klawiatura i kontrast (ręcznie, uzupełnienie testów)

- [ ] Przejście samą klawiaturą całego przepływu (Portfel → Plan → Wynik → Założenia → Ustawienia) na komputerze i na
      telefonie z klawiaturą Bluetooth; wskaźnik fokusu jest widoczny na wszystkich elementach, także na wykresach i suwakach.
- [ ] Kontrast w obu motywach na realnym ekranie (jasne słońce na telefonie, tryb ciemny nocą): wykresy (linie i obszary
      wachlarza) odróżnialne bez koloru; tekst pomocniczy czytelny.
- [ ] Powiększenie tekstu do 200% i szerokość 320 px: brak obciętej treści i przewijania poziomego.
- [ ] `prefers-reduced-motion` i `prefers-color-scheme` respektowane po zmianie ustawień systemu.

### Wynik ręcznego przejścia

| Czytnik / urządzenie | Data | Wynik | Uwagi |
|---|---|---|---|
| _do uzupełnienia przez użytkownika_ | | | |
