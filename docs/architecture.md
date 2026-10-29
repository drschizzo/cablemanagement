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
    urlOptions.ts   ?sync, ?bays, ?pairs, ?seed, ?quality, ?rack : lus depuis une chaîne, donc testables
  game/         LES RÈGLES et la physique de la baie                       sans three.js ni DOM : tourne sous Node
    world.ts        World, l'état d'une partie : cordons et leurs bouts (et ceux coupés à l'intérieur), branchement,
                    velcros, bac, stock ; montré
                    en lecture seule, changé par ses méthodes
    cables.ts       ce qu'est un cordon (Cable, CableEnd, Strap) et ses indices nommés (CableIndex, EndIndex,
                    NodeIndex, CircuitIndex)
    cordShapes.ts   la géométrie d'un cordon hors physique : remis à une autre longueur, enroulé dans le bac
    evaluation.ts   le score : chaque liaison (branchée, rangée, dégagée, étiquetée, sans tension), étoiles,
                    lisibilité, propreté — des fonctions qui lisent un World sans le modifier
    maintenanceWindow.ts  liaisons en production, budget d'interruption, dérivations
    cabinetState.ts une baie telle que le joueur la laisse (équipements, supports, plan, cordons branchés, velcros),
                    pour la retrouver à la visite suivante (la carrière)
    finds.ts        les trouvailles : l'objet qu'un niveau cache (LevelBase.find), et où il est posé
    pay.ts          ce que rapporte un chantier : les liaisons, le rangement, la lisibilité, le budget épargné, le défi
    incidents.ts    les incidents pendant le chantier (un collègue débranche une liaison, un utilisateur appelle) :
                    joués par Incidents, appliqués à la baie par World.workGoesOn
    rack.ts         baie 19", ports, éléments de rangement, formes de collision, zones de rangement
    supplies.ts     les fournitures (supports et velcros), décrites une fois : ItemKind et Stock en dérivent
    schedule.ts     le plan de brassage : une ligne (Circuit), et le plan tiré au hasard d'un niveau (makeSchedule)
    cordTypes.ts    sortes de cordon, décrites une fois (famille, raideur, pliure, connecteur, couleur) et longueurs
                    du catalogue
    services.ts     les services du plan (données, voix…) : couleur, poids d'une coupure (leurs noms : ui/names.ts)
    idealRoutes.ts  la route idéale de chaque cordon, la baie « finie » d'un niveau (tidyKit), les cordons couchés
                    sur leurs routes (tidyLayout, la baie rangée de la vitrine)
    comb.ts         le peigne côté règles : les couloirs des câbles qu'il a traversés, posés le long de son chemin
    routeLaying.ts  l'outil Chemin côté règles : le chemin planifié (planRoute), le câble posé (RouteRun)
    physics/        le solveur tel que le jeu le mène (rackCableSim : mains, ports, creux des guides), et son Worker
    mess/           le désordre de départ : les chemins emmêlés des cordons (tangle), leur chute dans un Worker,
                    sa version précalculée pour l'écran titre (baked, showcase.bin)
    levels/         ce qu'est un niveau (levelDef : une union par sorte, campagne, puzzle, ticket, tutoriel, partie libre,
                    zen, baie du jour, vitrine, banc), les équipements nommés, la campagne et le tutoriel, les puzzles,
                    la carrière (un client, ses tickets, chacun bâti sur la baie laissée par le précédent),
                    la baie sur mesure de l'éditeur (customLevel : sa palette, ses règles, son code de partage), la partie libre et le zen, la baie du jour
                    (tirée de la date : la même pour tous), les baies de la vitrine
  play/         UNE PARTIE EN COURS : relie game, render et l'interface
    controller.ts   Controller : la boucle à pas fixe, ce que la baie montre de son état, les actions du HUD
    context.ts      PlayContext (ce que les outils voient du contrôleur), ToolHandler (l'interface d'un outil),
                    ControllerEvents (ce que le contrôleur dit à l'interface)
    inputRouter.ts  la souris et le clavier, aiguillés vers l'outil qui a un geste en cours, ou vers la vue
    tools/          un fichier par outil : main, Chemin, velcro, supports, peigne, testeur
    feedback/       les repères dessinés par-dessus la baie : surbrillances et traceur, fil à plomb, autre main,
                    lueurs des connecteurs, port visé, portions tenues / pendantes, cadre du tutoriel
    pointer.ts      la souris sur la vue : pixels, rayon, projections écran ↔ baie
    picking.ts      ce qui est sous la souris : cordons (Tab pour le suivant), guides, ports libres
    undoHistory.ts  les états de la baie pour Ctrl+Z
    timelapse.ts    le chantier tel qu'il s'est passé : une image toutes les quelques secondes de jeu, le tout gardé
                    même pour un long chantier (une image sur deux part, le rythme ralentit)
    messages.ts     ce qu'une partie dit au joueur, en données (Toast, Hint, CordInfo, HoverNote) : ui/ les met en mots
    cordInfo.ts     ce que la bulle dit d'un cordon survolé
  showcase/     L'ÉCRAN TITRE : l'allée avant / après, une scène sans partie en cours
    showcase.ts     Showcase : l'allée, sa bascule d'un état à l'autre, sa pluie de câbles
    closet.ts       une baie et ses deux états (le désordre et la baie rangée), la chorégraphie de l'un à l'autre
    bay.ts          un état d'une baie : son World, sa vue, le vol de ses cordons
    aisleLayout.ts  où se tiennent les baies : un demi-cercle autour du spectateur
    cableRain.ts    le décor : des câbles qui tombent et s'entassent au milieu de la salle
  render/       LE DESSIN (three.js) de ce que game décrit
    stage.ts        Stage : la scène, la caméra, le cadrage, le rendu et sa qualité, choisie ou adaptée au GPU
    quality.ts      les niveaux de qualité de l'image (QUALITY), et ce que le joueur a choisi : auto à partir d'un
                    niveau, ou des réglages fixes (QualityChoice)
    stageSetup.ts   la construction du renderer, des contrôles et des lumières
    threeCompat/    TOUT CE QUI DÉPEND DES INTERNES DE THREE.JS, et nulle part ailleurs (règle ESLint) : les retouches
                    de shaders (materialPatch, shaderPatch), les passes de post-traitement retouchées (passes :
                    ReflectionPass, BloomPass, l'occlusion) ; vérifié contre la version installée par
                    tests/render/threeCompat/ (voir docs/mise-a-jour-three.md)
    gpu.ts          la carte graphique utilisée, et le conseil à donner quand elle dessine trop lentement
    frontImage.ts   l'image de face de la baie (avant / après de l'écran de résultat)
    frameGrab.ts    une petite copie de l'image qui vient d'être dessinée (une image du timelapse, presque gratuite)
    findView.ts     une trouvaille dessinée là où elle est posée (un post-it, un canard en plastique…)
    look.ts         ce que le joueur a choisi pour l'image (couleur des velcros, teinte de la lumière) : rien des règles
    cameraTour.ts   le vol de la caméra autour d'une baie validée, puis retour de face (Stage.tour)
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
    timelapsePlayer.ts le timelapse lu en boucle, et enregistré en vidéo (MediaRecorder) ; beforeAfterImage.ts, la baie
                    avant / après en une image ; share.ts, l'adresse du jeu et les fichiers offerts au joueur
    resultScreen.ts l'écran de résultat ; modesPanel.ts, les modes de jeu (une carte chacun) ; levelMenu.ts, une section à la
                    fois (la campagne et son tutoriel, ou les puzzles)
    pauseMenu.ts    le menu d'un niveau (☰ Menu, Échap) : le chrono attend ; consignes, recommencer, niveaux,
                    paramètres, accueil ; confirmDialog.ts, la question avant de quitter une baie entamée
    settingsPanel.ts les paramètres : qualité de l'image (auto, préréglages, détails) et son
    progress.ts     la progression du joueur : meilleur score, défi réussi (chrono de la campagne, gestes d'un puzzle),
                    niveau ouvert, niveau suivant (fonctions pures)
    shop.ts         l'atelier : son catalogue, acheter et porter un look (fonctions pures) ; shopPanel.ts, son panneau
    wallet.ts       le salaire encaissé : un niveau rejoué ne paie que ce qu'il ajoute à sa meilleure fiche de paie
    editorPanel.ts  l'éditeur de baie : équipements empilés, règles, jouer ou copier le lien (?rack=CODE)
    outcome.ts      ce que laisse une baie validée, selon sa sorte de niveau : record, salaire, partage, niveau suivant
    career.ts       la carrière : le ticket à jouer, le ticket validé (la baie gardée) ; careerPanel.ts, son panneau
    daily.ts        les baies du jour réussies : le meilleur de chaque jour, les jours de suite, le résultat à partager
    messages.ts     tous les textes d'une partie : messages, aides, bulle d'un cordon, critères de lisibilité
    keyHints.ts     les touches qui comptent à l'instant (outil en main, cordon survolé), en touches de clavier sous la baie
    language.ts     la langue parlée (français, anglais) : tr({ fr, en }) choisit les mots, onLanguageChange fait
                    réécrire ce qui n'est écrit qu'une fois ; pageTexts.ts, les mots de index.html (data-i18n)
    names.ts        le nom des choses : services (et ce qu'ils portent), fournitures, sortes de cordon, plaques des équipements
    levelTexts.ts   les mots de chaque niveau : titre, brief, conseils (ceux de la campagne par id ; les autres d'après ce qu'ils sont)
    tutorial.ts     le tutoriel guidé, par-dessus un niveau
    titleScreen.ts  les boutons de l'écran titre ; showcaseSwitch.ts, l'interrupteur
                    Avant / Après et sa légende
    panelMargins.ts la place que les panneaux couvrent à chaque bord de l'écran : la baie est cadrée dans le reste
    notice.ts       le bandeau qui conseille le joueur quand la carte graphique est trop lente
    format.ts       nombres, longueurs et durées tels que le joueur les lit
    storage.ts      données gardées dans le navigateur (clés, valeurs par défaut, validation)
    dom.ts, icons.ts petites aides DOM (dialogue ouvert, étoiles), icônes de la barre d'outils
  audio/        les sons, synthétisés : effets (sfx.ts), musique d'ambiance du mode zen (ambient.ts), le contexte
                audio qu'ils partagent (context.ts)
  lib/          DES OUTILS SANS RAPPORT AVEC LE JEU, que toutes les couches peuvent importer et qui n'importent rien
    assertNever.ts  le défaut d'un switch qui a traité tous les cas
    vec3.ts         les points (V3) et la géométrie de base : distance, interpolation, longueur d'un chemin
    random.ts       tirages reproductibles : rng(seed), shuffle, pick
    page.ts         $ : un élément de index.html, ou une erreur claire s'il manque (game/ ne s'en sert pas)
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

  lib/   sous toutes les couches : des outils qui ne savent rien du jeu
```

`lib/` est tout en bas : des outils qui ne savent rien du jeu (géométrie, tirages au sort, `assertNever`), que
toutes les couches peuvent importer. `audio/` est une feuille. `game/` reste indépendant de la page : il n'utilise
pas `lib/page.ts`. **Ce sens est vérifié** : `eslint.config.js` interdit à chaque couche d'importer celles qui
sont au-dessus d'elle, et `npm run lint` échoue avec un message qui dit pourquoi. Le cœur (`game/`) peut ainsi
tourner sous Node, dans les tests et les bancs, et dans un Web Worker.

Quand une couche basse doit prévenir une couche haute, elle ne l'importe pas : elle reçoit un **rappel**.
`play/` prévient l'interface par `ControllerEvents` (`onEval`, `onToast`, `onHover`…), qu'`app/app.ts` relie à
`ui/hud.ts`, qui reçoit les données telles quelles et les met en mots. Ces rappels portent des **données** (un `Toast`, un `Hint`, un `CordInfo`), jamais du texte :
`ui/messages.ts` les met en mots. Dans l'autre sens, `ui/` lit l'état (`ctl.world`, `ctl.lastEval`) et appelle le contrôleur
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
légende. L'écran titre est le point de départ de tout : jouer, le tutoriel, les niveaux, les paramètres. Un niveau
se quitte par son menu de pause (`ui/pauseMenu.ts`), qui demande confirmation quand la baie est entamée ; les
panneaux ouverts depuis un autre (niveaux, paramètres) y reviennent par leur bouton Retour. La page s'ouvre en chargement (`body.booting`, dès le HTML) : un fond noir, le nom au milieu et sa barre,
rien d'autre ; le reste apparaît avec la salle. La première salle est toujours la même
(`SHOWCASE_DEFAULT`, `game/levels/showcaseRack.ts`) : son désordre tombé est précalculé (`npm run bake`,
`game/mess/showcase.bin`, ~210 Ko, lu par `game/mess/baked.ts`), elle s'affiche donc sans attendre la physique ;
une baie dont le désordre n'est plus celui du fichier (le code a changé depuis) retombe comme avant, et un test le
signale. Pendant qu'une salle est à l'écran, la suivante, tirée au hasard, se construit et tombe en fond
(`App.prepareNextAisle`) : « une autre salle » l'affiche aussitôt. Pendant un niveau, la salle de l'écran titre est
mise de côté (`Showcase.stop`, `App.keptAisle`), hors de la scène : revenir à l'accueil la remontre aussitôt, dans
l'état où on l'a laissée (une salle en pleine bascule est jetée, sa chorégraphie tourne sur des minuteries). Les options de la page (`?seed`, `?bays`,
`?pairs`, `?sync`, `?quality`) sont décrites en tête de `app/urlOptions.ts` ; voir aussi « L'écran d'accueil » dans
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

`ui/storage.ts` déclare chaque entrée (clé, valeur par défaut, validation) : progression (étoiles et meilleurs temps
par niveau), tutoriel terminé, carrière (tickets faits, la baie du client telle que laissée), dernière baie de l'éditeur, portefeuille (salaire, cosmétiques achetés, trouvailles), baies du jour (le meilleur résultat de chaque date), langue (celle du navigateur tant que le joueur n'en a pas choisi), musique coupée, qualité de l'image (le choix du joueur, ou le niveau où l'auto est descendu) et son
coupé. Les clés sont celles des versions précédentes.

## Ajouter…

| Évolution | Où |
|---|---|
| un niveau | une entrée dans `LEVELS` (`game/levels/campaign.ts`), bâtie avec les équipements de `game/levels/equipment.ts`, et ses mots dans `ui/levelTexts.ts` (un test vérifie qu'aucun ne manque) ; un puzzle, de même dans `PUZZLES` (`game/levels/puzzles.ts`) ; `tests/game/levels/levels.test.ts` vérifie son plan, qu'il ne se gagne pas sans rien faire et qu'il peut atteindre 3 étoiles avec son seul inventaire (`tidyKit`) |
| un équipement de baie | `UnitSpec` et le constructeur de `Rack` (`game/rack.ts`), sa face dans `faceOf` et son rendu dans `render/rackView.ts`, son nom dans `unitLabel` (`ui/names.ts`) |
| une sorte de cordon | une entrée dans `CORD_KINDS` (`game/cordTypes.ts`) ; le compilateur demande son nom (`ui/names.ts`), son marquage (`JACKET_KIND`, `render/jacket.ts`) et, s'il en a un nouveau, son connecteur (`plugShape`, `render/cableView.ts`) |
| un élément de rangement | `ItemKind`, `canPlace`, `statics` et `supports` dans `game/rack.ts`, `buildItem` dans `render/rackItems.ts`, un outil dans `TOOLS` (`ui/toolbar.ts`) |
| un outil | un `ToolHandler` dans `play/tools/`, son nom dans `Tool` (`play/context.ts`) et dans `Controller.tools`, son bouton dans `TOOLS` (`ui/toolbar.ts`) |
| un repère visuel pendant un geste | une classe dans `play/feedback/`, mise à jour par l'outil ou par `Controller.tick` |
| un critère de score | `evaluate()` (`game/evaluation.ts`), sa colonne dans le plan (`ui/schedulePanel.ts`) |
| un panneau de l'interface | un fichier dans `ui/`, créé et appelé par `Hud` (`ui/hud.ts`) |
| une étape du tutoriel | `STEPS` dans `ui/tutorial.ts` (`done` lit `ctl.counters` ou l'état du monde) |
| un texte | à l'endroit où il s'affiche, dans chaque langue : `tr({ fr: '…', en: '…' })` (`ui/language.ts`) ; un texte de `index.html` : une clé `data-i18n` et ses mots dans `ui/pageTexts.ts` (un test vérifie les deux listes) ; une langue : une entrée dans `Language` et `LANGUAGES`, le compilateur liste chaque texte à traduire |
| un message du contrôleur à l'interface | `ControllerEvents` (`play/context.ts`), relié dans `app/app.ts` |
| un raccourci clavier | `InputRouter.bindKeys` (`play/inputRouter.ts`), son action sur le contrôleur ou l'outil |
| une option de la page | `readUrlOptions` (`app/urlOptions.ts`) et son test |
| une couche, ou une règle entre couches | `eslint.config.js` (`layers`), et le schéma ci-dessus |
| une donnée gardée | une entrée dans `ui/storage.ts` |
| une ressource three.js partagée par tous les niveaux | l'envelopper dans `shared()` (`render/dispose.ts`) |
| un voyant qui clignote | une `LedSpec` (`render/leds.ts`), posée dans `render/rackView.ts` ; `ledGlow.ts` la reprend sur les câbles et la baie |
| une passe de post-traitement | le `composer` de `Stage` (`render/stage.ts`) ; si elle touche aux internes de three.js, dans `render/threeCompat/passes.ts` |
| un effet dans le shader d'un matériau | un `MaterialPatch` avec ses `uses` (`render/threeCompat/materialPatch.ts`), ajouté à la liste du test `tests/render/threeCompat/` |
| une nouvelle version de three.js | la procédure de `docs/mise-a-jour-three.md` |
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
