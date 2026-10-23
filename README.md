# Baie de brassage — jeu de cable management

Devant une baie réseau dont les jarretières optiques sont emmêlées, il faut
rebrancher chaque liaison selon le plan de brassage, puis ranger les câbles
avec des guide-câbles, des goulottes, des anneaux, du velcro et des
étiquettes de couleur. Huit niveaux (4 à 40 câbles) et une partie libre
générée (jusqu'à 48 câbles).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## Tutoriel et avant / après

Au premier lancement, la **vitrine avant / après** montre un local technique
comme on en voit partout sur internet : une baie ouverte bourrée
d'équipements (4 panneaux de brassage cuivre, chacun au-dessus de son switch,
un pare-feu, un routeur, des serveurs, un onduleur) et 100 cordons de couleur
qui débordent et s'effondrent jusqu'au sol. « Ranger la baie » installe
guide-câbles et goulottes, puis chaque long câble vole jusqu'à sa place en se
rétractant en cordon court, rangée après rangée : 100/100, 3 étoiles.

Les deux états sont deux mondes (`src/ui/showcase.ts`) qui partagent la baie et
le plan de brassage : le désordre (câbles longs, rien de rangé), calculé une
fois dans son Worker au chargement puis figé, et la baie rangée, dont les
cordons sont posés sur leur route idéale (`src/game/tidy.ts` : cordon court en
U entre un panneau et le switch juste en dessous ; sinon guide-câbles,
goulotte latérale avec une voie par câble, guide-câbles d'arrivée).

Le **tutoriel** (14 étapes, `src/ui/tutorial.ts`) présente le tiroir optique,
le commutateur, les jarretières, le guide-câbles, la goulotte, l'anneau, le
velcro, les étiquettes et le score ; les étapes à faire se valident seules
quand le geste est réussi, et un cadre lumineux montre l'élément décrit. Les
deux sont accessibles depuis le menu.

## Commandes

| Action | Geste |
|---|---|
| Saisir / tirer un câble | clic gauche + glisser |
| Pousser vers le fond / ramener vers soi | **Maj** maintenue en tirant : souris vers le haut / le bas (fil à plomb et cercle au sol pour juger la profondeur ; la molette marche aussi) |
| Débrancher | saisir un connecteur (prioritaire sur les câbles qui le recouvrent) |
| Câble suivant sous le curseur | **Tab** (pour attraper un câble enfoui dans un tas) |
| Brancher | relâcher un connecteur devant un port libre (surligné en jaune) |
| Tourner la vue | clic droit + glisser |
| Déplacer la vue | glisser dans le vide, flèches du clavier, Maj + clic droit, clic milieu |
| Zoom / vue de face | molette / **R** |
| Outils | **1** main, **2** guide-câbles 1U, **3** goulotte, **4** anneau, **5** velcro, **6** étiquette, **7** longueur, **8** traceur, **9** déposer, **0** stock |
| Statistiques physiques | **F3** |

### Les outils, comme sur un vrai chantier

Réorganiser une baie se fait dans cet ordre, et le jeu fournit un outil pour
chaque étape :

1. **Identifier** les câbles : le *Traceur* (lampe rouge pour la fibre,
   générateur de tonalité pour le cuivre) fait clignoter un câble et entoure
   ses deux ports.
2. **Étiqueter** avant de débrancher : l'*Étiquette*, à la couleur du service.
3. **Débrancher et déposer** : *Déposer* débranche les deux bouts, enroule le
   câble et le jette dans le **bac** au sol, à droite de la baie, d'où on peut
   le reprendre à la main.
4. **Installer le rangement** : guide-câbles 1U, goulottes, anneaux.
5. **Rebrasser à la bonne longueur** : *Longueur* remplace un cordon par un
   cordon du catalogue (15 cm à 5 m, ±5 cm) sans le débrancher ; le *Stock*
   fournit des cordons neufs (type, couleur, longueur) qui arrivent dans le bac.
   Un panneau juste au-dessus de son switch se brasse port à port, en cordons
   courts.
6. **Peigner, attacher, vérifier** : velcro, voyants des ports.

Les niveaux reprennent l'équipement d'un vrai local technique : panneaux de
brassage cuivre et tiroirs optiques, switchs, pare-feu, routeur, serveurs,
onduleur, avec les liaisons montantes et les liens serveurs du plan.
`tools/solvable.ts` vérifie que chaque niveau peut atteindre 3 étoiles.

### Fenêtre de maintenance

Une baie en production ne s'éteint pas pendant qu'on la range. Les liaisons
qui fonctionnent au départ (⚡ dans le plan) sont en production : au plus N
d'entre elles peuvent être coupées en même temps (de 1 au niveau 1 à 4 au
niveau 8, compteur « Coupures » en haut). Débrancher ou déposer un câble qui
dépasserait la limite est refusé, et les liaisons coupées sont entourées :
on recâble une liaison à la fois, comme en vrai.

