import { defineConfig } from '@lingui/cli';

export default defineConfig({
  sourceLocale: 'pl',
  locales: ['pl', 'en'],
  catalogs: [{ path: '<rootDir>/src/i18n/locales/{locale}', include: ['src'] }],
});
