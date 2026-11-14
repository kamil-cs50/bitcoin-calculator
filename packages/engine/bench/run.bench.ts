import { test } from 'vitest';
import { measure } from './measure';

// Pomiar wydajności (spec 4.14): 10 000 ścieżek, 360 mies., 6 aktywów (2 w USD), realistic, podatki pl, 1 wątek.
// Uwaga: vitest transformuje moduły (dostęp do importów przez obiekt modułu), co spowalnia gorącą pętlę;
// wartość miarodajna dla produkcji (bundle) daje `pnpm --filter @sim/engine bench:node`.
test('runBatch: 10 000 ścieżek × 360 mies.', () => {
  measure((l) => process.stderr.write(l + '\n'));
}, 600_000);
