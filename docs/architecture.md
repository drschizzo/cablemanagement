# Architecture

Ce document décrit comment le code est organisé, et où ajouter une évolution sans toucher au reste.

## Vue d'ensemble

Le code est rangé **par responsabilité** : chaque dossier de `src/` répond à une question, et chaque fichier à une
seule. Un fichier commence par un commentaire qui dit ce qu'il fait ; s'il faut une phrase avec « et » pour le dire,
c'est souvent qu'il fait deux choses.

```
src/
  main.ts       point d'entrée : lit les options de la page, crée la scène 3D et l'App, ouvre l'écran titre
  app/          QUELLE SCÈNE est à l'écran, et comment passer de l'une à l'autre
    app.ts          App : un niveau (Controller, avec ou sans tutoriel) ou l'écran titre (Showcase)
    sceneLoader.ts  une scène à la fois : voile de chargement, chargement dépassé par un autre
    titleScreen.ts  boutons de l'écran titre et du menu des niveaux
    urlOptions.ts   ?sync, ?bays, ?pairs, ?seed : lus depuis une chaîne, donc testables
    viewInsets.ts   le cadrage de la baie dans la place que laissent les panneaux
  game/         LES RÈGLES et la physique de la baie                       sans three.js ni DOM : tourne sous Node
    world.ts        World, l'état d'une partie : cordons et leurs bouts, branchement, velcros, bac, stock
    cables.ts       ce qu'est un cordon (Cable, CableEnd, Strap) et ses indices nommés (CableIndex, EndIndex,
                    NodeIndex, CircuitIndex)
    cordShapes.ts   la géométrie d'un cordon hors physique : remis à une autre longueur, enroulé dans le bac
    evaluation.ts   le score : chaque liaison (branchée, rangée, dégagée, étiquetée, sans tension), étoiles,
                    lisibilité, propreté — des fonctions qui lisent un World sans le modifier
    maintenanceWindow.ts  liaisons en production, budget d'interruption, dérivations
    rack.ts         baie 19", ports, éléments de rangement, formes de collision, zones de rangement
    cordTypes.ts    sortes de cordon (fibre, cuivre) et longueurs du catalogue
    services.ts     les services du plan (données, voix…) : couleur, poids d'une coupure
    idealRoutes.ts  la route idéale de chaque cordon, la baie « finie » d'un niveau (tidyKit)
    routeLaying.ts  l'outil Chemin côté règles : le chemin planifié (planRoute), le câble posé (RouteRun)
    physics/        le solveur tel que le jeu le mène (rackCableSim : mains, ports, creux des guides), et son Worker
    mess/           le désordre de départ : plan de brassage et chemins emmêlés (tangle), sa chute dans un Worker,
                    sa version précalculée pour l'écran titre (baked, showcase.bin)
    levels/         ce qu'est un niveau (levelDef), les équipements nommés, la campagne et le tutoriel, la partie
                    libre, les baies de la vitrine
  play/         UNE PARTIE EN COURS : relie game, render et l'interface
    controller.ts   Controller : la boucle à pas fixe, ce que la baie montre de son état, les actions du HUD
    context.ts      PlayContext (ce que les outils voient du contrôleur), ToolHandler (l'interface d'un outil),
                    ControllerEvents (ce que le contrôleur dit à l'interface)
    inputRouter.ts  la souris et le clavier, aiguillés vers l'outil qui a un geste en cours, ou vers la vue
    tools/          un fichier par outil : main, Chemin, velcro, supports
    feedback/       les repères dessinés par-dessus la baie : surbrillances et traceur, fil à plomb, autre main,
                    lueurs des connecteurs, port visé, portions tenues / pendantes, cadre du tutoriel
    pointer.ts      la souris sur la vue : pixels, rayon, projections écran ↔ baie
    picking.ts      ce qui est sous la souris : cordons (Tab pour le suivant), guides, ports libres
    undoHistory.ts  les états de la baie pour Ctrl+Z
    cordTooltip.ts  la bulle d'un cordon survolé
    frontImage.ts   l'image de face de la baie (avant / après de l'écran de résultat)
  showcase/     L'ÉCRAN TITRE : l'allée avant / après, une scène sans partie en cours
    showcase.ts     Showcase : l'allée, son interrupteur, sa pluie de câbles
    closet.ts       une baie et ses deux états (le désordre et la baie rangée), la chorégraphie de l'un à l'autre
    bay.ts          un état d'une baie : son World, sa vue, le vol de ses cordons
    aisleLayout.ts  où se tiennent les baies : un demi-cercle autour du spectateur
    cableRain.ts    le décor : des câbles qui tombent et s'entassent au milieu de la salle
  render/       LE DESSIN (three.js) de ce que game décrit
    stage.ts        renderer, caméra, lumières et passes (reflets SSR, occlusion GTAO, bloom, cinema)
    rackView.ts     la baie, ses équipements, ports, plaques et voyants
    rackItems.ts    les éléments de rangement, construits à partir de leurs formes de collision (buildItem)
    rackMaterials.ts, rackTextures.ts, shapes.ts, room.ts   matériaux, textures, formes, sol de la salle
    cableView.ts    les câbles (tubes de three-cable-tubes), leurs connecteurs et étiquettes
    jacket.ts, straps.ts, leds.ts, ledGlow.ts   gaine vue de près, velcros, voyants et leur lumière
    bevel.ts, batch.ts, dispose.ts, cinema.ts   pièces légères, moins d'appels de dessin, mémoire GPU, dernière passe
  ui/           L'INTERFACE HTML autour de la baie
    hud.ts          Hud : assemble les panneaux, et les petites choses (aide, bulle, message, chronomètre)
    toolbar.ts      la barre d'outils et ce qui reste en stock ; stockMenu.ts, le stock de cordons neufs
    schedulePanel.ts le plan de brassage, ses jauges, le budget d'interruption, le bouton Valider
    levelBrief.ts   le brief d'un niveau, puis la préparation
    resultScreen.ts l'écran de résultat ; levelMenu.ts, le menu des niveaux
    progress.ts     la progression du joueur : meilleur score, niveau ouvert, niveau suivant (fonctions pures)
    tutorial.ts     le tutoriel guidé, par-dessus un niveau
    dom.ts, icons.ts petites aides DOM, icônes de la barre d'outils
  audio/        les effets sonores, synthétisés
  format.ts     nombres et durées tels que le joueur les lit
  storage.ts    données gardées dans le navigateur (clés, valeurs par défaut, validation)
  dev/          poignées de test, chargées en développement seulement
tests/        tests unitaires (Vitest), rangés comme src/
tools/        bancs sans navigateur : moteur, gestes, niveaux, vitrine (index : tools/README.md)
vendor/cable-kit/   sous-module git : le moteur de câbles et ses tubes, dans leur propre dépôt (en anglais)
```

