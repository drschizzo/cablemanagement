// Analyse statique : erreurs probables seulement (variables inconnues ou inutilisées, code mort…), pas de style.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'vendor/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // les poignées de développement (window.game, testkit) sont volontairement non typées
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser } },
  { files: ['src/**/*.worker.ts'], languageOptions: { globals: globals.worker } },
  { files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
);
