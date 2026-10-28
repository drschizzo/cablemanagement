// Analyse statique : erreurs probables seulement (variables inconnues ou inutilisées, code mort…), pas de style.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
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
  // les paquets ne dépendent pas du jeu : rien hors de leur dossier, et pas de three.js pour le moteur
  { files: ['packages/**/*.ts'], languageOptions: { globals: globals.browser }, rules: { 'no-restricted-imports': ['error', packageBounds()] } },
  {
    files: ['packages/avbd-cables/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { ...packageBounds(), paths: [{ name: 'three', message: 'avbd-cables reste sans dépendance.' }] }] },
  },
  { files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
);

function packageBounds() {
  return { patterns: [{ group: ['../../*', '**/src/*'], message: 'Un paquet n\'importe rien hors de son dossier (ni le jeu ni un autre paquet par chemin relatif).' }] };
}