### Sens des dépendances

Une couche n'importe que celles qui sont **en dessous** d'elle :

```
                 app                  choisit la scène
          ┌───────┼────────┐
          ui      │     showcase      interface HTML · écran titre
          │       │        │
          └──── play       │          une partie en cours
                  │        │
               render ─────┤          le dessin (three.js)
                  │        │
                 game ─────┘          les règles et la physique (ni three.js ni DOM)
                  │
        @drschizzo/avbd-cables        le moteur de câbles
```

`audio/`, `format.ts` et `storage.ts` sont des feuilles : tout le monde peut s'en servir, sauf `game/`, qui reste
indépendant de la page. **Ce sens est vérifié** : `eslint.config.js` interdit à chaque couche d'importer celles qui
sont au-dessus d'elle, et `npm run lint` échoue avec un message qui dit pourquoi. Le cœur (`game/`) peut ainsi
tourner sous Node, dans les tests et les bancs, et dans un Web Worker.

Quand une couche basse doit prévenir une couche haute, elle ne l'importe pas : elle reçoit un **rappel**.
`play/` prévient l'interface par `ControllerEvents` (`onEval`, `onToast`, `onHover`…), qu'`app/app.ts` relie à
`ui/hud.ts`. Dans l'autre sens, `ui/` lit l'état (`ctl.world`, `ctl.lastEval`) et appelle le contrôleur
(`setTool`, `newCord`, `toggleBypass`, `fetchEnd`).

