// Jeu servi et construit par Vite ; tests unitaires (Vitest) dans tests/.
//   npm run dev     → http://localhost:5173
//   npm run build   → dist/
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // chemins relatifs : le jeu marche aussi sous https://<compte>.github.io/cablemanagement/
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 }, // three.js
  test: {
    include: ['tests/**/*.test.ts'],
    // la physique tourne sur le fil du test (pas de Worker sous Node) : quelques secondes par niveau
    testTimeout: 30_000,
  },
});
