// Jeu servi et construit par Vite ; tests unitaires (Vitest) dans tests/.
//   npm run dev     → http://localhost:5173
//   npm run build   → dist/
import { defineConfig } from 'vite';

// the packages of cable-kit (vendor/, a git submodule) are read from their sources, not their dist/
const conditions = ['source', 'module', 'browser', 'development|production'];

export default defineConfig({
  base: './',
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
