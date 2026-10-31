// Jeu servi et construit par Vite ; tests unitaires (Vitest) dans tests/.
//   npm run dev     → http://localhost:5173
//   npm run build   → dist/
import { defineConfig, type Plugin } from 'vite';

// the packages of cable-kit (vendor/, a git submodule) are read from their sources, not their dist/
const conditions = ['source', 'module', 'browser', 'development|production'];

/**
 * What the title screen needs, asked for by the page itself rather than once the script has run (or the
 * stylesheet been read): on a server far away (GitHub Pages), each of those waits costs a round trip.
 * The baked mess of the default aisle (fetched by main.ts) and the fonts the loading title draws with.
 */
const BOOT_ASSETS: { file: RegExp; as: 'fetch' | 'font'; type?: string }[] = [
  { file: /^showcase-.*\.bin$/, as: 'fetch' },
  { file: /^ibm-plex-sans-latin-400-normal-.*\.woff2$/, as: 'font', type: 'font/woff2' },
  { file: /^ibm-plex-mono-latin-500-normal-.*\.woff2$/, as: 'font', type: 'font/woff2' },
  { file: /^ibm-plex-mono-latin-600-normal-.*\.woff2$/, as: 'font', type: 'font/woff2' },
];

function preloadBootAssets(): Plugin {
  return {
    name: 'preload-boot-assets',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return BOOT_ASSETS.flatMap(({ file, as, type }) => {
          const path = files.find((f) => file.test(f.split('/').pop()!));
          if (!path) throw new Error(`preload-boot-assets: nothing built matches ${file}`);
          // crossorigin: fetch() and fonts ask in cors mode, a preload asked otherwise would not serve them
          return [{ tag: 'link', attrs: { rel: 'preload', href: `./${path}`, as, crossorigin: true, ...(type && { type }) }, injectTo: 'head' as const }];
        });
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preloadBootAssets()],
  resolve: { conditions },
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } }, // chemins relatifs : le jeu marche aussi sous https://<compte>.github.io/cablemanagement/
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // three.js dans un fichier à part : chacun sous la limite, et le navigateur garde three.js en cache quand seul
    // le jeu change
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // la physique tourne sur le fil du test (pas de Worker sous Node) : quelques secondes par niveau
    testTimeout: 30_000,
  },
});
