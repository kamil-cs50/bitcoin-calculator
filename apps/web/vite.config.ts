import { lingui } from '@lingui/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { APP_NAME } from './src/app/appConfig.ts';

export default defineConfig({
  plugins: [
    react(),
    babel({ plugins: ['@lingui/babel-plugin-lingui-macro'] }),
    lingui(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json,webmanifest}'] },
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        lang: 'pl',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#f7931a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
