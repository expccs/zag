import { fileURLToPath } from 'node:url';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The font subsets every first paint needs: Unbounded and Montserrat in
 * Cyrillic (UA copy) and Latin (ENG copy, «UA»/«ENG» pill). Without the
 * preload the browser learns about them only after the CSS is parsed and
 * the text laid out, one round trip later. The other subsets (latin-ext,
 * cyrillic-ext, vietnamese) still load on demand through `unicode-range`.
 */
const PRELOADED_FONTS =
  /^assets\/(unbounded|montserrat)-(cyrillic|latin)-wght-normal-[\w-]+\.woff2$/;

const preloadFonts = (): Plugin => {
  let base = '/';
  return {
    name: 'zag:preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }): HtmlTagDescriptor[] {
        if (!bundle) return [];
        return Object.keys(bundle)
          .filter((fileName) => PRELOADED_FONTS.test(fileName))
          .sort()
          .map((fileName) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: true,
              href: `${base}${fileName}`,
            },
            injectTo: 'head',
          }));
      },
    },
  };
};

export default defineConfig({
  envDir: rootDir,
  plugins: [
    react(),
    preloadFonts(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ZAG Інтерактив',
        short_name: 'ZAG',
        description: 'Створюй світлом — інтерактив на фасаді ZAG',
        lang: 'uk',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/socket\.io\//,
          /^\/health$/,
          /^\/session\//,
        ],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:8080', ws: true },
      '/session': { target: 'http://localhost:8080' },
    },
  },
  build: { sourcemap: true, target: 'es2022' },
});
