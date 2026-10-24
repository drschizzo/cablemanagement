# Architecture

Ce document décrit comment le code est organisé, et où ajouter une évolution sans toucher au reste.

## Vue d'ensemble

```
src/
  physics/   moteur de câbles AVBD, géométrie, Worker                       pur · sans DOM
    cableSim.ts     le solveur (nœuds, contraintes, contacts, veille)
    threadedSim.ts  le même, dont les pas tournent dans sim.worker.ts
  game/      la baie et ses règles                                            sans DOM ni three.js (sauf controller)
    rack.ts         baie 19", ports, éléments (guide-câbles, goulottes, anneaux), formes de collision, zones de rangement
    levels.ts       niveaux, services (couleurs d'étiquettes), partie libre, vitrine avant / après
    tangle.ts       plan de brassage, erreurs de départ, chemins emmêlés
    tidy.ts         la route idéale de chaque cordon, la baie « finie » d'un niveau (tidyKit)
    world.ts        état d'une partie : branchement, fenêtre de maintenance, velcro, longueurs, bac, score
    controller.ts   une partie en cours : boucle, saisie, outils (relie world, render et les événements de l'interface)
  render/    three.js : scène et post-traitement, baie, câbles (tubes lissés), connecteurs
    dispose.ts      libération des ressources GPU (shared() marque ce qui sert à tous les niveaux)
    batch.ts        moins d'appels de dessin : pièces fixes fusionnées par matériau, pièces répétées instanciées
  ui/        interface HTML : HUD (plan, outils, menus), tutoriel, vitrine avant / après
  audio/     effets sonores synthétisés
  storage.ts données gardées dans le navigateur (clés, valeurs par défaut, validation)
  main.ts    point d'entrée : assemble le tout, une scène à la fois
  dev/       poignées de test, chargées en développement seulement
tests/     tests unitaires (Vitest)
tools/     bancs sans navigateur : moteur, précision des gestes, niveaux, vitrine
```

### Sens des dépendances

```
physics  ←  game  ←  ui
             ↑  ↖     ↓
           render ←── main
```

- `physics/` ne connaît ni la baie ni le jeu : des nœuds, des broches, des formes statiques, des faisceaux.
  Il tourne aussi bien dans la page, dans le Worker et dans les tests.
- `game/` (hors `controller.ts`) n'importe ni three.js ni le DOM : `World` se construit et se teste sous Node,
  la physique tournant alors sur le fil du test (pas de Worker).
- `game/controller.ts` ne touche pas au DOM de l'interface : il prévient le HUD par `ControllerEvents`
  (`onEval`, `onToast`, `onHover`…), que `main.ts` relie à `ui/hud.ts`.
- `ui/` lit l'état (`ctl.world`, `ctl.lastEval`) et appelle le contrôleur (`setTool`, `setLength`, `newCord`).

## Une scène à la fois : `main.ts`

Trois sortes de scènes : un niveau (un `Controller`), le tutoriel (un `Tutorial` par-dessus un niveau) et la
vitrine avant / après (un `Showcase`, sans contrôleur). Chaque chargement passe par `loadScene()` :

- le voile de chargement s'affiche et peint avant le calcul (bloquant) de l'emmêlage ;
- `sceneToken` s'incrémente : un chargement dépassé par un autre (deux clics rapides, une vitrine longue à
  calculer) ne fait rien, ou jette son résultat ;
- `leaveScene()` libère la scène précédente — chaque scène a un `dispose()` qui arrête ses minuteries, retire
  ses objets et libère leurs ressources GPU (`render/dispose.ts`).

## La physique dans un Worker

`ThreadedSim` garde la topologie et un miroir des positions : le jeu lit `sim.x` comme si la physique tournait
sur place. Chaque modification (broche, main, éléments, velcro) est appliquée localement puis transmise au Worker,
dans l'ordre. Une seule demande de pas est en vol ; si le Worker prend du retard, du temps est perdu plutôt
qu'accumulé. Chaque demande porte un `id`, et `settle()` attend la réponse à la sienne. Le compteur `gen` écarte
les réponses calculées avant un déplacement forcé (`teleport`, `moveNodes`). `?sync` dans l'URL garde la physique
sur le fil principal.

## Données dans le navigateur

`storage.ts` déclare chaque entrée (clé, valeur par défaut, validation) : progression (étoiles et meilleurs temps
par niveau) et tutoriel terminé. Les clés sont celles des versions précédentes.

## Ajouter…

| Évolution | Où |
|---|---|
| un niveau | une entrée dans `LEVELS` (`game/levels.ts`) ; `tests/levels.test.ts` vérifie son plan, qu'il ne se gagne pas sans rien faire et qu'il peut atteindre 3 étoiles avec son seul inventaire (`tidyKit`) |
| un équipement de baie | `UnitSpec` et le constructeur de `Rack` (`game/rack.ts`), son rendu dans `render/rackView.ts` |
| un élément de rangement | `ItemKind`, `canPlace`, `statics` et `supports` dans `game/rack.ts`, `buildItem` dans `render/rackView.ts`, un outil dans `TOOLS` (`ui/hud.ts`) |
| un outil | `Tool` et `onDown` dans `game/controller.ts`, son bouton dans `TOOLS` (`ui/hud.ts`) |
| un critère de score | `World.evaluate()` (`game/world.ts`), sa colonne dans le plan (`ui/hud.ts`) |
| une étape du tutoriel | `STEPS` dans `ui/tutorial.ts` (`done` lit `ctl.counters` ou l'état du monde) |
| un message du contrôleur à l'interface | `ControllerEvents` (`game/controller.ts`), relié dans `main.ts` |
| une donnée gardée | une entrée dans `storage.ts` |
| une ressource three.js partagée par tous les niveaux | l'envelopper dans `shared()` (`render/dispose.ts`) |

## Vérifications

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run lint` | erreurs probables (ESLint) |
| `npm run typecheck` | types (TypeScript strict) |
| `npm test` | géométrie, baie, stockage, règles d'une partie (branchement, fenêtre de maintenance, étiquettes, velcro, longueurs, bac), niveaux (plan, emmêlage stable, 3 étoiles possibles) |
| `npm run check` | les trois à la suite |
| `npm run bench` · `precision` · `levels` · `solvable` · `showcase` | bancs du moteur et des niveaux, sans navigateur (`tools/`) |

Ces vérifications se lancent en local avant de pousser. La CI (`.github/workflows/ci.yml`) fait la même chose,
plus la construction, mais seulement quand on la lance à la main (onglet *Actions* de GitHub).
