# Brassage

Un jeu de *cable management* en 3D, dans le navigateur. On se retrouve devant
une baie réseau en désordre : des câbles emmêlés, certains mal branchés,
d'autres qui pendent jusqu'au sol. Il faut rebrancher chaque liaison selon le
plan de brassage, puis ranger proprement les câbles, comme un technicien sur
un vrai chantier.

Les câbles sont simulés physiquement : ils ont un poids, frottent les uns sur
les autres et s'empilent. Aucun câble ne traverse un équipement ni un élément
de rangement. La difficulté tient à l'organisation de la baie : par quels
guides faire passer chaque câble, avec quelle longueur, dans quel ordre.

**[Jouer en ligne](https://drschizzo.github.io/cablemanagement/)**, sans rien
installer (un navigateur récent avec WebGL 2 suffit).

![L'écran titre : une salle de baies en désordre, avec le bouton avant / après](docs/accueil.jpg)

## Lancer le jeu en local

Il faut Node.js 20 ou plus récent. Le moteur de câbles et le rendu des tubes viennent d'un sous-module git
([cable-kit](https://github.com/drschizzo/cable-kit)) : clonez avec `--recurse-submodules`, ou récupérez-le
après coup.

```bash
git submodule update --init
```

```bash
npm install
```

```bash
npm run dev
```

Le jeu s'ouvre sur http://localhost:5173, sur l'**écran titre** : une salle de
baies en désordre. L'interrupteur **Avant / Après** montre la même salle une
fois rangée.

Au premier lancement, **Commencer** ouvre le **tutoriel**, qui présente chaque
outil pas à pas, puis le premier niveau. Par la suite, le même bouton reprend
au premier niveau pas encore réussi. L'écran titre mène aussi au tutoriel, aux
**Niveaux** (le tutoriel, la campagne et la partie libre) et aux **Paramètres**.

Dans un niveau, **☰ Menu** (ou **Échap**) met le jeu en pause : consignes,
recommencer, choisir un autre niveau, paramètres, retour à l'accueil. Quitter
une baie déjà entamée demande confirmation.

Les **Paramètres** règlent la langue (français ou anglais), la qualité de l'image, le son et la musique. En **Auto**, la
qualité s'abaisse d'elle-même quand la carte graphique ne suit plus (le jeu le
signale) ; on peut aussi la fixer (Maximale, Élevée, Moyenne, Basse) ou régler
chaque effet : définition, ombres, occlusion ambiante, reflets au sol. Le choix
est gardé dans le navigateur ; `?quality=N` dans l'URL (0 à 6) fixe un niveau
le temps d'une visite.

## Le jeu

### Objectif

Chaque niveau fournit un **plan de brassage** : la liste des liaisons à établir
(tel port du panneau vers tel port du switch). Pour réussir, il faut :

1. brancher chaque liaison sur les bons ports, avec le bon type de câble
   (fibre ou cuivre) ;
2. ranger les câbles : aucune portion de plus de 20 cm ne doit pendre hors d'un
   guide-câbles, d'une goulotte ou d'un anneau ;
3. dégager la façade : aucun câble ne doit passer devant le port d'un autre ;
4. ne rien tendre ni plier : un cordon bien plus court que son chemin rangé
   est tendu, une fibre en angle vif est pliée ;
5. quand le niveau le demande, serrer les câbles en faisceaux : des velcros qui
   tiennent chacun au moins trois câbles, dans un guide-câbles ou une goulotte.

Un cordon branché comme prévu reçoit tout seul l'étiquette de son service.

| Étoiles | Condition |
|---|---|
| ★ | toutes les liaisons du plan sont branchées |
| ★★ | et au moins 70 % des câbles rangés, 85 % de la façade dégagée |
| ★★★ | tout est rangé, dégagé, sans tension (et serré en faisceaux si demandé), dans le budget d'interruption |

Une baie validée a droit à son tour d'honneur : la caméra fait le tour de la baie
pendant que les cordons s'allument de haut en bas, puis l'écran de résultat s'ouvre.

Il faut **★★** pour ouvrir le niveau suivant : brancher ne suffit pas, il faut
ranger. La jauge **Propreté** résume les critères ; un câble qui devient propre
s'allume en vert avec une note. Chaque niveau propose aussi un **défi chrono**
(★★★ en moins d'un temps donné).

La note de **lisibilité**, sur 100, départage les baies à ★★★ : le mou juste
(ni tendu, ni plus de 50 cm de trop), chaque cordon cuivre de la couleur de son
service, des faisceaux d'un seul service, la fibre et le cuivre dans des
supports séparés, pas de câbles qui se croisent devant la baie. L'écran de fin
montre la baie et sa note avant et après, et le record du niveau.

### Préparation

Dans un niveau qui fournit des supports, le chantier commence par une
**préparation** : la baie est figée et le chrono arrêté. On lit le plan, on pose
guide-câbles, goulottes et anneaux là où les câbles passeront, puis on lance le
chantier.

### Fenêtre de maintenance et services

La baie est en production : les liaisons qui fonctionnent au départ (marquées
⚡ dans le plan) portent du trafic. Chaque seconde où l'une d'elles est coupée
coûte le **poids de son service** sur un **budget d'interruption**, affiché en
haut de l'écran :

| Service | Ce qu'il porte | Poids |
|---|---|---|
| Admin | pare-feu, routeur, supervision | ×4 |
| Voix | téléphones IP | ×3 |
| Stockage | serveurs et disques | ×3 |
| Vidéo | caméras | ×2 |
| Données | postes de travail | ×1 |
| Invités | Wi-Fi des visiteurs | ×0,25 |

On peut toujours débrancher, pour démêler par exemple ; au-delà du budget, un
incident est déclaré et ★★★ n'est plus possible. Une **dérivation** (clic sur
le ⚡ d'une ligne du plan) porte le trafic d'une liaison pendant qu'on la
recâble, puis revient au stock quand la liaison est rétablie. Les voyants d'une
liaison coupée clignotent en rouge, ceux d'une liaison dérivée en ambre.

### Cordons neufs

Le **Stock** fournit des cordons neufs, comptés par longueur ; ils arrivent
enroulés dans le bac au pied de la baie. Remplacer un cordon branché, c'est le
débrancher, donc couper sa liaison le temps de changer : savoir qui reçoit quel
cordon, et dans quel ordre, fait partie du plan.

### Niveaux

| # | Niveau | Câbles · particularité |
|---|---|---|
| 1 | Premier brassage | 4 |
| 2 | Le mou | 6 |
| 3 | Erreurs de brassage | 8 |
| 4 | Étiquetage | 10 · trois services |
| 5 | Fibre et cuivre | 12 |
| 6 | Salle serveurs | 20 · faisceaux, goulottes comptées |
| 7 | Migration | 24 · budget d'interruption serré |
| 8 | Le plat de spaghettis | 28 · cordons sans marque, à tracer |

Les **puzzles express** (P1 à P8, tous ouverts) sont de toutes petites baies, une idée chacune : un
bout libre, deux cordons échangés, un support à poser, un faisceau, des goulottes, une liaison en
production sur un budget minuscule, des cordons sans marque. Leur défi : ★★★ en peu de **gestes**
(un cordon déplacé ou branché, un chemin posé, un support ou un velcro posé ou retiré, un cordon au
bac ou pris au Stock), compté en haut de l'écran.

La **partie libre** génère une baie au hasard, de 4 à 48 câbles.

Le **mode zen** (menu des niveaux) : une grande baie de 36 câbles, rien en production, pas de chrono,
du matériel en abondance, et une musique d'ambiance générée à la volée (coupable dans les Paramètres).

La **baie du jour** est la même pour tout le monde à une date donnée : petite le lundi, plus grosse le
week-end. Le jeu garde le meilleur résultat de chaque jour et compte les jours de suite ; l'écran de
fin propose de **copier le résultat** (étoiles, temps, lisibilité, interruption, et une grille d'un
carré par liaison : 🟩 rangée, 🟨 seulement branchée, ⬛ pas branchée) pour le partager.

## Commandes

| Action | Geste |
|---|---|
| Saisir et tirer un câble | clic gauche + glisser |
| Pousser vers le fond / ramener vers soi | **Maj** + souris vers le haut / le bas pendant qu'on tire (ou la molette) |
| Pincer un coude, qui garde sa forme | maintenir **Espace** (ou le clic droit) pendant qu'on tient le câble : plus longtemps, plus ferme |
| Défaire un coude pincé | survoler le câble (ses coudes apparaissent en anneaux), puis **Espace** sur le coude |
| Passer le câble à l'autre main, qui le tient sur place | **E** pendant qu'on tire ; **E** main libre pour qu'elle le lâche |
| Débrancher | saisir un connecteur et tirer de quelques centimètres |
| Brancher | relâcher un connecteur devant un port libre (surligné en jaune) |
| Accrocher un connecteur en l'air | le relâcher devant la baie, loin d'un port : il y reste (lueur ambrée) ; Alt en lâchant : il pend |
| Sortir un bout libre du tas | cliquer la ligne du plan : il s'accroche sous son port |
| Tracer un câble | survoler le câble, **T** : il clignote et ses deux ports s'entourent |
| Jeter un câble au bac | survoler le câble, **Suppr** |
| Dériver une liaison en production | cliquer son ⚡ dans le plan |
| Attraper le câble du dessous | **Tab** |
| Annuler le dernier geste | **Ctrl+Z** (⌘Z) |
| Tourner la vue | clic droit + glisser, sans tenir de câble |
| Déplacer la vue | glisser dans le vide, ou flèches du clavier |
| Zoomer / revenir de face | molette / **R** |
| Poser l'outil, puis ouvrir le menu (pause) | **Échap** |
| Couper / remettre le son | **M** |
| Statistiques de la physique | **F3** |

Sous la baie, une bande rappelle les **touches du moment** : celles de l'outil en main et du
câble survolé (T pour tracer, Suppr pour le bac, Tab pour le suivant…), et pendant un geste, ce
qu'on peut faire en le tenant. L'aide complète d'un outil reste sur son bouton.

### Les outils

| Touche | Outil | Usage |
|---|---|---|
| 1 | Main | saisir, tirer, brancher, débrancher, pincer |
| C | Chemin | tracer le chemin d'un câble à travers les guides ; il y est posé, et branché au port où finit le trait |
| 2 | Supports | dans une unité vide, un guide-câbles ; dans un couloir latéral, une goulotte (**Maj** : un anneau) ; sur un support posé, le retirer |
| 3 | Velcro | tracer un trait en travers des câbles à serrer : le velcro serre ceux que le trait croise, s'ils sont côte à côte ; un clic sur un velcro l'enlève |
| 0 | Stock | prend un cordon neuf (type, couleur, longueur), livré dans le bac |

### Ranger un câble

L'outil **Chemin** sert à ranger. On appuie sur un câble et on trace un trait
par-dessus les guides qu'il doit traverser, dans l'ordre ; chaque guide retenu
s'encadre de vert. Si le trait se termine sur un port libre, le bout libre du
câble s'y branche. Au relâcher, le câble est posé le long du chemin : il passe
où passe le trait entre les guides, et entre dans chacun du côté d'où vient le
trait (par une extrémité du guide-câbles plutôt qu'entre ses doigts, par exemple).

- Il entre dans chaque élément par son ouverture : par l'avant du guide-câbles,
  au-dessus des pointes des doigts ; par la fente avant de la goulotte ; par le
  coin ouvert de l'anneau, qui forme un crochet.
- Un cordon trop court pour tout le trait en coupe les détours hors des guides ;
  il n'est refusé, avec la longueur qui manque, que s'il ne peut pas passer par
  les guides.
- La longueur en trop est rangée en boucle dans la goulotte, sinon repliée dans
  le guide-câbles ; ce qui ne tient pas pend. Un cordon plus court se prend au
  Stock.

Tout peut aussi se faire à la main, câble par câble. Après un geste, le câble
se colore un moment par portion : vert là où un support le tient, orange là où
il pend de plus de 20 cm, rouge là où il traîne au sol.

## Développement

Le projet est écrit en TypeScript, avec [three.js](https://threejs.org) pour le
rendu et Vite pour le serveur et la construction. Il n'y a pas de serveur : tout
tourne dans le navigateur.

| Dossier | Contenu |
|---|---|
| `src/app/` | quelle scène est à l'écran (un niveau ou l'écran titre), et comment passer de l'une à l'autre |
| `src/game/` | les règles et la physique de la baie, sans affichage : elles tournent aussi sous Node et dans un Worker |
| `src/play/` | une partie en cours : la boucle, les outils du joueur, les repères visuels |
| `src/showcase/` | l'écran titre, l'allée de baies avant / après |
| `src/render/` | le dessin three.js : baie, câbles, connecteurs, éclairage |
| `src/ui/` | l'interface HTML : plan de brassage, outils, tutoriel, écran de résultat, écran titre |
| `src/lib/` | des outils sans rapport avec le jeu (géométrie, tirages au sort), que tout le monde peut importer |
| `tests/` | tests unitaires (Vitest), rangés comme `src/` |
| `tools/` | bancs d'essai du moteur, des gestes et des niveaux, sans navigateur ([index](tools/README.md)) |
| `vendor/cable-kit/` | sous-module git, le dépôt [cable-kit](https://github.com/drschizzo/cable-kit) : le moteur de câbles et son Web Worker (`@drschizzo/avbd-cables`), les tubes construits par le GPU (`@drschizzo/three-cable-tubes`) |

Chaque dossier ne dépend que de ceux qui sont en dessous de lui (`lib` puis `game` en bas,
`app` en haut), et ESLint le vérifie à chaque `npm run lint`.

### Lire le code

Quatre documents, du plus général au plus détaillé :

- [`docs/architecture.md`](docs/architecture.md) : l'organisation du code, le
  sens des dépendances entre les dossiers, et où intervenir pour ajouter un
  niveau, un outil ou un critère de score ;
- [`docs/conventions.md`](docs/conventions.md) : les règles que le code suit
  (découpage, nommage, commentaires, tests, commits), avec un exemple tiré du
  projet pour chacune ;
- [`docs/mise-a-jour-three.md`](docs/mise-a-jour-three.md) : ce que le jeu prend
  à three.js au-delà de son API stable, et comment monter de version ;
- [`docs/anatomie-d-une-frame.md`](docs/anatomie-d-une-frame.md) : une frame
  suivie de bout en bout, avec schémas et captures (la boucle de jeu, le
  moteur physique des câbles, la préparation de la scène, le rendu).

Pour une première lecture, suivre le chemin d'un clic :

1. `src/main.ts` crée l'`App` (`src/app/app.ts`), qui lance un niveau en créant
   un `Controller` ;
2. `src/play/controller.ts` fait tourner la boucle (`tick`) et confie la souris
   à `src/play/inputRouter.ts` ;
3. le clic arrive à un outil, par exemple `src/play/tools/handTool.ts`, qui
   saisit le cordon et le branche avec `World.plug` (`src/game/world.ts`) ;
4. `src/game/evaluation.ts` note la baie, et le contrôleur prévient
   l'interface par un événement : `src/ui/hud.ts` le passe au panneau du plan
   (`src/ui/schedulePanel.ts`).

### Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | version de production dans `dist/` (publiée sur GitHub Pages à chaque push sur `main`) |
| `npm run check` | lint (dont le sens des dépendances), types et tests, à lancer avant de pousser |
| `npm run solvable` | vérifie que chaque niveau peut atteindre 3 étoiles avec son seul inventaire ; puis, depuis l'emmêlement de départ, combien de liaisons en production il faudra débrancher, ce que cela coûte face au budget d'interruption, et les cordons neufs qu'il faut |
| `npm run bench` | performance et stabilité du moteur physique |
| `npm run precision` | gestes délicats : entrer dans une goulotte, coucher un câble dans un guide-câbles… |
| `npm run levels` | coût et mise au repos de chaque niveau |
| `npm run free` | une partie libre de 48 câbles : mise au repos, puis un cordon tiré à travers les autres |
| `npm run pinch` | un coude pincé garde-t-il sa forme une fois lâché |
| `npm run route` | des câbles posés le long d'un chemin tracé : branchés, dans leurs guides, au repos, sans traverser la baie, et ce qu'ils déplacent des autres câbles |
| `npm run fold` | un câble couché dans un guide-câbles : le guide prend-il une boucle lointaine du même câble |
| `npm run showcase` | la démonstration avant / après sur quelques baies tirées au sort |

Ajouter `?sync` à l'URL fait tourner la physique sur le fil principal plutôt
que dans le Worker, ce qui rend les tests automatisés reproductibles.

### Le moteur physique

`vendor/cable-kit/packages/avbd-cables/src/cableSim.ts` s'inspire d'*Augmented Vertex Block Descent* (Giles,
Diaz, Yuksel, SIGGRAPH 2025). Chaque câble est une chaîne de nœuds ; le
solveur traite l'inextensibilité et les contacts (câble contre câble, câble
contre baie) comme des contraintes dures, et la flexion, le frottement, la
main, le velcro et les coudes pincés comme des énergies. Un coude pincé garde
sa forme par *shape matching* : ses nœuds sont tirés vers cette forme,
tournée et déplacée pour leur aller au mieux. Les câbles immobiles se mettent en
veille pour que les grosses baies restent fluides. Le moteur tourne dans un
Web Worker (`src/game/physics/sim.worker.ts`, piloté par `threadedSim.ts`, tous deux bâtis sur `threaded.ts` du moteur) : l'affichage
n'attend jamais la physique.

## Licence

[MIT](LICENSE).
