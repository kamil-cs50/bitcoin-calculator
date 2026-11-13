# Dziennik decyzji wykonawcy

| Data | Zadanie | Decyzja | Uzasadnienie |
|---|---|---|---|
| 2026-11-13 | start | Skille projektowe czytane z plików (`.claude/skills`), bo narzędzie Skill ich nie rejestruje w tej sesji. | Workflow zachowany: TDD wymuszone w promptach implementerów. |
| 2026-11-13 | start | Przegląd kodu po każdej fazie, nie po każdym zadaniu. | Polecenie użytkownika; ogranicza koszt. |
| 2026-11-13 | start | Tabele 6.2–6.3, nazwa „Wachlarz”, domyślne „po podatku” przyjęte domyślnie. | Polecenie użytkownika. |
| 2026-11-13 | 2 | Lingui: makra przez `@lingui/babel-plugin-lingui-macro` uruchamiane `@rolldown/plugin-babel` (plugin-react 6 nie ma opcji `babel`), katalog `.po` importowany bezpośrednio przez `@lingui/vite-plugin` (bez `lingui compile`). | Najprostsza konfiguracja działająca z Vite 8 i Vitest; `lingui extract` generuje `pl.po`. |
| 2026-11-13 | 2 | `playwright.config.ts` używa `/opt/pw-browsers/chromium` (nadpisywalne `PW_CHROMIUM_PATH`); webServer buduje i uruchamia `vite preview` na porcie 4173. | Chromium preinstalowany, bez `playwright install`. |
| 2026-11-13 | 2 | Root `build` = `pnpm -r build`, więc obejmuje `apps/web` (`tsc --noEmit && vite build`). | Spełnia wymóg zbudowania aplikacji w root build. |
