# Superpowers (vendored)

Skille w tym katalogu pochodzą z [obra/superpowers](https://github.com/obra/superpowers)
w wersji **7.0.2** (licencja MIT, zob. `SUPERPOWERS-LICENSE`).

Są skopiowane do repozytorium jako skille projektowe, ponieważ sesje Claude Code w chmurze
nie instalują pluginów z marketplace'ów deklarowanych w `.claude/settings.json`.
Skille projektowe ładują się bezpośrednio z repozytorium w każdej sesji.

Zmiany względem oryginału:
- odwołania `superpowers:<skill>` zamieniono na `<skill>`, bo skille projektowe nie mają
  prefiksu pluginu;
- hook `hooks/session-start` skopiowano do `.claude/hooks/superpowers-session-start`
  i podpięto w `.claude/settings.json` (SessionStart). Wstrzykuje treść `using-superpowers`
  na starcie sesji, tak jak plugin.

Aktualizacja: skopiuj `skills/` z nowej wersji obra/superpowers i powtórz zamianę prefiksu:
`grep -rlE "superpowers:[a-z-]+" .claude/skills | xargs sed -i -E "s/superpowers:([a-z][a-z-]*)/\1/g"`.
