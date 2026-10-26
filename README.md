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

Il faut Node.js 20 ou plus récent.

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
au premier niveau pas encore réussi.

## Le jeu

### Objectif

Chaque niveau fournit un **plan de brassage** : la liste des liaisons à établir
(tel port du panneau vers tel port du switch). Pour réussir, il faut :

1. brancher chaque liaison sur les bons ports, avec le bon type de câble
   (fibre ou cuivre) ;
2. ranger les câbles : aucune portion de plus de 20 cm ne doit pendre hors d'un
   guide-câbles, d'une goulotte ou d'un anneau ;
3. dégager la façade : aucun câble ne doit passer devant le port d'un autre ;
4. quand le niveau le demande, étiqueter les deux bouts de chaque câble à la
   couleur de son service (Données, Voix, Vidéo…) ;
5. quand le niveau le demande, serrer les câbles en faisceaux : des velcros qui
   tiennent chacun au moins trois câbles, dans un guide-câbles ou une goulotte.

| Étoiles | Condition |
|---|---|
| ★ | toutes les liaisons du plan sont branchées |
| ★★ | et au moins 70 % des câbles rangés, 85 % de la façade dégagée |
| ★★★ | tout est rangé, dégagé, étiqueté (et serré en faisceaux si demandé) |

Il faut **★★** pour ouvrir le niveau suivant : brancher ne suffit pas, il faut
ranger. La jauge **Propreté** résume les critères ; un câble qui devient propre
s'allume en vert avec une note, et l'écran de fin montre la baie avant et
après. Chaque niveau propose aussi un **défi chrono** (★★★ en moins
d'un temps donné).

### Fenêtre de maintenance

La baie est en production : les liaisons qui fonctionnent au départ (marquées
⚡ dans le plan) ne doivent pas être coupées toutes à la fois. Le compteur
**Coupures**, en haut de l'écran, indique combien on peut en couper en même
temps (1 à 4 selon le niveau). Au-delà, le jeu refuse de débrancher : on
recâble une liaison à la fois.

### Niveaux

| # | Niveau | Câbles · particularité |
|---|---|---|
| 1 | Premier brassage | 4 |
| 2 | Le mou | 6 |
| 3 | Erreurs de brassage | 8 |
| 4 | Étiquetage | 10 |
| 5 | Fibre et cuivre | 12 |
| 6 | Salle serveurs | 20 · faisceaux, goulottes comptées |
| 7 | Migration | 24 · une seule coupure à la fois |
| 8 | Le plat de spaghettis | 28 · cordons sans marque, à tracer |

La **partie libre** génère une baie au hasard, de 4 à 48 câbles.

## Commandes

| Action | Geste |
|---|---|
| Tracer le chemin d'un câble | outil **Chemin** (C) : partir du câble, passer par-dessus les guides dans l'ordre, finir sur un port libre |
| Saisir et tirer un câble | clic gauche + glisser |
| Pousser vers le fond / ramener vers soi | **Maj** + souris vers le haut / le bas pendant qu'on tire (ou la molette) |
| Pincer un coude, qui garde sa forme | maintenir **Espace** (ou le clic droit) pendant qu'on tient le câble : plus longtemps, plus ferme |
| Défaire un coude pincé | survoler le câble (ses coudes apparaissent en anneaux), puis **Espace** sur le coude |
| Passer le câble à l'autre main, qui le tient sur place | **E** pendant qu'on tire ; **E** main libre pour qu'elle le lâche |
| Débrancher | saisir un connecteur et tirer de quelques centimètres |
| Brancher | relâcher un connecteur devant un port libre (surligné en jaune) |
| Attraper le câble du dessous | **Tab** |
| Annuler le dernier geste | **Ctrl+Z** (⌘Z) |
| Tourner la vue | clic droit + glisser, sans tenir de câble |
| Déplacer la vue | glisser dans le vide, ou flèches du clavier |
| Zoomer / revenir de face | molette / **R** |
| Statistiques de la physique | **F3** |

### Les outils

On les choisit dans la barre d'outils ou au clavier.

| Touche | Outil | Usage |
|---|---|---|
| 1 | Main | saisir, tirer, brancher, débrancher |
| C | Chemin | tracer le chemin d'un câble à travers les guides ; il y est posé, et branché au port où finit le trait |
| 2 | Guide-câbles 1U | barre horizontale à doigts, entre deux équipements |
| 3 | Goulotte | conduit vertical sur le côté de la baie |
| 4 | Anneau | petit passe-câble |
| 5 | Velcro | attache ensemble les câbles d'un faisceau |
| 6 | Étiquette | en mode A (auto), étiquette les deux bouts d'un cordon bien branché à la couleur de son service ; sinon un bout à la couleur choisie |
| 7 | Longueur | remplace un câble par un cordon plus court ou plus long, sans le débrancher ; « Ajuster au rangement » propose la longueur de sa route rangée |
| 8 | Traceur | fait clignoter un câble et montre ses deux ports, pour l'identifier |
| 9 | Déposer | débranche un câble, l'enroule et le jette dans le bac au pied de la baie |
| 0 | Stock | prend un cordon neuf (type, couleur, longueur), livré dans le bac |

### Ranger un câble

L'outil **Chemin** sert à ranger. On appuie sur un câble et on trace un trait
par-dessus les guides qu'il doit traverser, dans l'ordre ; chaque guide retenu
s'encadre de vert. Si le trait se termine sur un port libre, le bout libre du
câble s'y branche. Au relâcher, le câble est posé le long du chemin.

- Il entre dans chaque élément par son ouverture : par l'avant du guide-câbles,
  au-dessus des pointes des doigts ; par la fente avant de la goulotte ; par le
  coin ouvert de l'anneau, qui forme un crochet.
- Un cordon trop court pour le chemin est refusé, avec la longueur qui manque.
- La longueur en trop est rangée en boucle dans la goulotte, sinon repliée dans
  le guide-câbles ; ce qui ne tient pas pend. L'outil Longueur fournit alors
  un cordon plus court.

Tout peut aussi se faire à la main, câble par câble. Après un geste, le câble
se colore un moment par portion : vert là où un support le tient, orange là où
il pend de plus de 20 cm, rouge là où il traîne au sol.

## Développement

Le projet est écrit en TypeScript, avec [three.js](https://threejs.org) pour le
rendu et Vite pour le serveur et la construction. Il n'y a pas de serveur : tout
tourne dans le navigateur.

| Dossier | Contenu |
|---|---|
| `src/physics/` | le moteur de câbles, qui tourne dans un Web Worker |
| `src/game/` | la baie, les niveaux, le plan de brassage, les règles et le score |
| `src/render/` | la scène three.js : baie, câbles, connecteurs |
| `src/ui/` | l'interface, le tutoriel, la démonstration avant / après |
| `tests/` | tests unitaires (Vitest) |
| `tools/` | bancs d'essai du moteur et des niveaux, sans navigateur |

[`docs/architecture.md`](docs/architecture.md) détaille l'organisation du code,
le sens des dépendances entre ces dossiers et où intervenir pour ajouter un
niveau, un outil ou un critère de score.

[`docs/anatomie-d-une-frame.md`](docs/anatomie-d-une-frame.md) suit une frame
de bout en bout, avec schémas et captures : la boucle de jeu, le moteur
physique des câbles, la préparation de la scène et le pipeline de rendu.

### Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | version de production dans `dist/` (publiée sur GitHub Pages à chaque push sur `main`) |
| `npm run check` | lint, types et tests, à lancer avant de pousser |
| `npm run solvable` | vérifie que chaque niveau peut atteindre 3 étoiles, avec son seul inventaire |
| `npm run bench` | performance et stabilité du moteur physique |
| `npm run precision` | gestes délicats : entrer dans une goulotte, coucher un câble dans un guide-câbles… |
| `npm run levels` | coût et mise au repos de chaque niveau |
| `npm run free` | une partie libre de 48 câbles : mise au repos, puis un cordon tiré à travers les autres |
| `npm run pinch` | un coude pincé garde-t-il sa forme une fois lâché |
| `npm run route` | des câbles posés le long d'un chemin tracé : branchés, dans leurs guides, au repos, sans rien traverser |
| `npm run fold` | un câble couché dans un guide-câbles : le guide prend-il une boucle lointaine du même câble |
| `npm run showcase` | la démonstration avant / après sur quelques baies tirées au sort |

Ajouter `?sync` à l'URL fait tourner la physique sur le fil principal plutôt
que dans le Worker, ce qui rend les tests automatisés reproductibles.

### Le moteur physique

`src/physics/cableSim.ts` s'inspire d'*Augmented Vertex Block Descent* (Giles,
Diaz, Yuksel, SIGGRAPH 2025). Chaque câble est une chaîne de nœuds ; le
solveur traite l'inextensibilité et les contacts (câble contre câble, câble
contre baie) comme des contraintes dures, et la flexion, le frottement, la
main, le velcro et les coudes pincés comme des énergies. Un coude pincé garde
sa forme par *shape matching* : ses nœuds sont tirés vers cette forme,
tournée et déplacée pour leur aller au mieux. Les câbles immobiles se mettent en
veille pour que les grosses baies restent fluides. Le moteur tourne dans un
Web Worker (`sim.worker.ts`, piloté par `threadedSim.ts`) : l'affichage
n'attend jamais la physique.

## Licence

[MIT](LICENSE).
