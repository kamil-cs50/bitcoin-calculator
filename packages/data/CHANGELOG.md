# Changelog `@sim/data`

## 2026.11 (2026-11-13)

- Pierwszy zbiór danych (assets, crypto, market, inflation, fx, edo, taxPL, sources).
- `edo.earlyFeePer100`: `verified` zmienione z `yes` na `secondary` (limit opłaty w liście emisyjnym niezweryfikowany).
- Wariant ładowania dla czystego Node: `loadDatasetNode` w `@sim/data/node` (fs, bez `import.meta.glob`).
- Skrypty kalibracyjne `scripts/calibrate-{inflation,fx,assets,regimes}.ts` (propozycje JSON, nie zmieniają zbioru).
