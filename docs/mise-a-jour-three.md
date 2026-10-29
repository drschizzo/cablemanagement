# Mettre à jour three.js

three.js ne suit pas le versionnage sémantique : chaque version (r183, r184…) peut changer le texte de ses shaders,
les champs de ses passes de post-traitement ou le comportement de son moteur de rendu. Le jeu s'appuie sur
certains de ces détails, que rien dans three.js ne promet de garder. Ce document dit lesquels, où ils sont, et
comment monter de version sans casse silencieuse.

## Ce qui protège

- **La version est épinglée** : `"three": "0.183.2"` dans `package.json`, sans `^`. Une mise à jour ne vient que
  si on la demande.
- **Tout ce qui dépend des internes de three.js vit dans `src/render/threeCompat/`**, et ESLint l'interdit
  ailleurs : affecter `onBeforeCompile` ou `customProgramCacheKey`, lire un membre privé (`_xxx`), importer
  `SSRPass`, `UnrealBloomPass` ou `GTAOPass`. Une mise à jour ne regarde que ce dossier.
- **`tests/render/threeCompat/` vérifie ces internes contre la version installée**, sous Node, sans GPU. Une
  retouche qui ne tient plus fait échouer un test qui dit laquelle, et pourquoi.

## Ce dont le jeu dépend

### Les retouches des shaders de matériaux

Pour ajouter un effet sans réécrire le shader physique de `MeshStandardMaterial`, le jeu insère du GLSL juste
après une ligne du shader de three.js (un `#include <…>`) et lit ce que three.js y a calculé. Chaque retouche
est une donnée (`MaterialPatch`, `threeCompat/materialPatch.ts`) : après quelle ligne, quel code, et quels noms
de three.js il lit (`uses`).

| Retouche | Fichier | Après | Noms de three.js utilisés |
|---|---|---|---|
| `TINT_PATCH` (une lueur par instance) | `render/batch.ts` | `common`, `begin_vertex`, `emissivemap_fragment` | `totalEmissiveRadiance` |
| `BLINK_PATCH` (voyants qui clignotent) | `render/leds.ts` | idem | `transformed`, `modelViewMatrix`, `instanceMatrix`, `projectionMatrix`, `totalEmissiveRadiance` |
| `LED_LIT_PATCH` (la lumière des voyants) | `render/ledGlow.ts` | idem | `transformed`, `objectNormal`, `modelMatrix`, `instanceMatrix`, `totalEmissiveRadiance`, `diffuseColor` |
| `JACKET_PATCH` (la gaine vue de près) | `render/jacket.ts` | `common`, `begin_vertex`, `color_fragment`, `roughnessmap_fragment`, `normal_fragment_maps` | `diffuseColor`, `roughnessFactor`, `normal`, `vViewPosition`, `faceDirection` |

Le test applique chaque retouche au vrai shader (`THREE.ShaderLib.standard`), développe les `#include` avec
`THREE.ShaderChunk` comme le fait le moteur, et vérifie que chaque nom de `uses` est déclaré avant le point
d'insertion (ou parmi les uniformes et attributs que `WebGLProgram` met en tête de chaque programme).

**Ce que le test ne voit pas** : un nom qui existe encore mais a changé de sens (une valeur en espace écran
devenue en espace vue, par exemple). C'est rare, et cela se voit à l'image : voir « Procédure ».

**Ajouter une retouche** : la décrire comme les autres, avec ses `uses`, et l'ajouter à la liste
`MATERIAL_PATCHES` du test.

### Les passes de post-traitement (`threeCompat/passes.ts`)

- **`ReflectionPass`** étend `SSRPass` :
  - elle saute le calcul des reflets aux qualités basses en appelant la méthode privée `_renderPass` ;
  - elle change ses cibles (`beautyRenderTarget` : multi-échantillonnage, profondeur 32 bits) ;
  - elle masque les reflets avec `metalnessRenderTarget` et `blurRenderTarget2`, en retouchant le shader de copie
    (`maskedCopy`) ;
  - elle recopie la projection dans `ssrMaterial` à chaque image : la passe ne la lit qu'au redimensionnement.
- **`BloomPass`** étend `UnrealBloomPass` :
  - elle retouche sa passe de luminosité contre les NaN (`guardedHighPass`) ;
  - elle règle le poids de chacun de ses `nMips` niveaux dans `compositeMaterial.uniforms.bloomFactors`.
- **`createAmbientOcclusionPass`** n'utilise que des méthodes publiques de `GTAOPass`. Le test vérifie qu'elles
  lisent encore chaque réglage passé (`AO_SETTINGS`, `AO_DENOISE`).

### three-cable-tubes (`vendor/cable-kit`)

Le moteur de tubes vit dans son propre dépôt ; le test du jeu vérifie ce dont il dépend :

- il construit le tube au début de `main()` (`'void main() {'`) dans les shaders standard, de profondeur, de
  distance et de normales ;
- il remplace `position` et `normal` par des `#define`, ce qui suppose que three.js les lise sous ces noms
  (`begin_vertex`, `beginnormal_vertex`) ;
- il suit le matériau de remplacement des passes grâce à `Material.allowOverride` et à la façon dont
  `WebGLRenderer` l'applique, et dessine ses ombres grâce à `onBeforeShadow`.

**Reste à faire dans le dépôt cable-kit** (le jeu ne modifie pas son sous-module) :

- borner sa dépendance : `"three": ">=0.183.0 <0.184.0"` au lieu de `">=0.183.0"`, élargie après vérification ;
- protéger son `replace('void main() {', …)` comme le fait `patchShader` (une erreur si le motif manque).

## Procédure

Monter **d'une version à la fois** (r183 → r184, pas r183 → r190) :

1. Lire le [guide de migration](https://github.com/mrdoob/three.js/wiki/Migration-Guide) pour cette version.
2. `npm install three@0.184.x --save-exact`.
3. `npm test` : chaque échec de `tests/render/threeCompat/` nomme la retouche ou l'interne à revoir. Corriger dans
   `src/render/threeCompat/` (ou dans le fichier qui déclare la retouche), jamais en désactivant le test.
4. `npm run check`, puis lancer le jeu (`npm run dev`) et regarder, en gros plan et de loin : un niveau (gaine des
   cordons, voyants qui clignotent et éclairent, reflets au sol, occlusion, halo), l'écran titre avant / après, et
   la console (une erreur de compilation de shader y apparaît). Comparer avec la version précédente :
   c'est ce qui attrape un nom qui a changé de sens.
5. Mettre à jour ce document si un interne a changé, et la ligne `"three"` de cable-kit.
