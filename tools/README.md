# Bancs

Des scripts sans navigateur qui construisent un `World` (ou le solveur seul), jouent un geste ou une partie et
mesurent le résultat. Ils se lancent par `npm run <nom>` ; leurs réglages passent par l'environnement
(`tools/env.ts`) :

- `SEEDS=1,2,3` : les tirages à jouer (chaque banc a sa liste par défaut) ;
- `PARAMS='{"kCapCable":2}'` : des réglages du solveur posés sur ceux par défaut ;
- `ROWS=1` : une ligne par essai, en plus de la moyenne ; d'autres interrupteurs propres à chaque banc
  (`WHERE`, `TRACE`, `MODE`…) sont décrits en tête de son fichier.

La physique est chaotique : comparer un changement du solveur sur 20 à 40 tirages, pas sur un seul.

| Commande | Fichier | Ce qu'il mesure |
| --- | --- | --- |
| `npm run bench` | `bench.ts` | le solveur seul : temps par pas, contacts, pénétrations (`VARIANTS`, `NC`, `DEEP`) |
| `npm run precision` | `precision.ts` | les gestes qui agacent un joueur : pousser dans une goulotte, longer un guide-câbles, une baie au repos, le gros tas de la dernière grande baie |
| `npm run free` | `free.ts` | partie libre à beaucoup de cordons : temps pour se poser, agitation des autres pendant qu'on en traîne un (`NC`) |
| `npm run pinch` | `pinch.ts` | un coude pincé à la main garde-t-il sa forme une fois lâché ? |
| `npm run release` | `release.ts` | un cordon posé le long d'un guide-câbles puis lâché : de combien il rebondit |
| `npm run fold` | `fold.ts` | en posant un cordon dans un guide-câbles, une partie éloignée de la main y tombe-t-elle ? |
| `npm run route` | `route.ts` | l'outil Chemin (`game/routeLaying.ts`) : le cordon arrive-t-il, se branche-t-il, reste-t-il dans ses guides ? (`VIA`, `SLACK`) |
| `npm run plug` | `plug.ts` | brancher un cordon déjà rangé : combien de nœuds quittent leurs guides (`MODE`, `SLACK`) |
| `npm run plugin` | `plugin.ts` | brancher en longeant un guide-câbles comme le fait un joueur : le cordon glisse-t-il hors du canal ? |
| `npm run levels` | `levels.ts` | chaque niveau : construction, repos, temps et propreté de départ |
| `npm run solvable` | `solvable.ts` | une baie parfaite est-elle possible dans chaque niveau, avec son propre stock ? (`WHY`) |
| `npm run showcase` | `showcase.ts` | la vitrine avant / après sur quelques salles tirées au hasard (`[seeds] [pairs]` en arguments) |
| `npm run dressing` | `dressing.ts` | la chorégraphie avant / après de la vitrine : quelle part des cordons traverse les parois des guides en y entrant, puis en en sortant (`[seeds] [pairs] [why [show <tag>]]` en arguments) |
| `npm run bake` | `bake.ts` | précalcule le désordre de la première salle (`src/game/mess/showcase.bin`) |

Deux vérifications n'ont pas de commande et se lancent par `npx vite-node tools/<fichier>` :
`crate.ts` (jeter des cordons au bac, en prendre au stock) et `length.ts` (remettre un cordon à une autre longueur
avec `World.setCableLength`, dont se servent les tests).
