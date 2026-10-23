# Baie de brassage

Un jeu de *cable management* en 3D, dans le navigateur. On se retrouve devant
une baie réseau en désordre : des câbles emmêlés, certains mal branchés,
d'autres qui pendent jusqu'au sol. Il faut rebrancher chaque liaison selon le
plan de brassage, puis ranger proprement les câbles, comme un technicien sur
un vrai chantier.

Les câbles sont simulés physiquement : ils ont un poids, frottent les uns sur
les autres, s'empilent et se coincent dans les guide-câbles.

## Lancer le jeu

Il faut Node.js 20 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

Le jeu s'ouvre sur http://localhost:5173. Au premier lancement, une
démonstration **avant / après** montre une baie en désordre qui se range toute
seule ; le **tutoriel** (dans le menu) explique ensuite chaque outil pas à pas.

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
   couleur de son service (Données, Voix, Vidéo…).

| Étoiles | Condition |
|---|---|
| ★ | toutes les liaisons du plan sont branchées |
| ★★ | et au moins 70 % des câbles rangés, 85 % de la façade dégagée |
| ★★★ | tout est rangé, dégagé et étiqueté |

### Fenêtre de maintenance

La baie est en production : les liaisons qui fonctionnent au départ (marquées
⚡ dans le plan) ne doivent pas être coupées toutes à la fois. Le compteur
**Coupures**, en haut de l'écran, indique combien on peut en couper en même
temps (1 à 4 selon le niveau). Au-delà, le jeu refuse de débrancher : on
recâble une liaison à la fois.

### Niveaux

| # | Niveau | Câbles |
|---|---|---|
| 1 | Premier brassage | 4 |
| 2 | Le mou | 6 |
| 3 | Erreurs de brassage | 8 |
| 4 | Étiquetage | 10 |
| 5 | Fibre et cuivre | 12 |
| 6 | Salle serveurs | 20 |
| 7 | Migration | 30 |
| 8 | Le plat de spaghettis | 40 |

La **partie libre** génère une baie au hasard, de 4 à 48 câbles.

## Commandes

| Action | Geste |
|---|---|
| Saisir et tirer un câble | clic gauche + glisser |
| Pousser vers le fond / ramener vers soi | **Maj** + souris vers le haut / le bas pendant qu'on tire (ou la molette) |
| Débrancher | saisir un connecteur |
| Brancher | relâcher un connecteur devant un port libre (surligné en jaune) |
| Attraper le câble du dessous | **Tab** |
| Tourner la vue | clic droit + glisser |
| Déplacer la vue | glisser dans le vide, ou flèches du clavier |
| Zoomer / revenir de face | molette / **R** |
| Statistiques de la physique | **F3** |

### Les outils

On les choisit dans la barre d'outils ou au clavier. Ils suivent l'ordre d'une
vraie remise en ordre de baie.

| Touche | Outil | Usage |
|---|---|---|
| 1 | Main | saisir, tirer, brancher, débrancher |
| 8 | Traceur | fait clignoter un câble et montre ses deux ports, pour l'identifier |
| 6 | Étiquette | marque un bout de câble à la couleur d'un service |
| 9 | Déposer | débranche un câble, l'enroule et le jette dans le bac au pied de la baie |
| 2 | Guide-câbles 1U | barre horizontale à doigts, entre deux équipements |
| 3 | Goulotte | conduit vertical sur le côté de la baie |
| 4 | Anneau | petit passe-câble |
| 7 | Longueur | remplace un câble par un cordon plus court ou plus long, sans le débrancher |
| 0 | Stock | prend un cordon neuf (type, couleur, longueur), livré dans le bac |
| 5 | Velcro | attache ensemble les câbles d'un faisceau |

Pour faire entrer un câble dans un guide-câbles ou une goulotte, on le tient à
la main et on le pousse dedans : il y reste une fois lâché.

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

### Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | version de production dans `dist/` |
| `npm run check` | lint, types et tests, à lancer avant de pousser |
| `npm run solvable` | vérifie que chaque niveau peut atteindre 3 étoiles |
| `npm run bench` | performance et stabilité du moteur physique |
| `npm run precision` | gestes délicats : entrer dans une goulotte, coucher un câble dans un guide-câbles… |
| `npm run levels` | coût et mise au repos de chaque niveau |
| `npm run showcase` | la démonstration avant / après sur quelques baies tirées au sort |

Ajouter `?sync` à l'URL fait tourner la physique sur le fil principal plutôt
que dans le Worker, ce qui rend les tests automatisés reproductibles.

### Le moteur physique

`src/physics/cableSim.ts` s'inspire d'*Augmented Vertex Block Descent* (Giles,
Diaz, Yuksel, SIGGRAPH 2025). Chaque câble est une chaîne de nœuds ; le
solveur traite l'inextensibilité et les contacts (câble contre câble, câble
contre baie) comme des contraintes dures, et la flexion, le frottement, la
main et le velcro comme des énergies. Les câbles immobiles se mettent en
veille pour que les grosses baies restent fluides. Le moteur tourne dans un
Web Worker (`sim.worker.ts`, piloté par `threadedSim.ts`) : l'affichage
n'attend jamais la physique.
