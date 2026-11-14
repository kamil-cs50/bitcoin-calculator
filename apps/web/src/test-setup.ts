import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest bez globals nie rejestruje automatycznego sprzątania RTL.
afterEach(cleanup);

// Katalog tłumaczeń aktywny we wszystkich testach (makra t`` wymagają ustawionego języka).
import './i18n';

// jsdom nie ma ResizeObserver (używa go Radix Popper).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