Les outils de `play/tools/` ne connaissent pas le `Controller` mais seulement `PlayContext`, l'interface de ce qu'il
leur prête (le monde, la vue, le pointeur, l'historique…) : on peut lire, tester ou remplacer un outil sans le reste.

### Le moteur, un dépôt à part

- Les deux paquets vivent dans leur propre dépôt, [cable-kit](https://github.com/drschizzo/cable-kit), que le jeu
  inclut comme sous-module git (`vendor/cable-kit`, à une version figée). Les workspaces npm du jeu pointent vers
  ses `packages/*` : `npm install` les relie dans `node_modules/@drschizzo/`. La condition d'export `source`
  (`vite.config.ts`, `tsconfig.json`) fait lire leurs sources à Vite, Vitest et TypeScript, sans compiler leur
  `dist/`. Leurs tests, leurs exemples, leur banc (`npm run presets`) et leur documentation sont là-bas.
- Faire évoluer un paquet : le modifier dans `vendor/cable-kit` (un dépôt git à part entière), le committer et le
  pousser dans cable-kit, puis committer dans le jeu la nouvelle version du sous-module.
- `avbd-cables` ne connaît ni la baie ni le jeu : des nœuds, des broches, des formes statiques, des cibles, des
  faisceaux. Ce qui mène les câbles vit dans `game/physics/rackCableSim.ts`, une sous-classe de `CableSim` : elle
  pose les cibles et les drapeaux du pas (`prepare`), ajoute la traction du creux des guides sur les nœuds qu'il
  tient (`nodeTerm`) et les y remet autour des passes de longueur (`keepHeld`).

## Une scène à la fois : `app/`

Trois sortes de scènes : un niveau (un `Controller`), le tutoriel (un `Tutorial` par-dessus un niveau) et la
vitrine avant / après (un `Showcase`, sans contrôleur), qui sert d'écran titre : le jeu s'ouvre toujours dessus,
avec son nom et son menu (`#title`) par-dessus, et en bas l'interrupteur Avant / Après (`#sc-switch`) et sa
légende. La page s'ouvre en chargement (`body.booting`, dès le HTML) : un fond noir, le nom au milieu et sa barre,
rien d'autre ; le reste apparaît avec la salle. La première salle est toujours la même
(`SHOWCASE_DEFAULT`, `game/levels/showcaseRack.ts`) : son désordre tombé est précalculé (`npm run bake`,
`game/mess/showcase.bin`, ~210 Ko, lu par `game/mess/baked.ts`), elle s'affiche donc sans attendre la physique ;
une baie dont le désordre n'est plus celui du fichier (le code a changé depuis) retombe comme avant, et un test le
signale. Pendant qu'une salle est à l'écran, la suivante, tirée au hasard, se construit et tombe en fond
(`App.prepareNextAisle`) : « une autre salle » l'affiche aussitôt. Les options de la page (`?seed`, `?bays`,
`?pairs`, `?sync`) sont décrites en tête de `app/urlOptions.ts` ; voir aussi « L'écran d'accueil » dans
`anatomie-d-une-frame.md`. Chaque chargement passe par `SceneLoader.load()` :

- le voile de chargement s'affiche et peint avant le calcul (bloquant) de l'emmêlage ; pour l'écran titre, pas
  de voile : le nom du jeu reste seul au milieu de l'écran avec sa barre de progression (`body.booting`), puis
  la salle apparaît en fondu et le nom remonte en haut ;
- un jeton s'incrémente : un chargement dépassé par un autre (deux clics rapides, une vitrine longue à
  calculer) ne fait rien, ou jette son résultat (`isStale`) ;
- `App.leaveScene()` libère la scène précédente — chaque scène a un `dispose()` qui arrête ses minuteries, retire
  ses objets et libère leurs ressources GPU (`render/dispose.ts`).

## La physique dans un Worker

`ThreadedSim` (`game/physics/threadedSim.ts`) est un `RackCableSim` passé par `threaded()` (`avbd-cables`). Il garde la
topologie et un miroir des positions : le jeu lit `sim.x` comme si la physique tournait sur place. Chaque
modification est appliquée localement puis répétée dans le Worker, dans l'ordre : ce sont les méthodes que la
classe liste dans `mirrored` (`CableSim` les siennes, `RackCableSim` y ajoute la main, le chemin, le branchement), et
seul l'appel le plus extérieur part (celui qui fait les autres là-bas aussi). Le Worker démarre d'un instantané
(`snapshot` / `restore`, que `RackCableSim` complète) ; à chaque pas, il reçoit ce qui change sans appel, la main
(`stepInput`). `game/physics/sim.worker.ts` se borne à `hostSimWorker((p) => new RackCableSim(p))`. Une seule demande de pas est en vol ; si le Worker prend du retard, du temps est perdu plutôt
qu'accumulé. Chaque demande porte un `id`, et `settle()` attend la réponse à la sienne. Le compteur `gen` écarte
les réponses calculées avant un déplacement forcé (`teleport`, `moveNodes`). `?sync` dans l'URL garde la physique
sur le fil principal.

## Données dans le navigateur

