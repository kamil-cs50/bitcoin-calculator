import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.superpowers/**', 'docs/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.es2022 } },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['*.js', '*.config.ts', '**/*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
