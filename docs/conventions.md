# Conventions

Les règles que suit le code de ce projet, et pourquoi. Chacune renvoie à un exemple du projet : il vaut mieux
le lire que la règle.

## Découper

**Un dossier répond à une question, un fichier à une seule.** `game/` dit ce qui se passe dans la baie, `render/`
comment on le dessine, `play/` comment le joueur agit dessus, `app/` quelle scène est à l'écran. Dans `play/`,
chaque outil a son fichier (`tools/handTool.ts`, `tools/velcroTool.ts`…), et chaque repère visuel le sien
(`feedback/plumbLine.ts`…).

**Un fichier commence par ce qu'il fait.** Deux ou trois lignes de commentaire, avant les imports :

```ts
// The maintenance window: the links working when the player arrives are in
// production, and every second one of them is cut costs the weight of its
// service from a downtime budget.
```

Si la phrase a besoin de « et puis… et aussi… », le fichier fait sans doute plusieurs choses.

**La taille est un signal, pas une règle.** Au-delà de 400 à 500 lignes, se demander ce qui pourrait partir dans un
fichier à soi. `play/controller.ts` mène la partie, mais la souris et le clavier vivent dans `inputRouter.ts`,
chaque outil dans `tools/`, chaque repère dans `feedback/`. Certains fichiers restent longs parce
qu'ils sont cohérents : `game/world.ts` est l'état d'une partie, `game/levels/training.ts` est une liste de niveaux.

**Un fichier vit avec ce qu'il sert, pas avec ceux qui l'appellent.** Les couleurs des fibres sont à côté de leurs
noms (`game/cordTypes.ts`), pas dans la vue des câbles qui les dessine. La place que couvrent les
panneaux se mesure dans `ui/` (`panelMargins.ts`), qui connaît les panneaux, et `app/` la transmet à la scène.
Un outil qui ne sait rien du jeu (`assertNever`, `vec3`) va dans `lib/`, et non dans la première couche qui en a
besoin. Pour vérifier, demander : *si je supprimais ce qui l'appelle, ce fichier aurait-il encore un sens ici ?*

**Une couche basse ne lit pas l'interface.** `render/` ne crée pas de bandeau HTML, il signale qu'il a un conseil
(`onGpuAdvice`) ; `play/` ne cherche pas la classe CSS d'un dialogue ouvert, il pose la question
(`ControllerEvents.isDialogOpen`) ; la vitrine annonce son état (`onStateChange`) et `ui/showcaseSwitch.ts` le
montre.

**Séparer les données, les types et le code qui les fabrique.** `game/levels/` en est l'exemple : `levelDef.ts` dit
ce qu'est un niveau, `equipment.ts` nomme les équipements, `training.ts` et `bigBays.ts` ne contiennent que des données, et
`showcaseRack.ts` / `freeLevel.ts` sont des générateurs.

## Dépendre

**Une couche n'importe que celles qui sont en dessous d'elle** (le schéma est dans `architecture.md`). Le cœur,
`game/`, n'importe ni three.js ni le DOM : on peut le tester sous Node, le faire tourner dans un Worker, et changer
tout l'affichage sans le toucher.

**C'est vérifié, pas seulement écrit.** `eslint.config.js` déclare les couches (`layers`) ; un import qui remonte
fait échouer `npm run lint` avec un message qui explique la règle. Une règle d'architecture qui n'est pas
vérifiée finit toujours par être contournée.

**Pour prévenir une couche du dessus, recevoir un rappel au lieu de l'importer.** Le contrôleur ne connaît pas le
HUD : il reçoit un objet `ControllerEvents` (`play/context.ts`) et appelle `onToast`, `onEval`… C'est `app/app.ts`,
tout en haut, qui branche ces rappels sur `ui/hud.ts`.

**Dépendre d'une interface étroite plutôt que d'une grosse classe.** Les outils ne voient pas le `Controller` mais
`PlayContext`, la liste de ce qu'il leur prête. `MaintenanceWindow` ne voit pas le `World` mais une fonction
`isUp(i)` : c'est ce qui permet de la tester seule (`tests/game/maintenanceWindow.test.ts`).

**Une ressource a un seul propriétaire, qui la libère.** Chaque scène, outil ou repère qui ajoute des objets à la
scène 3D les retire et libère leur mémoire GPU dans son `dispose()` (`render/dispose.ts`).

## Nommer

**Le nom dit ce qu'est la chose, pas comment elle est faite.** `idealRoutes.ts` plutôt que `tidy.ts`,
`routeLaying.ts` plutôt que `route.ts` (« route » désigne aussi la route idéale d'un cordon), `plumbLine` plutôt que `guide` (un
`Guide` est déjà un guide-câbles de la baie).

**Fichiers** en `camelCase`, du nom de ce qu'ils exportent : `handTool.ts` exporte `HandTool`. **Types et
classes** en `PascalCase`. **Constantes de réglage** en `MAJUSCULES`, en tête du fichier, avec leur unité :

```ts
/** m per physics step the hand may move */
const MAX_HAND_STEP = 0.035;
```

Pas de nombre magique au milieu d'un calcul : `0.035` y devient `MAX_HAND_STEP`.