Le score : connexions conformes au plan (obligatoire), câbles rangés (aucune
portion de plus de 20 cm qui pend hors d'un guide-câbles, d'une goulotte ou
d'un anneau), façade dégagée (aucun câble devant le port d'un autre), et
étiquettes de la couleur du service aux deux bouts quand le niveau l'exige.

## Moteur physique (`src/physics/cableSim.ts`)

Inspiré du moteur AVBD du projet *Loop Lab* (Giles, Diaz, Yuksel — *Augmented
Vertex Block Descent*, SIGGRAPH 2025), écrit pour des câbles sur CPU :

- un câble est une chaîne de nœuds ; chaque nœud résout son propre système
  3×3 (descente par blocs, Gauss-Seidel aller-retour) ;
- contraintes dures avec multiplicateur λ et raideur croissante :
  inextensibilité (stabilisée, λ ← αγλ) et contacts unilatéraux
  câble–câble (capsules segment–segment) et câble–baie (capsules, boîtes) ;
- énergies douces : flexion (différence seconde, plus raide sur les manchons
  des connecteurs), frottement de Coulomb, la main, le velcro ;
- contacts détectés une fois par image avec une marge spéculative qui croît
  avec la vitesse (pas de traversée), deux contacts pour les segments
  quasi parallèles (sinon un nœud sur deux n'est pas soutenu) ;
- passe de vitesses après chaque sous-pas (pas de rebond des contacts qui
  repoussent) et frottement de repos ;
- mise en veille par câble sur le déplacement réel (< 6 mm en 0,5 s), réveil
  au contact d'un câble qui bouge ;
- **frottement de Coulomb ancré** : chaque contact garde un point d'ancrage
  d'une image à l'autre et ne glisse qu'au-delà de μ·N (sans ancrage, un câble
  chargé glissait indéfiniment et les tas ne s'arrêtaient jamais) ;
- **passes d'inextensibilité** (projection des longueurs, 4 par sous-pas) après
  le solveur : un câble sous charge ne s'étire plus comme un élastique ;
- **laisse de la main** (6 cm) : la force de la main est plafonnée, un câble
  accroché n'est plus tendu puis relâché comme une fronde ;
- **sortie de pénétration douce** (1 mm par sous-pas au plus) ;
- les portes laissent passer **tout le câble tenu**, et un segment lâché à
  cheval sur un doigt continue de le traverser jusqu'à s'en dégager ;
- raideur en flexion réaliste : cordon cuivre ≈ 2× une jarretière fibre.

`tools/precision.ts` mesure les gestes qui frustrent (entrer dans une goulotte,
coucher dans un guide-câbles, repos d'un niveau, gros tas) : pics de vitesse,
allongement, temps de mise au repos.

La physique tourne dans un Web Worker (`src/physics/sim.worker.ts`, piloté par
`threadedSim.ts`) : la page lui envoie les modifications (broches, main,
éléments de baie, velcros) et lui demande des pas ; il renvoie les positions.
Le rendu n'attend jamais la physique. `?sync` dans l'URL la garde sur le fil
principal (tests automatisés déterministes).

Un rebord à l'avant du plancher de la baie retient les câbles tombés (la main
peut les faire passer par-dessus) ; ce qui passe devant tombe sur le sol de la
salle, visible et récupérable.

Les « portes » (doigts avant des guide-câbles, faces des goulottes, avant des
anneaux) laissent passer la portion de câble tenue par la main : on pousse un
câble dedans, il y reste une fois lâché.

`tools/bench.ts` et `tools/levels.ts` testent le moteur sans navigateur :

```bash
npx esbuild tools/levels.ts --bundle --platform=node --format=esm --outfile=/tmp/levels.mjs && node /tmp/levels.mjs
```

## Organisation

| Fichier | Rôle |
|---|---|
| `src/physics/` | moteur de câbles AVBD, géométrie |
| `src/game/rack.ts` | baie 19", ports, guide-câbles, goulottes, anneaux, géométrie de collision, zones de rangement |
| `src/game/levels.ts` | niveaux, services (couleurs d'étiquettes), partie libre |
| `src/game/tangle.ts` | plan de brassage, erreurs de départ, chemins emmêlés |
| `src/game/world.ts` | état de partie, branchement, velcro, évaluation |
| `src/game/controller.ts` | boucle, saisie, outils |
| `src/render/` | three.js : scène, baie, câbles (tubes lissés), connecteurs LC |
| `src/ui/` | interface (plan, outils, menus) |
