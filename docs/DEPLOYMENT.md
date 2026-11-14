# Wdrożenie na Vercel

Aplikacja to statyczny build (`apps/web/dist`): bez funkcji serwerowych, bez kluczy API i bez zmiennych środowiskowych z sekretami. Całą konfigurację wdrożenia zawiera `vercel.json` w korzeniu repozytorium (rewrite SPA, nagłówki cache i bezpieczeństwa, w tym CSP).

> Wykonawca (agent) przygotował konfigurację i sprawdził ją lokalnie, ale **nie wdrażał**: podłączenie repozytorium i pierwsze wdrożenie wymaga konta użytkownika w Vercel, a agent nie ma poświadczeń (spec 12, R-5).

## 1. Pierwsze wdrożenie (robi użytkownik)

1. Zaloguj się na https://vercel.com (konto Hobby wystarcza na start, zob. sekcja 6).
2. **Add New... → Project**, wybierz repozytorium `bitcoin-calculator` z GitHuba (przy pierwszym razie nadaj Vercelowi dostęp do repozytorium).
3. Ustawienia projektu (Vercel odczyta większość z `vercel.json`):
   - **Framework Preset:** Vite.
   - **Root Directory:** korzeń repozytorium (zostaw puste / `./`). Nie ustawiaj `apps/web`: monorepo pnpm musi instalować zależności z korzenia.
   - **Install Command:** `pnpm install --frozen-lockfile` (z `vercel.json`).
   - **Build Command:** `pnpm --filter @sim/web build` (z `vercel.json`).
   - **Output Directory:** `apps/web/dist` (z `vercel.json`).
   - **Node.js:** wersja 20 lub nowsza (Project Settings → General → Node.js Version).
4. **Environment Variables:** brak. Nie dodawaj żadnych.
5. Kliknij **Deploy**. Po zakończeniu dostaniesz adres `https://<projekt>.vercel.app`.
6. Gałąź produkcyjna (domyślnie `main`) wdraża się automatycznie po każdym pushu; pozostałe gałęzie i pull requesty dostają adresy podglądu (preview).

### Własna domena (opcjonalnie)

Project → **Settings → Domains → Add**, wpisz domenę i ustaw u rejestratora rekordy DNS wskazane przez Vercel (A/CNAME). Certyfikat HTTPS Vercel wystawia sam. Service worker i PWA wymagają HTTPS (na `localhost` działają bez niego).

## 2. Sprawdzenie po wdrożeniu

Podstaw własną domenę za `<domena>`.

1. **Nagłówki cache:**
   ```sh
   curl -sI https://<domena>/sw.js | grep -i cache-control
   # cache-control: no-cache, no-store, must-revalidate
   curl -sI https://<domena>/index.html | grep -i cache-control
   # cache-control: no-cache
   curl -sI https://<domena>/assets/<plik-z-hashem>.js | grep -i cache-control
   # cache-control: public, max-age=31536000, immutable
   ```
   Nazwę pliku z `assets/` weź z kodu źródłowego strony (`view-source:https://<domena>/`).
2. **Nagłówki bezpieczeństwa:** `curl -sI https://<domena>/ | grep -iE "content-security-policy|x-content-type|referrer|permissions|cross-origin"` powinno zwrócić CSP (z `default-src 'self'`, `frame-ancestors 'none'`, `connect-src` z `api.nbp.pl` i `api.coingecko.com`, bez `'unsafe-eval'`), `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` i `same-origin` dla COOP.
3. **Rewrite SPA:** wejdź bezpośrednio (wklej w pasek adresu) na `https://<domena>/wynik`, `/plan` i `/metodologia`. Każdy adres ma się wczytać (bez 404), a odświeżenie strony ma zachować widok.
4. **Konsola:** otwórz DevTools → Console na pełnym przepływie (portfel, plan, wynik, metodologia). Brak błędów „Content Security Policy”.
5. **PWA:** w Chrome (DevTools → Application → Manifest) manifest bez błędów, ikony 192/512 i maskable; na telefonie „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.
6. **Offline:** po pierwszym załadowaniu (poczekaj na komunikat o gotowości offline) włącz tryb samolotowy lub DevTools → Network → Offline i odśwież: aplikacja musi się uruchomić i policzyć wynik.

## 3. Aktualizacja aplikacji (service worker)

Rejestracja service workera działa w trybie `prompt`. Po nowym wdrożeniu przeglądarka pobiera w tle nowy `sw.js` (dzięki `no-cache` na `/sw.js` sprawdza go przy każdej wizycie). Użytkownik widzi baner **„Dostępna nowa wersja”**; po kliknięciu „Odśwież” nowy service worker przejmuje stronę i aplikacja przeładowuje się. Do czasu kliknięcia działa stara wersja z cache (dane zapisane w IndexedDB się nie zmieniają). Pliki w `/assets/` mają hash w nazwie, więc długi cache jest bezpieczny.

## 4. Lokalna weryfikacja przed wdrożeniem

```sh
pnpm install --frozen-lockfile
pnpm --filter @sim/web build
pnpm --filter @sim/web preview        # http://localhost:4173
```

`vite preview` ustawia te same nagłówki bezpieczeństwa (w tym CSP) co `vercel.json`: `apps/web/vite.config.ts` czyta je z `vercel.json` (`apps/web/src/deploy/vercelHeaders.ts`). Test `apps/web/src/deploy/vercelConfig.test.ts` pilnuje treści `vercel.json`, a `apps/web/e2e/csp.spec.ts` sprawdza na buildzie produkcyjnym brak naruszeń CSP (Worker, KaTeX, service worker, fonty, wykresy). Pełne e2e: `pnpm --filter @sim/web e2e` (buduje i uruchamia podgląd). Nagłówki cache (`/sw.js`, `/assets/*`, `/index.html`) są wymuszane wyłącznie przez Vercel; lokalnie sprawdza je test konfiguracji, a prawdziwe nagłówki trzeba obejrzeć po wdrożeniu (sekcja 2).

## 5. Uwagi o CSP

CSP jest w `vercel.json` (źródło prawdy). Jeśli dodasz nowy zewnętrzny host (inne API), dopisz go do `connect-src` i zaktualizuj test. Aplikacja nie używa `eval` (zod działa w trybie bez JIT, `z.config({ jitless: true })`), a fonty KaTeX są osobnymi plikami (`font-src 'self'`).

## 6. Plan Hobby a Pro

**Plan Hobby na Vercel jest tylko do użytku niekomercyjnego.** Dopóki aplikacja jest darmowa i bez reklam, Hobby wystarcza. **Przed włączeniem płatności, reklam lub linków afiliacyjnych trzeba przejść na plan Pro.** Szczegóły: https://vercel.com/docs/limits/fair-use-guidelines
