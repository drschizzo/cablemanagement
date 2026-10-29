// The puzzles: tiny cabinets, one idea each, to solve in few gestures. They
// are open in any order; three stars within the gestures challenge is the
// goal. Their words are in ui/levelTexts.ts.

import type { PuzzleLevel } from './levelDef';
import { BLANK, copperPanel, ethernetSwitch, fingerManager } from './equipment';

/** a panel, a free unit for a manager, a switch: the cabinet most puzzles play in */
const SMALL = [BLANK, copperPanel('A', 12), BLANK, ethernetSwitch('S', 12), BLANK, BLANK];
const TALL = [BLANK, copperPanel('A', 12), BLANK, BLANK, BLANK, BLANK, ethernetSwitch('S', 12), BLANK, BLANK];

/** what every puzzle shares: copper cords coloured by service, little slack, little mess */
const BASE = {
  kind: 'puzzle' as const,
  wrong: 0, loose: 0, slack: [0.15, 0.25] as [number, number], mess: 1,
  labels: false, services: 1, types: ['CU' as const], colorByService: true,
  inventory: {}, preinstalled: [fingerManager(2)],
};

export const PUZZLES: PuzzleLevel[] = [
  // one loose end: the Route tool lays it and plugs it in one go
  { ...BASE, id: 'p1', units: SMALL, cables: 1, loose: 1, seed: 101, moves: 1 },
  // two loose ends
  { ...BASE, id: 'p2', units: SMALL, cables: 2, loose: 2, seed: 102, moves: 2 },
  // two cords in each other's ports
  { ...BASE, id: 'p3', units: SMALL, cables: 2, wrong: 2, seed: 103, moves: 4 },
  // no manager yet: one to place, then the cords through it
  { ...BASE, id: 'p4', units: SMALL, cables: 2, loose: 1, seed: 104, moves: 3, preinstalled: [], inventory: { fingerManager: 1 } },
  // three cords and one velcro: a bundle in the manager
  { ...BASE, id: 'p5', units: SMALL, cables: 3, loose: 1, seed: 105, moves: 4, bundles: 1, inventory: { velcro: 1 } },
  // a long way down: ducts take the cords along the sides
  { ...BASE, id: 'p6', units: TALL, cables: 2, loose: 1, seed: 106, moves: 5, slack: [0.3, 0.45], preinstalled: [fingerManager(2), fingerManager(5)], inventory: { duct: 2 } },
  // in production on a thin budget: no time to dither over the wrong port
  { ...BASE, id: 'p7', units: SMALL, cables: 3, wrong: 1, seed: 107, moves: 5, services: 2, downtime: 15 },
  // unmarked cords: trace them first
  { ...BASE, id: 'p8', units: SMALL, cables: 3, wrong: 2, seed: 108, moves: 6, blind: true },
];