`storage.ts` déclare chaque entrée (clé, valeur par défaut, validation) : progression (étoiles et meilleurs temps
par niveau) et tutoriel terminé. Les clés sont celles des versions précédentes.

## Ajouter…

| Évolution | Où |
|---|---|
| un niveau | une entrée dans `LEVELS` (`game/levels/campaign.ts`), bâtie avec les équipements de `game/levels/equipment.ts` ; `tests/game/levels/levels.test.ts` vérifie son plan, qu'il ne se gagne pas sans rien faire et qu'il peut atteindre 3 étoiles avec son seul inventaire (`tidyKit`) |
| un équipement de baie | `UnitSpec` et le constructeur de `Rack` (`game/rack.ts`), son rendu dans `render/rackView.ts` |
| un élément de rangement | `ItemKind`, `canPlace`, `statics` et `supports` dans `game/rack.ts`, `buildItem` dans `render/rackItems.ts`, un outil dans `TOOLS` (`ui/toolbar.ts`) |
| un outil | un `ToolHandler` dans `play/tools/`, son nom dans `Tool` (`play/context.ts`) et dans `Controller.tools`, son bouton dans `TOOLS` (`ui/toolbar.ts`) |
| un repère visuel pendant un geste | une classe dans `play/feedback/`, mise à jour par l'outil ou par `Controller.tick` |
| un critère de score | `evaluate()` (`game/evaluation.ts`), sa colonne dans le plan (`ui/schedulePanel.ts`) |
| un panneau de l'interface | un fichier dans `ui/`, créé et appelé par `Hud` (`ui/hud.ts`) |
| une étape du tutoriel | `STEPS` dans `ui/tutorial.ts` (`done` lit `ctl.counters` ou l'état du monde) |
| un message du contrôleur à l'interface | `ControllerEvents` (`play/context.ts`), relié dans `app/app.ts` |
| un raccourci clavier | `InputRouter.bindKeys` (`play/inputRouter.ts`), son action sur le contrôleur ou l'outil |
| une option de la page | `readUrlOptions` (`app/urlOptions.ts`) et son test |
| une couche, ou une règle entre couches | `eslint.config.js` (`layers`), et le schéma ci-dessus |
| une donnée gardée | une entrée dans `storage.ts` |
| une ressource three.js partagée par tous les niveaux | l'envelopper dans `shared()` (`render/dispose.ts`) |
| un voyant qui clignote | une `LedSpec` (`render/leds.ts`), posée dans `render/rackView.ts` ; `ledGlow.ts` la reprend sur les câbles et la baie |
| une passe de post-traitement | le `composer` de `Stage` (`render/stage.ts`) |
| une sorte de câble pour le moteur | une entrée dans `CABLES`, dans cable-kit (`packages/avbd-cables/src/presets.ts`) ; voir son README |
| un réglage du moteur | `SimParams` et `defaultSimParams` (`cableSim.ts`) ; un réglage du jeu (main, chemin, creux des guides) : `RackParams` (`game/physics/rackCableSim.ts`) |

## Vérifications

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run lint` | erreurs probables, et le sens des dépendances entre couches (ESLint) |
| `npm run typecheck` | types (TypeScript strict) |
| `npm test` | géométrie, baie, stockage, options de la page, formats, historique d'annulation, fenêtre de maintenance, règles d'une partie (branchement, fenêtre de maintenance, étiquettes, velcro, longueurs, bac), niveaux (plan, emmêlage stable, 3 étoiles possibles), salle d'accueil précalculée à jour |
| `npm run check` | les trois à la suite |
| `npm run bake` | précalcule le désordre de la salle d'accueil par défaut (à relancer quand le test `baked` le demande) |
| `npm run bench` · `precision` · `levels` · `solvable` · `showcase` · `free` · `pinch` · `release` · `fold` · `route` · `plug` · `plugin` | bancs du moteur, des gestes et des niveaux, sans navigateur : ce que mesure chacun et ses réglages dans `tools/README.md` |

Ces vérifications se lancent en local avant de pousser. La CI (`.github/workflows/ci.yml`) fait la même chose,
plus la construction, mais seulement quand on la lance à la main (onglet *Actions* de GitHub).

## Publication

À chaque push sur `main`, `.github/workflows/pages.yml` construit le jeu (`npm run build`) et le publie sur
GitHub Pages : <https://drschizzo.github.io/cablemanagement/>. `base: './'` (`vite.config.ts`) garde des chemins
relatifs, pour que le jeu marche sous ce sous-dossier.
