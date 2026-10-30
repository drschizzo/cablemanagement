# Mettre à jour three.js

three.js ne suit pas le versionnage sémantique : chaque version (r183, r184…) peut renommer un réglage d'un de
ses nœuds de post-traitement ou changer le comportement de son moteur de rendu. Ce document dit de quoi le jeu
dépend, ce qui le vérifie, et comment monter de version sans casse silencieuse.

## Ce qui protège

- **La version est épinglée** : `"three": "0.183.2"` dans `package.json`, sans `^`. Une mise à jour ne vient que
  si on la demande.
- **Le jeu n'utilise que l'API publique de three.js** : `WebGPURenderer`, les matériaux à nœuds, TSL, et les
  nœuds de post-traitement de `examples/jsm/tsl/display`. ESLint refuse ce qui ne s'adresse qu'à
  `WebGLRenderer` (`ShaderMaterial`, `onBeforeCompile`, les passes de `examples/jsm/postprocessing`), que
  `WebGPURenderer` ignore souvent sans erreur, ainsi que la lecture d'un membre privé (`_xxx`). Une exception,
  faute d'API publique, vérifiée par `tests/render/threeNodes.test.ts` : `_callDepth` (voir « Des shaders
  construits avant leur première image »).
- **`tests/render/threeNodes.test.ts` vérifie, contre la version installée, chaque réglage que le jeu donne par
  son nom aux nœuds de three.js.** Un réglage renommé fait échouer le test au lieu de rester sans effet.

## Ce dont le jeu dépend

### Le moteur de rendu (`render/stageSetup.ts`)

`WebGPURenderer` dessine sur WebGPU, ou sur WebGL 2 quand le navigateur n'a pas WebGPU (`?webgl` force ce
repli). Les deux doivent donner la même image : c'est à vérifier à chaque version.

### Les matériaux (`render/leds.ts`, `batch.ts`, `jacket.ts`, `ledGlow.ts`, `serverRoom/battens.ts`)

Les effets des matériaux sont des nœuds TSL branchés sur leurs étapes : `emissiveNode`, `colorNode`,
`roughnessNode`, `normalNode`, `positionNode`, `mrtNode`. Ils lisent des valeurs que three.js expose sous un nom
stable (`positionLocal`, `positionWorld`, `normalWorldGeometry`, `diffuseColor`, `materialEmissive`…).

Deux comportements de `WebGPURenderer` sont pris en compte :

- `NodeMaterial` applique la matrice d'une instance avant `positionNode` : la croissance des voyants
  (`ledMaterial`) part de la position déjà placée par l'instance ;
- une cible de rendu se lit lignes inversées (la carte des voyants, `ledGlow.ts`).

### Un shader partagé par les matériaux faits de même

three construit un shader par graphe de nœuds, et la clé de ce graphe tient compte de l'identité de chaque nœud :
deux matériaux construits chacun avec leurs propres nœuds ont chacun leur shader, même identique. Les effets
partagés le sont donc par les mêmes nœuds : `addGlow` (`glowTerms.ts`) réutilise la même somme pour les mêmes
termes, et la lumière des voyants (`ledGlow.ts`) lit la carte, le repère et le cadre de chaque baie sur le matériau
(`materialReference('userData.…')`) au lieu d'en faire des nœuds par baie.

Trois comportements de `WebGPURenderer` sont contournés ; à revérifier à chaque version, car three peut les corriger :

- **Un `InstancedMesh` a toujours son propre shader** : son `uuid` entre dans la clé de son shader
  (`RenderObject`, un TODO de three). Les pièces répétées passent par `InstancedParts` (`instancedParts.ts`), dont
  les matrices et les couleurs sont des attributs de la géométrie ; ESLint refuse `new THREE.InstancedMesh`.
- **`NodeMaterial` lit `instanceColor` sur n'importe quel objet** : un objet qui a cette propriété sans être un
  `InstancedMesh` est teint d'une couleur jamais écrite (du noir). `InstancedParts` nomme ses tampons `matrices` et
  `colors`.
- **Une carte d'ombre redimensionnée en place** est refaite par three, mais les shaders qui la lisent gardent
  l'ancienne, détruite : le GPU refuse chaque image et l'écran se fige. Quand la qualité change la taille des ombres,
  `Stage` remplace la lumière principale (`replaceKeyLight`).

### Des shaders construits avant leur première image

three construit le shader d'un objet (son graphe de nœuds traduit en WGSL, de quelques millisecondes à cinquante,
sur le fil principal) à son premier dessin. Sa clé tient compte de l'environnement et du brouillard de la scène,
de ses lumières **par identité**, et du contexte de rendu, lui-même fonction de la **profondeur d'appel** du
moteur (la passe de la scène est dessinée depuis la chaîne de l'image, cinq ou six appels plus bas). Le jeu en
tient compte :

- **Les lumières d'un niveau sont les mêmes objets d'un niveau à l'autre** : la lampe de la baie (`levelLamp`,
  `rackView.ts`) et la lumière de la salle (`roomRim`, `serverRoom.ts`). Neuves à chaque niveau, elles faisaient
  reconstruire tous les shaders éclairés.