**Les booléens se lisent comme une question** : `isStale(token)`, `isDown(link)`, `hasProgress()`. **Les méthodes
qui agissent sont des verbes** (`plug`, `remember`, `announceCut`) ; celles qui calculent disent ce qu'elles
rendent (`liveLinksCarriedBy`, `freePortUnderPointer`).

**Les noms courts sont convenus, ou locaux.** Le code de `game/` manipule sans cesse les mêmes objets ; quelques
abréviations y sont donc **convenues**, et toujours dans ce sens (la baie s'écrit `rack`, un tirage au sort
`random`, un rectangle de l'écran `rect`) :

| Nom | Ce que c'est | Nom | Ce que c'est |
|---|---|---|---|
| `w` | le `World` | `cb` | un `Cable` (`w.cables[c]`) |
| `ctl` | le `Controller` | `ev` | une `Evaluation` |
| `c` | l'indice d'un cordon (`CableIndex`) | `ci` | une ligne du plan (`Circuit`) |
| `e` | un bout de cordon, 0 ou 1 (`EndIndex`) ; dans un écouteur, l'événement | `x` | les positions du solveur, `x[3 * i]` à `x[3 * i + 2]` |
| `i` | un nœud du solveur (`NodeIndex`) ; ou une ligne du plan (`CircuitIndex`) | `sim` | le solveur (`w.sim`) |
| `k` | un rang le long d'un cordon, ou dans une liste | `r` | un rayon (d'un cordon, d'un doigt de guide) |

Toute autre abréviation reste locale : `t` dans une boucle de trois lignes, oui ; dans une signature publique,
non (`formatTime(seconds)`, `aisleLayout(bayCount, seed)`). Et quand un `number` peut être plusieurs choses,
un alias de type le dit : `plug(c: CableIndex, e: EndIndex, portId: string)` (`game/world.ts`).

**Une fonction se lit d'une traite.** Au-delà d'une soixantaine de lignes, elle fait sans doute plusieurs étapes :
les nommer. `planRoute` (`game/routeLaying.ts`) est une suite d'appels qui se lit
comme son commentaire (quel bout reste, le chemin en points, ajusté à la longueur du cordon, la place de chaque
nœud, le trajet de chaque nœud), et chaque étape a son nom et sa documentation.

**Ne pas recopier.** Une petite fonction utile partout a une seule maison : `dist`, `minus`, `dot`, `lerp` et `polyLength` sont
dans `lib/vec3.ts`, `rng`, `shuffle` et `pick` dans `lib/random.ts`, `smoothstep` et `fractionalPart` dans
`lib/scalar.ts`, et nulle part ailleurs. Une ressource faite au premier usage et gardée (une texture dessinée, la
lampe partagée) passe par `once()` (`lib/once.ts`).

**Ne pas masquer un nom que tout le monde connaît.** Ce que vise la souris s'appelle `CordPick`, et non `Pick`, qui
cacherait le `Pick<>` de TypeScript.

## Commenter

**Le code et ses commentaires sont en anglais ; la documentation, en français ; ce que lit le joueur, dans chaque langue du jeu.** Les
textes du jeu ne se mélangent pas au code : `game/` et `play/` n'écrivent ni phrase ni balise HTML. Ils envoient
des données (`{ kind: 'routeRefused', error: { kind: 'tooShort', missing: 0.12 } }`), et `ui/messages.ts` les met
en mots, avec ses propres tests. Il en va de même des noms et des niveaux : un niveau n'a pas de titre dans `game/`,
un service pas de nom, une plaque d'équipement pas de mot ; `ui/names.ts` et `ui/levelTexts.ts` les donnent, et
`render/` reçoit ce qu'il doit peindre par un rappel (`RackView` : `labelOf`). Le jeu se lit sans traverser le français ; le texte change sans toucher au jeu.

**Un texte s'écrit dans toutes les langues, là où il s'affiche.** `tr({ fr: 'Annulé.', en: 'Undone.' })` : les deux
versions côte à côte, que le type `Words` exige (une langue ajoutée à `Language` fait lister par le compilateur chaque
texte à compléter). Ce qui n'est écrit qu'une fois (un bouton, une étape du tutoriel) se réécrit quand la langue
change (`onLanguageChange`) ; le reste suit au prochain affichage.

**Un commentaire dit pourquoi, ou ce que le code ne peut pas dire** : une unité, une intention, un piège déjà
rencontré. Ce que fait une ligne, la ligne le dit elle-même.

```ts
// on the window: a button let go outside the canvas still ends the gesture
this.on(window, 'pointerup', (e: PointerEvent) => this.pointerUp(e));
```

**Les champs et les fonctions exportées ont un `/** … */`**, que l'éditeur montre au survol.

## Modéliser

**Une sorte de chose est décrite une fois, et les types en dérivent.** Ce que les règles savent d'une fourniture
(sa catégorie) est dans `SUPPLIES` (`game/supplies.ts`) ; `ItemKind` et `Stock` en sont calculés, et ses noms
(`ui/names.ts`) sont un `Record<Supply, …>` : une nouvelle sorte sans nom ne compile pas. Une liste écrite à la main ailleurs (`['fingerManager', 'duct', 'ring']`) oublierait la prochaine
sorte sans que rien ne le signale. De même, ce qu'on demande à un cordon (se plie-t-il ? prend-il la couleur de son
service ? quel connecteur ?) se demande à sa sorte (`CORD_KINDS`, `game/cordTypes.ts`), jamais à son nom
(`type === 'CU'`) : une nouvelle sorte n'est pas traitée en silence comme une autre.

