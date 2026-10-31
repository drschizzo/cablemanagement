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
    urlOptions.ts   ?sync, ?bays, ?pairs, ?seed, ?quality, ?rack, ?webgl, ?hdr : lus depuis une chaîne, donc testables
  game/         LES RÈGLES et la physique de la baie                       sans three.js ni DOM : tourne sous Node
    world.ts        World, l'état d'une partie : cordons et leurs bouts (et ceux coupés à l'intérieur), branchement,
                    velcros, bac, stock ; montré en lecture seule, changé par ses méthodes
    cables.ts       ce qu'est un cordon (Cable, CableEnd, Strap) et ses indices nommés (CableIndex, EndIndex,
                    NodeIndex, CircuitIndex)
    cordShapes.ts   la géométrie d'un cordon hors physique : remis à une autre longueur, enroulé dans le bac
    evaluation.ts   l'évaluation : chaque liaison (branchée, rangée, dégagée, sans tension), ce que demande la
                    validation (signOffGoals, ready), les exigences du client que le niveau ajoute (requirementsOf :
                    budget d'interruption, courant à part des données) — des fonctions qui lisent un World sans le
                    modifier
    maintenanceWindow.ts  liaisons en production, budget d'interruption, dérivations
    cabinetState.ts une baie telle que le joueur la laisse (équipements, supports, plan, cordons branchés, velcros),
                    pour la retrouver à la visite suivante (la carrière)
    finds.ts        les trouvailles : l'objet qu'un niveau cache (LevelBase.find), et où il est posé
    incidents.ts    les incidents pendant le chantier (un collègue débranche une liaison, un utilisateur appelle) :
                    joués par Incidents, appliqués à la baie par World.workGoesOn
    rack.ts         baie 19", ports, éléments de rangement, formes de collision, zones de rangement
    supplies.ts     les fournitures (supports et velcros), décrites une fois : ItemKind et Stock en dérivent
    schedule.ts     le plan de brassage : une ligne (Circuit), et le plan tiré au hasard d'un niveau (makeSchedule)
    cordTypes.ts    sortes de cordon, décrites une fois (famille, raideur, pliure, connecteur, couleur), ce qui porte
                    du courant ou des données (carriesPower), et longueurs du catalogue
    services.ts     les services du plan (données, voix…) : couleur, poids d'une coupure (leurs noms : ui/names.ts)
    idealRoutes.ts  la route idéale de chaque cordon, la baie « finie » d'un niveau (tidyKit), les cordons couchés
                    sur leurs routes (tidyLayout, la baie rangée de la vitrine)
    routeLaying.ts  l'outil Chemin côté règles : le chemin planifié (planRoute), le câble posé (RouteRun)
    physics/        le solveur tel que le jeu le mène (rackCableSim : mains, ports, creux des guides), et son Worker
    mess/           le désordre de départ : les chemins emmêlés des cordons (tangle), leur chute dans un Worker,
                    sa version précalculée pour l'écran titre (baked, showcase.bin)
    levels/         ce qu'est un niveau (levelDef : une union par sorte, formation, grande baie, ticket, tutoriel,
                    baie libre, vitrine, banc) ; les règles qu'il joue en plus de brancher et ranger (levelRules :
                    voyants, tension, production, pannes…, et la goulotte, que le tutoriel n'apprend pas) ; les
                    équipements nommés (equipment) ; la formation et le tutoriel (training), les grandes baies
                    (bigBays), les deux réunies, faites à la main (handmade) ; la carrière (career : un client, ses
                    tickets, chacun bâti sur la baie laissée par le précédent) ; la baie libre (freeLevel : sa
                    palette, ses réglages, en production ou non, son code de partage) ; les baies de la vitrine
                    (showcaseRack) ; où se passe un niveau (site : tous les tickets chez le client, chaque autre
                    niveau dans sa propre salle), d'où le décor est tiré
  play/         UNE PARTIE EN COURS : relie game, render et l'interface
    controller.ts   Controller : la boucle à pas fixe, le cordon sous la souris, les actions du HUD ; il assemble le reste
    context.ts      PlayContext (ce que les outils voient du contrôleur), ToolHandler (l'interface d'un outil),
                    ControllerEvents (ce que le contrôleur dit à l'interface)
    inputRouter.ts  la souris et le clavier, aiguillés vers l'outil qui a un geste en cours, ou vers la vue
    tools/          un fichier par outil : main, Chemin, velcro, supports, testeur
    feedback/       les repères dessinés par-dessus la baie : surbrillances et traceur, fil à plomb, autre main,
                    lueurs des connecteurs, port visé, portions tenues / pendantes, cadre du tutoriel
    pointer.ts      la souris sur la vue : pixels, rayon, projections écran ↔ baie
    picking.ts      ce qui est sous la souris : cordons (Tab pour le suivant), guides, ports libres
    undoHistory.ts  les états de la baie pour Ctrl+Z
    timelapse.ts    le chantier tel qu'il s'est passé : un relevé quatre fois par seconde de jeu, le tout gardé
                    même pour un long chantier (un relevé sur deux part, le rythme ralentit)
    replay.ts       ce relevé : l'état de la baie (nœuds, prises, étiquettes, velcros, supports, LEDs), et le temps
                    du rejeu (pris là où les câbles bougent), les câbles d'un relevé à l'autre le long d'une courbe
    replayView.ts   le rejeu dessiné par les vues du jeu, à la place des câbles de la baie
    workRecording.ts le chantier gardé : la baie telle que trouvée (une image), le timelapse, son rejeu
    cabinetSignals.ts ce que la baie montre et fait entendre de son état quand il change : voyants, cordons tout
                    juste rangés, trafic coupé puis rétabli, incidents et coupures annoncés
    levelViews.ts   la baie et la salle d'un niveau, construites pour jouer, ou hors de la vue pour préparer leurs
                    shaders (warmLevel)
    notices.ts      ce qu'une partie dit au joueur, en données (Toast, Hint, CordInfo, HoverNote) : ui/ les met en mots
    cordInfo.ts     ce que la bulle dit d'un cordon survolé
    tutorialSteps.ts les étapes du tutoriel : ce que chacune cadre, l'outil qu'elle met en main, quand sa tâche est
                    faite (les compteurs de gestes ou l'état de la baie) ; ses mots sont dans ui/tutorialTexts.ts
  showcase/     L'ÉCRAN TITRE : l'allée avant / après, une scène sans partie en cours
    showcase.ts     Showcase : l'allée, sa bascule d'un état à l'autre, sa pluie de câbles
    closet.ts       une baie et ses deux états (le désordre et la baie rangée), la chorégraphie de l'un à l'autre
    bay.ts          un état d'une baie : son World, sa vue, le vol de ses cordons
    dressing.ts     le chemin d'un cordon du désordre à sa route rangée, et retour : jamais à travers un guide (les
                    cordons s'écartent, passent devant les guides, y rentrent par leur ouverture)
    aisleLayout.ts  où se tiennent les baies : un demi-cercle autour du spectateur
    cableRain.ts    le décor : des câbles qui tombent et s'entassent au milieu de la salle
    aisleSettings.ts  les salles de l'écran titre selon les options de la page, et où la caméra s'y pose
  render/       LE DESSIN (three.js) de ce que game décrit
    stage.ts        Stage : la scène, les lumières, le rendu et sa qualité, choisie ou adaptée au GPU
    cameraRig.ts    la caméra et ses mouvements : le cadrage du sujet dans l'écran laissé libre, l'orbite du joueur
                    gardée près du sujet et au-dessus du sol, le balancement de la démo, le tour, une pose du rejeu
    imagePipeline.ts la chaîne de l'image : la scène dessinée une fois (couleur, normales, profondeur, ce qui reflète),
                    puis reflets du sol, occlusion ambiante, profondeur de champ, halo, tone mapping, finitions ;
                    reflective() et keepOutOfDepth() disent aux passes ce qu'est un matériau (le sol, un rai de lumière)
    quality.ts      les niveaux de qualité de l'image (QUALITY), et ce que le joueur a choisi : auto à partir d'un
                    niveau, ou des réglages fixes (QualityChoice)
    stageSetup.ts   la construction du renderer (WebGPURenderer : WebGPU, ou WebGL 2 à défaut), des contrôles et des
                    lumières
    toneCurve.ts    la courbe de tons : ACES jusqu'au blanc ; sur un écran HDR, les lumières au-delà
    hdrScreen.ts    l'écran affiche-t-il le HDR, et l'image va-t-elle au-delà du blanc (choix du joueur : auto, oui, non)
    tsl.ts          TSL, le langage de nœuds de three.js dans lequel s'écrivent les matériaux et les passes, typé
                    une fois ; glowTerms.ts, les lueurs que plusieurs effets ajoutent à un même matériau ;
                    instancedParts.ts, les pièces répétées par centaines (connecteurs, voyants, velcros), dessinées
                    en un appel, qui partagent le shader de leur matériau
    shaderWarmup.ts les shaders préparés hors de la vue, quelques pièces entre deux images (warmShaders) : le niveau
                    que l'écran titre construit en fond (warmLevel, play/levelViews.ts) s'ouvre sans attendre ses shaders
    gpu.ts          la carte graphique utilisée, et le conseil à donner quand elle dessine trop lentement
    frontImage.ts   l'image de face de la baie (avant / après de l'écran de résultat)
    frameGrab.ts    une copie de l'image qui vient d'être dessinée, sans les panneaux (une image du timelapse)
    findView.ts     une trouvaille dessinée là où elle est posée (un post-it, un canard en plastique…)
    look.ts         ce que le joueur a choisi pour l'image (couleur des velcros, teinte de la lumière) : rien des règles
    cameraTour.ts   le vol de la caméra autour d'une baie validée, puis retour de face (CameraRig.tour)
    rackView.ts     la baie, ses équipements, ports, plaques et voyants (sur un équipement actif, un second voyant par
                    port : le trafic d'une liaison, à la couleur de son service, que le contrôleur lui donne)
    levelScenery.ts ce qui entoure la baie d'un niveau sans être la baie : le sol, les ombres de contact, la salle
                    serveur (posé par le contrôleur à côté de RackView, tiré du lieu du niveau, game/levels/site.ts)
    serverRoom/     le décor d'un niveau autour de la baie, où rien ne se joue (posé par levelScenery.ts) :
                    serverRoom.ts assemble la salle (des rangées pas tout à fait alignées, une lumière de contre-jour) ;
                    roomRack.ts, une baie de la salle (ses équipements et leurs ports ; rangée, ses cordons passés
                    dans les peignes, ou en désordre, d'un port à l'autre ; toujours devant les façades) ;
                    roomProps.ts, ce qui traîne (chemins de câbles, cartons, couronnes, chariot, extincteur) ;
                    battens.ts, les réglettes LED au-dessus de l'allée : leur corps, leurs rais de lumière et leur
                    poussière ; roomParts.ts, les pièces réunies en quelques maillages, et la couleur d'un cordon
                    de la salle
    rackItems.ts    les éléments de rangement, construits à partir de leurs formes de collision (buildItem)
    rackMaterials.ts, rackTextures.ts, shapes.ts   matériaux, textures, formes de la baie ; rackWear.ts, l'usure des
                    années sur son métal peint et son plastique, dessinée dans le shader
    floor.ts        le sol en dalles sur lequel se tient chaque scène (niveau et écran titre), ses passe-câbles ;
                    floorTextures.ts, ses textures dessinées une fois (la flaque de lumière, les dalles pleines ou
                    perforées, l'usure des années)
    cableView.ts    les câbles (tubes de three-cable-tubes), leurs connecteurs et étiquettes
    jacket.ts, straps.ts, leds.ts, ledGlow.ts   gaine vue de près, velcros, voyants et leur lumière
    bevel.ts, batch.ts, dispose.ts   pièces légères, moins d'appels de dessin, mémoire GPU
    bloom.ts, cinema.ts   le halo des lumières ; les finitions (vignette, grain, virage, aberration)
    depthOfField.ts la profondeur de champ d'un niveau : la baie nette, la salle autour floutée selon sa distance à la
                    baie (derrière comme sur les côtés), ses voyants ouverts en disques
                    (Stage.focusOnSubject, que le contrôleur allume ; l'écran titre reste net partout)
  ui/           L'INTERFACE HTML autour de la baie
    hud.ts          Hud : assemble les panneaux, et les petites choses (aide, bulle, message, chronomètre)
    toolbar.ts      la barre d'outils et ce qui reste en stock ; stockMenu.ts, le stock de cordons neufs
    schedulePanel.ts le plan de brassage, le budget d'interruption, ce que demande la validation, les exigences
                    du client, le bouton Valider
    levelBrief.ts   le brief d'un niveau (ses conseils, les règles qu'on y rencontre pour la première fois),
                    puis la préparation ; ruleTexts.ts, les mots de chaque règle et de chaque geste
    timelapsePlayer.ts le timelapse rejoué en boucle en 5 s, la caméra qui dérive, et enregistré en vidéo (MediaRecorder) ; beforeAfterImage.ts, la baie
                    avant / après en une image ; share.ts, l'adresse du jeu et les fichiers offerts au joueur
    resultScreen.ts l'écran de résultat ; modesPanel.ts, les modes de jeu en deux groupes (histoire, partie libre) ;
                    levelMenu.ts, la formation et son tutoriel
    pauseMenu.ts    le menu d'un niveau (☰ Menu, Échap) : le chrono attend ; consignes, recommencer, niveaux,
                    paramètres, accueil ; confirmDialog.ts, la question avant de quitter une baie entamée
    settingsPanel.ts les paramètres : qualité de l'image (auto, préréglages, détails) et son
    notebookPanel.ts le carnet du technicien : les trouvailles ramassées et où chercher les autres, les teintes
    freePanel.ts    la baie libre : les grandes baies, ou une baie réglée (câbles, services, désordre, production, la
                    baie en élévation et sa palette), jouer ou copier le lien (?rack=CODE)
    careerPanel.ts  la carrière : le client, ses tickets un par un, et une nouvelle carrière ; recordBadge.ts,
                    le dossier d'une baie validée sur sa carte (formation, grandes baies, carrière)
    messages.ts     tous les textes d'une partie : messages, aides, bulle d'un cordon, et pourquoi
                    une baie libre ne se joue pas
    keyHints.ts     les touches qui comptent à l'instant (outil en main, cordon survolé), en touches de clavier sous la baie
    pageTexts.ts    les mots de index.html (data-i18n)
    names.ts        le nom des choses : services (et ce qu'ils portent), fournitures, sortes de cordon, plaques des
                    équipements, trouvailles, teintes du carnet
    levelTexts.ts   les mots de chaque niveau : titre, brief, conseils (ceux de la formation et des grandes baies par id ; les autres d'après ce qu'ils sont)
    tutorial.ts     le tutoriel guidé, par-dessus un niveau : les bases du premier niveau, puis, au choix, les gestes
                    avancés ; tutorialTexts.ts, les mots de chaque étape
    titleScreen.ts  les boutons de l'écran titre (Commencer seul au premier lancement) ; showcaseSwitch.ts, l'interrupteur
                    Avant / Après et sa légende
    panelMargins.ts la place que les panneaux couvrent à chaque bord de l'écran : la baie est cadrée dans le reste
    notice.ts       le bandeau qui conseille le joueur quand la carte graphique est trop lente
    format.ts       nombres, longueurs et durées tels que le joueur les lit
    dom.ts, icons.ts petites aides DOM (afficher, cacher, dialogue ouvert), icônes de la barre d'outils
  progression/  CE QUE LE JOUEUR GARDE d'une visite à l'autre, en fonctions pures sur ce qui est sauvé ; l'interface le montre
    storage.ts      les données gardées dans le navigateur (clés, valeurs par défaut, validation) : la progression,
                    et aussi les réglages (langue, qualité de l'image, son)
    progress.ts     la progression : le dossier de chaque niveau validé, niveau ouvert, niveau suivant, fin de la
                    formation, règles déjà rencontrées
    levelRecord.ts  le dossier d'une baie validée (exigences du client remplies sur celles demandées, temps), le
                    meilleur de deux, et ses coches au carnet
    modeLocks.ts    quels modes sont ouverts : la formation et la baie libre d'emblée, la carrière à la fin de la
                    formation
    career.ts       la carrière telle que le joueur l'avance : le ticket à jouer, le ticket validé (la baie gardée,
                    son dossier)
    notebook.ts     le carnet du technicien : quand il s'ouvre, les trouvailles gardées, les teintes (le catalogue,
                    les coches qui ouvrent chacune, celle qu'on porte)
    outcome.ts      ce que laisse une baie validée, selon sa sorte de niveau : dossier, baie à partager, niveau suivant
  audio/        les sons, synthétisés : effets (sfx.ts), musique d'ambiance de la baie libre hors production (ambient.ts), le contexte
                audio qu'ils partagent (context.ts)
  lib/          DES OUTILS SANS RAPPORT AVEC LE JEU, que toutes les couches peuvent importer et qui n'importent rien
    assertNever.ts  le défaut d'un switch qui a traité tous les cas
    vec3.ts         les points (V3) et la géométrie de base : distance, différence, produit scalaire, interpolation,
                    longueur d'un chemin
    random.ts       tirages reproductibles : rng(seed), shuffle, pick, et seedOf (une graine tirée d'un texte)
    noise.ts        un bruit doux en deux dimensions, le même partout (valueNoise, fbm)
    scalar.ts       les petites fonctions d'un nombre (smoothstep, fractionalPart)
    once.ts         once : une valeur faite au premier appel et gardée (une texture, une lumière, des nœuds)
    page.ts         $ : un élément de index.html, ou une erreur claire s'il manque (game/ ne s'en sert pas)
    language.ts     la langue parlée (français, anglais) : tr({ fr, en }) choisit les mots, onLanguageChange fait
                    réécrire ce qui n'est écrit qu'une fois (game/, render/, play/ et showcase/ ne s'en servent pas)
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
          ui      │        │          interface HTML
          │       │        │
     progression  │        │          ce que le joueur garde
          │       │        │
          ├───────┤     showcase      écran titre
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
pas `lib/page.ts`. Les phrases sont l'affaire de l'interface : `game/`, `render/`, `play/` et `showcase/`
n'importent pas `lib/language.ts`. **Ce sens est vérifié** : `eslint.config.js` interdit à chaque couche d'importer celles qui
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
si le code qui dispose le désordre change, une baie qui ne correspond plus au fichier tombe au chargement, comme
les autres salles, et un test le signale. Pendant qu'une salle est à l'écran, la suivante, tirée au hasard, se construit et tombe en fond
(`App.prepareNextAisle`) : « une autre salle » l'affiche aussitôt. Pendant un niveau, la salle de l'écran titre est
mise de côté (`Showcase.stop`, `App.keptAisle`), hors de la scène : revenir à l'accueil la remontre aussitôt, dans
l'état où on l'a laissée (une salle en pleine bascule est jetée, sa chorégraphie tourne sur des minuteries). Les options de la page (`?seed`, `?bays`,
`?pairs`, `?sync`, `?quality`) sont décrites en tête de `app/urlOptions.ts` ; ce qu'elles changent aux salles, et le cadrage de l'accueil
(`TITLE_VIEW`), est dans `showcase/aisleSettings.ts` ; voir aussi « L'écran d'accueil » dans
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

`progression/storage.ts` déclare chaque entrée (clé, valeur par défaut, validation) : progression (le dossier de chaque niveau
validé : exigences du client remplies, meilleur temps), tutoriel terminé, règles déjà rencontrées, carrière (tickets faits, la baie du client telle que laissée, le dossier de chaque ticket), dernière baie libre réglée, carnet (teintes portées, trouvailles), langue (celle du navigateur tant que le joueur n'en a pas choisi), musique coupée, qualité de l'image (le choix du joueur, ou le niveau où l'auto est descendu), image HDR (automatique, activée ou désactivée, et l'intensité de ses lumières) et son
coupé. Une valeur illisible ou d'une autre forme se lit comme la valeur par défaut.

## Ajouter…

| Évolution | Où |
|---|---|
| une règle de niveau | une entrée dans `RULES` et `hasRule` (`game/levels/levelRules.ts`), ses mots dans `ruleTip` (`ui/ruleTexts.ts`) : le brief la dit au premier niveau qui l'a, puis ne la redit plus |
| un niveau | une entrée dans `TRAINING` (`game/levels/training.ts`) ou `BIG_BAYS` (`game/levels/bigBays.ts`), bâtie avec les équipements de `game/levels/equipment.ts`, et ses mots dans `ui/levelTexts.ts` (un test vérifie qu'aucun ne manque) ; `tests/game/levels/levels.test.ts` vérifie son plan, qu'il ne se valide pas sans rien faire et qu'il peut être validé avec toutes ses exigences avec son seul inventaire (`tidyKit`) |
| un équipement de baie | `UnitSpec` et le constructeur de `Rack` (`game/rack.ts`), sa face dans `faceOf` et son rendu dans `render/rackView.ts`, son nom dans `unitLabel` (`ui/names.ts`) |
| une sorte de cordon | une entrée dans `CORD_KINDS` (`game/cordTypes.ts`) ; le compilateur demande son nom (`ui/names.ts`), son marquage (`JACKET_KIND`, `render/jacket.ts`) et, s'il en a un nouveau, son connecteur (`plugShape`, `render/cableView.ts`) |
| un élément de rangement | une entrée dans `SUPPLIES` (`game/supplies.ts`, d'où `ItemKind` dérive), `canPlace`, `statics` et `supports` dans `game/rack.ts`, `buildItem` dans `render/rackItems.ts`, où l'outil Supports le pose (`play/tools/supportsTool.ts`), son nom dans `ui/names.ts` |
| un outil | un `ToolHandler` dans `play/tools/`, son nom dans `Tool` (`play/context.ts`) et dans `Controller.tools`, son bouton dans `TOOL_BUTTONS` (`ui/toolbar.ts`) |
| un repère visuel pendant un geste | une classe dans `play/feedback/`, mise à jour par l'outil ou par `Controller.tick` |
| un critère d'évaluation | `evaluate()` (`game/evaluation.ts`) ; s'il bloque la validation, un but dans `SignOffGoal` et `signOffGoals` ; si c'est une exigence du client, une entrée dans `Requirement` et `requirementsOf` ; ses mots dans `goalText` (`ui/messages.ts`) |
| un panneau de l'interface | un fichier dans `ui/`, créé et appelé par `Hud` (`ui/hud.ts`) |
| une étape du tutoriel | son id dans `StepId`, une entrée dans `BASICS` (ce que demande le premier niveau) ou `ADVANCED` (les gestes fins) (`play/tutorialSteps.ts` : `done` lit `ctl.counters` ou l'état du monde), ses mots dans `STEP_TEXTS` (`ui/tutorialTexts.ts`), que le compilateur demande |
| un texte | à l'endroit où il s'affiche, dans chaque langue : `tr({ fr: '…', en: '…' })` (`lib/language.ts`) ; un texte de `index.html` : une clé `data-i18n` et ses mots dans `ui/pageTexts.ts` (un test vérifie les deux listes) ; une langue : une entrée dans `Language` et `LANGUAGES`, le compilateur liste chaque texte à traduire |
| un message du contrôleur à l'interface | `ControllerEvents` (`play/context.ts`), relié dans `app/app.ts` |
| un raccourci clavier | `InputRouter.bindKeys` (`play/inputRouter.ts`), son action sur le contrôleur ou l'outil |
| une option de la page | `readUrlOptions` (`app/urlOptions.ts`) et son test |
| une couche, ou une règle entre couches | `eslint.config.js` (`layers`), et le schéma ci-dessus |
| une donnée gardée | une entrée dans `progression/storage.ts` |
| une ressource three.js partagée par tous les niveaux | l'envelopper dans `shared()` (`render/dispose.ts`) |
| un voyant qui clignote | une `LedSpec` (`render/leds.ts`), posée dans `render/rackView.ts` ; `ledGlow.ts` la reprend sur les câbles et la baie |
| une passe de post-traitement | un nœud dans la chaîne d'`ImagePipeline` (`render/imagePipeline.ts`) ; un réglage donné par son nom à un nœud de three.js, vérifié par `tests/render/threeNodes.test.ts` |
| un effet dans le shader d'un matériau | des nœuds TSL (`render/tsl.ts`) branchés sur les étapes d'un matériau à nœuds (`colorNode`, `normalNode`…) ; une lueur qui s'ajoute aux autres : `addGlow` (`render/glowTerms.ts`) |
| une nouvelle version de three.js | la procédure de `docs/mise-a-jour-three.md` |
| une sorte de câble pour le moteur | une entrée dans `CABLES`, dans cable-kit (`packages/avbd-cables/src/presets.ts`) ; voir son README |
| un réglage du moteur | `SimParams` et `defaultSimParams` (`cableSim.ts`) ; un réglage du jeu (main, chemin, creux des guides) : `RackParams` (`game/physics/rackCableSim.ts`) |

## Vérifications

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run lint` | erreurs probables, et le sens des dépendances entre couches (ESLint) |
| `npm run typecheck` | types (TypeScript strict) |
| `npm test` | géométrie, baie, stockage, options de la page, formats, historique d'annulation, fenêtre de maintenance, règles d'une partie (branchement, fenêtre de maintenance, étiquettes, velcro, longueurs, bac), niveaux (plan, emmêlage stable, validation avec toutes les exigences possible), salle d'accueil précalculée à jour, réglages donnés aux nœuds de three.js |
| `npm run check` | les trois à la suite |
| `npm run bake` | précalcule le désordre de la salle d'accueil par défaut (à relancer quand le test `baked` le demande) |
| `npm run bench` · `precision` · `levels` · `solvable` · `showcase` · `dressing` · `free` · `pinch` · `release` · `fold` · `route` · `plug` · `plugin` | bancs du moteur, des gestes et des niveaux, sans navigateur : ce que mesure chacun et ses réglages dans `tools/README.md` |

Ces vérifications se lancent en local avant de pousser. La CI (`.github/workflows/ci.yml`) fait la même chose,
plus la construction, mais seulement quand on la lance à la main (onglet *Actions* de GitHub).

## Publication

À chaque push sur `main`, `.github/workflows/pages.yml` construit le jeu (`npm run build`) et le publie sur
GitHub Pages : <https://drschizzo.github.io/cablemanagement/>. `base: './'` (`vite.config.ts`) garde des chemins
relatifs, pour que le jeu marche sous ce sous-dossier.