- **three jette un shader quand le dernier objet dessiné avec lui est libéré**, et avec lui les tampons qu'il
  partage : le garder au-delà (en retenant son état dans `nodeBuilderCache`) fait dessiner les objets suivants
  avec des tampons détruits, et le GPU refuse chaque image. Ce qui garde les shaders d'un niveau, c'est donc un
  niveau construit et gardé hors de la scène (`Controller.warm`, gardé par `App` pour la visite).
- **Une chaîne de l'image reste construite** (`ImagePipeline.chains`, par qualité et mise au point) : reconstruite,
  ses nœuds neufs donnaient des shaders neufs, à chaque entrée dans un niveau. Mise de côté, elle ne libère que
  ses cibles de rendu : un nœud libéré (`dispose`) n'est plus jamais redessiné par three.
- **Préparer un objet, c'est le dessiner dans la passe de la scène, à la profondeur où la chaîne la dessine**
  (`ImagePipeline.compile`). `compileAsync` le prépare au premier niveau d'appel, pour un autre contexte : l'image
  n'en retrouvait rien. Membre privé : `renderer._callDepth`, relevé pendant les vrais rendus.
  `Showcase.warm` prépare ainsi chaque baie de l'allée, `Controller.warm` le prochain niveau pendant l'écran titre.

### La chaîne de l'image (`render/imagePipeline.ts`, `bloom.ts`, `depthOfField.ts`, `cinema.ts`)

| Nœud | Fichier de three.js | Ce que le jeu en règle |
|---|---|---|
| `pass`, `mrt`, `renderOutput` | TSL | les images de la scène (couleur, normales, profondeur, reflets), le tone mapping |
| `SSRNode` | `tsl/display/SSRNode.js` | `REFLECTIONS` : résolution, opacité, distance, épaisseur, rugosité |
| `GTAONode`, `DenoiseNode` | `tsl/display/GTAONode.js`, `DenoiseNode.js` | `AO_SETTINGS`, `AO_DENOISE` |
| `GaussianBlurNode` | `tsl/display/GaussianBlurNode.js` | les cinq tailles du halo, chacune à la moitié de la résolution de la précédente |
| `SMAANode` | `tsl/display/SMAANode.js` | l'antialiasing de l'image affichée |
| `convertToTexture` | TSL | une image intermédiaire ; `frameTexture` (`tsl.ts`) la fait dessiner une fois par frame (`updateBeforeType`), et non avant chaque rendu qui la lit |

La sortie de `SSRNode` est déjà pondérée par son opacité : elle s'ajoute à l'image.

### three-cable-tubes (`vendor/cable-kit`)

Le jeu utilise la version TSL du paquet (`@drschizzo/three-cable-tubes/webgpu`) : `TubeMesh` règle le
`positionNode` du matériau des câbles et lui donne `tubeCoord` et `tubeTint`.

**Reste à faire dans le dépôt cable-kit** (le jeu ne modifie pas son sous-module) :

- borner sa dépendance : `"three": ">=0.183.0 <0.184.0"` au lieu de `">=0.183.0"`, élargie après vérification ;
- donner un attribut `position` à la géométrie de `TubeMesh` : three.js avertit à chaque matériau compilé
  (`Vertex attribute "position" not found on geometry`), sans effet sur l'image.

## Procédure

Monter **d'une version à la fois** (r183 → r184, pas r183 → r190) :

1. Lire le [guide de migration](https://github.com/mrdoob/three.js/wiki/Migration-Guide) pour cette version.
2. `npm install three@0.184.x --save-exact`, et la même version pour `@types/three`.
3. `npm test` : un échec de `tests/render/threeNodes.test.ts` nomme le réglage à revoir. Corriger dans le fichier
   qui le donne, jamais en désactivant le test.
4. `npm run check`, puis lancer le jeu (`npm run dev`) et regarder, en gros plan et de loin, une fois en WebGPU
   et une fois avec `?webgl` : un niveau (gaine des cordons, voyants qui clignotent et éclairent, reflets au sol,
   occlusion, halo, flou de la salle, vignette et grain, rais de lumière), l'écran titre avant / après, et la
   console (une erreur de compilation de shader y apparaît). Comparer avec la version précédente : c'est ce qui
   attrape un nom qui a changé de sens.
5. Mettre à jour ce document si une dépendance a changé, et la ligne `"three"` de cable-kit.
