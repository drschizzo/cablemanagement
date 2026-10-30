// Analyse statique : erreurs probables seulement (variables inconnues ou inutilisées, code mort…), pas de style ;
// et le sens des dépendances entre les couches (docs/architecture.md), vérifié plutôt que seulement écrit.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** une couche n'importe pas celles-ci (dossiers de src/, ou modules à sa racine) */
const forbid = (layer, banned, message, extra = []) => ({
  files: [`src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { regex: `(^|/)(${banned.join('|')})(/|$)`, message },
        ...extra,
      ],
    }],
  },
});

// Le jeu dessine avec WebGPURenderer : ses matériaux et ses passes sont des nœuds TSL. Ce qui ne parle qu'à
// WebGLRenderer (GLSL, onBeforeCompile, passes de l'EffectComposer) ne lui parvient pas, souvent sans erreur ;
// un membre privé de three.js peut changer à chaque version (docs/mise-a-jour-three.md)
const WEBGPU = 'Le jeu dessine avec WebGPURenderer : un matériau ou une passe s\'écrit en nœuds TSL (render/tsl.ts), le GLSL ne lui parvient pas.';
const threeUsage = {
  files: ['src/**/*.ts'],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(onBeforeCompile|customProgramCacheKey)$/]', message: WEBGPU },
      { selector: 'NewExpression[callee.property.name=/^(ShaderMaterial|RawShaderMaterial|WebGLRenderer|WebGLRenderTarget)$/]', message: WEBGPU },
      { selector: 'ImportDeclaration[source.value=/^three\\/examples\\/jsm\\/postprocessing\\//]', message: WEBGPU },
      { selector: 'NewExpression[callee.property.name="InstancedMesh"]', message: 'Un InstancedMesh a son propre shader, construit à son premier dessin : des parties répétées passent par InstancedParts (render/instancedParts.ts), qui partagent le leur.' },
      { selector: 'MemberExpression[property.name=/^_[a-zA-Z]/]', message: 'Un membre privé de three.js : rien ne promet qu\'il reste (docs/mise-a-jour-three.md).' },
    ],
  },
};

const layers = [
  forbid('game', ['render', 'play', 'showcase', 'ui', 'app', 'audio', 'dev', 'page'],
    'game/ est le cœur : les règles et la physique, sans affichage ni interface. Les autres couches dépendent de lui, pas l\'inverse.',
    [{ group: ['three', 'three/*'], message: 'game/ ne dessine rien : three.js appartient à render/.' }]),
  forbid('render', ['play', 'showcase', 'ui', 'app', 'audio'],
    'render/ dessine ce que game/ décrit ; il ne connaît ni les gestes ni l\'interface.'),
  forbid('play', ['showcase', 'ui', 'app'],
    'play/ mène une partie ; il prévient l\'interface par ControllerEvents au lieu de l\'importer.'),
  forbid('showcase', ['play', 'ui', 'app'],
    'showcase/ est une scène à part, sans partie en cours ni interface.'),
  forbid('ui', ['app', 'showcase'],
    'ui/ affiche et transmet ; c\'est app/ qui choisit la scène.'),
  forbid('lib', ['game', 'render', 'play', 'showcase', 'ui', 'app', 'audio', 'dev'],
    'lib/ tient des outils sans rapport avec le jeu (géométrie, tirages, page) : il ne connaît aucune couche.'),
  forbid('audio', ['game', 'render', 'play', 'showcase', 'ui', 'app'],
    'audio/ ne fait que des sons : il ne dépend de rien.'),
  {
    files: ['src/game/**/*.ts'],
    rules: { 'no-restricted-globals': ['error', { name: 'document', message: 'game/ tourne aussi sous Node et dans les Workers : pas de DOM.' }, { name: 'window', message: 'game/ tourne aussi sous Node et dans les Workers : pas de DOM.' }] },
  },
];

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
  ...layers,
  threeUsage,
);
