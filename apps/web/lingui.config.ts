import { defineConfig } from '@lingui/cli';

export default defineConfig({
  sourceLocale: 'pl',
  locales: ['pl'],
  catalogs: [{ path: '<rootDir>/src/i18n/locales/{locale}', include: ['src'] }],
});
