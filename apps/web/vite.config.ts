import { lingui } from '@lingui/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { APP_NAME } from './src/app/appConfig';
import { previewSecurityHeaders } from './src/deploy/vercelHeaders';

export default defineConfig({
  plugins: [
    {
      // Nazwa aplikacji w index.html pochodzi z appConfig (jedno źródło prawdy).
      name: 'app-name-html',
      transformIndexHtml: { order: 'pre', handler: (html: string) => html.replaceAll('%APP_NAME%', APP_NAME) },
    },
    react(),
    babel({ plugins: ['@lingui/babel-plugin-lingui-macro'] }),
    lingui(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json,webmanifest}'] },
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        lang: 'pl',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#f7931a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  // Fonty (KaTeX) jako pliki, nie data: URI: CSP ma `font-src 'self'` bez `data:`.
  build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) },
  worker: { format: 'es' },
  // Podgląd produkcyjnego buildu z tymi samymi nagłówkami (CSP) co na Vercel.
  preview: { headers: previewSecurityHeaders() },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
