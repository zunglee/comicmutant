import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  server: { port: 4323, host: '127.0.0.1' },
  // Never inline fonts as data: URIs — the production CSP allows fonts from 'self' only.
  build: { assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined) },
  // CSS-only font packages must be bundled for SSR; the native SQLite driver must not be.
  ssr: { external: ['better-sqlite3'], noExternal: [/^@fontsource/] },
});