**Un switch sur une union traite tous les cas, et finit par `assertNever`.** Une chaîne de ternaires
`a ? … : b ? … : c` traite en silence un nouveau cas comme le dernier : un nouveau support serait posé comme une
goulotte. Avec `default: return assertNever(kind)`, il ne compile plus tant qu'on ne l'a pas traité.

**Ce qui varie selon la sorte appartient à la sorte.** Le curseur d'un outil, le fait qu'il travaille sur les
cordons, ce que sa bulle ajoute : c'est l'outil qui le dit (`ToolHandler`), pas une suite de `tool === 'hand'`
ailleurs. De même, un niveau est une union discriminée par `kind` : seule la baie libre a des réglages, et le
compilateur demande `level.kind === 'free'` avant de lire `level.spec`.

**Une donnée dit ce qu'elle est.** Un port tient un `CordEnd { cable, end }`, pas un entier `cable * 2 + end` à
décoder ; une partie a une `phase` (`'playing' | 'paused' | 'preparing'`), pas deux booléens dont une combinaison n'a
pas de sens.

**L'état se change par des méthodes.** `World` montre ses cordons en lecture seule (`ReadonlyCable`) et les change
par ses méthodes (`plug`, `labelCord`…) : ses invariants (un port et le bout qui y est branché se correspondent) ne
dépendent pas de la discipline de chaque appelant : le compilateur refuse toute écriture venue d'ailleurs.

**Une dépendance fragile se vérifie.** Le jeu ne s'appuie que sur l'API publique de three.js ; ce qu'il donne par
son nom à un nœud de three.js (un réglage des reflets, de l'occlusion) est confronté à la version installée par
`tests/render/threeNodes.test.ts`, et ESLint refuse ce que `WebGPURenderer` ignorerait sans erreur (du GLSL, une
passe de l'`EffectComposer`). three.js s'importe d'un seul chemin, `three/webgpu`, qui donne aussi les matériaux à
nœuds : chaque matériau a son vrai type. Une mise à jour dit ce qui a bougé (`docs/mise-a-jour-three.md`).

**Échouer tôt et bruyamment.** Un élément absent de `index.html` lève une erreur qui le nomme (`$` dans
`lib/page.ts`), et un test vérifie qu'il ne manque aucun id ; un réglage qu'un nœud de three.js ne lit plus fait
échouer un test au lieu de rester sans effet.

## Tester

**`tests/` reprend l'arborescence de `src/`** : le test de `src/game/maintenanceWindow.ts` est
`tests/game/maintenanceWindow.test.ts`.

**Tester d'abord ce qui est pur.** Une fonction qui reçoit des données et rend un résultat se teste en trois lignes
(`tests/ui/format.test.ts`, `tests/app/urlOptions.test.ts`). C'est une raison de plus pour sortir la logique des
classes qui touchent au DOM, à three.js ou à la physique : `readUrlOptions` lit une chaîne plutôt que `location` ;
les règles de la progression (`ui/progress.ts`) vivent hors de l'écran de résultat ; la forme d'un cordon remis à
une autre longueur (`game/cordShapes.ts`) vit hors du `World` et se teste sur une liste de points écrite à la
main. Un hasard qu'on veut tester se passe en paramètre (`coilInCrate(…, random)`).

**Remplacer ce qui est lourd par un double.** `tests/play/undoHistory.test.ts` donne à l'historique un faux monde
qui numérote ses instantanés ; `tests/game/maintenanceWindow.test.ts` remplace toute la baie par un ensemble de
liaisons qu'on coupe à la main.

**Ce qui est chaotique se mesure, il ne se teste pas.** La physique des câbles change de résultat au moindre
changement : les bancs de `tools/` la mesurent sur des dizaines de tirages (`tools/README.md`), et les tests ne
vérifient que ce qui doit rester vrai (un niveau peut atteindre trois étoiles, le désordre ne s'envole pas).

## Vérifier et livrer

**`npm run check` avant chaque commit** : lint (dont les couches), types, tests. La CI fait la même chose.

**Un commit fait une chose**, qu'on peut relire, et annuler, seule. Le message commence par la zone touchée, puis
dit ce qui change ; le corps dit pourquoi :

```
Évaluation : le score de la baie sort de World (game/evaluation.ts)

evaluate, holdMap, la tension des cordons… vivent dans evaluation.ts, en
fonctions qui lisent un World sans le modifier. Aucun changement de
comportement.
```

**Un déplacement de code ne change pas son comportement.** Réorganiser et corriger dans le même commit rend les
deux impossibles à relire : d'abord on déplace (les tests passent, rien ne change), ensuite on modifie.
