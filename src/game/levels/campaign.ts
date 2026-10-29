// The levels of the game, in order, and the guided tutorial.

import type { CampaignLevel, TutorialLevel } from './levelDef';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch, fingerManager, opticalPanel, opticalSwitch, server } from './equipment';

/** stars a level needs before the next one opens: connected is not enough, it must be tidy */
export const UNLOCK_STARS = 2;

export const LEVELS: CampaignLevel[] = [
  {
    id: 'l1',
    kind: 'campaign',
    // 0 B, 1 panel, 2 manager, 3 switch
    units: [BLANK, copperPanel('A', 12), BLANK, ethernetSwitch('S', 12), BLANK, BLANK],
    cables: 4, wrong: 0, loose: 1, slack: [0.12, 0.2], mess: 1,
    downtime: 40, cords: [[0.25, 2], [0.5, 3]],
    labels: false, services: 1, types: ['CU'], colorByService: true,
    inventory: { velcro: 2 },
    preinstalled: [fingerManager(2)],
    seed: 11,
    par: 120,
  },
  {
    id: 'l2',
    kind: 'campaign',
    // 1 panel, 2 manager, 6 manager (to place), 7 switch
    units: [BLANK, copperPanel('A', 12), BLANK, BLANK, BLANK, BLANK, BLANK, ethernetSwitch('S', 12), BLANK, BLANK],
    cables: 6, wrong: 1, loose: 0, slack: [0.6, 1.0], mess: 2,
    downtime: 60, cords: [[0.5, 7]],
    labels: false, services: 2, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 1, duct: 2, ring: 2, velcro: 3 },
    preinstalled: [fingerManager(2)],
    seed: 23,
    par: 240,
  },
  {
    id: 'l3',
    kind: 'campaign',
    // 1 panel, 2 mgr, 4 switch, 5 mgr, 6 firewall
    units: [BLANK, copperPanel('A', 12), BLANK, BLANK, ethernetSwitch('S', 24), BLANK, FIREWALL, BLANK, BLANK],
    cables: 8, wrong: 2, loose: 1, slack: [0.25, 0.5], mess: 2,
    links: [{ a: 'S23', b: 'F1' }, { a: 'S24', b: 'F2' }],
    downtime: 170, bypass: 1, cords: [[0.5, 2], [1, 4]],
    labels: false, services: 2, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 1, duct: 2, ring: 3, velcro: 4 },
    preinstalled: [fingerManager(2), fingerManager(5)],
    seed: 37,
    par: 300,
  },
  {
    id: 'l4',
    kind: 'campaign',
    // 1 panel, 2 mgr, 4 switch, 5 mgr, 6 firewall, 7 mgr, 8 router
    units: [BLANK, copperPanel('A', 12), BLANK, BLANK, ethernetSwitch('S', 24), BLANK, FIREWALL, BLANK, ROUTER, BLANK, BLANK],
    cables: 10, wrong: 1, loose: 1, slack: [0.3, 0.6], mess: 2,
    links: [{ a: 'S23', b: 'F1' }, { a: 'S24', b: 'R1', service: 2 }, { a: 'F8', b: 'R8', service: 2 }],
    downtime: 250, bypass: 1, cords: [[0.25, 1], [0.5, 1], [0.75, 3], [1, 7]],
    labels: true, services: 3, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 1, duct: 2, ring: 3, velcro: 5 },
    preinstalled: [fingerManager(2), fingerManager(5), fingerManager(7)],
    seed: 41,
    par: 420,
  },
  {
    id: 'l5',
    kind: 'campaign',
    // 1 fibre drawer, 2 mgr, 3 copper panel, 4 mgr, 7 switch, 8 mgr, 9 firewall, 10 mgr, 11-12 servers
    units: [BLANK, opticalPanel('A', 12), BLANK, copperPanel('B', 12), BLANK, BLANK, BLANK, ethernetSwitch('S', 24), BLANK, FIREWALL, BLANK, server('X', 0.03), server('Y', 0.09), UPS, BLANK],
    cables: 12, wrong: 2, loose: 2, slack: [0.3, 0.7], mess: 3,
    links: [{ a: 'S22', b: 'F1' }, { a: 'F7', b: 'X1', service: 4 }, { a: 'F8', b: 'Y1', service: 4 }],
    downtime: 150, bypass: 1, cords: [[0.25, 1], [0.5, 2], [0.75, 6], [1, 4], [1.5, 1]],
    labels: true, services: 3, types: ['OS2', 'CU'], colorByService: true,
    inventory: { fingerManager: 2, duct: 4, ring: 4, velcro: 6 },
    preinstalled: [fingerManager(2), fingerManager(4), fingerManager(8), fingerManager(10)],
    seed: 53,
    par: 540,
  },
  {
    id: 'l6',
    kind: 'campaign',
    // 1 A, 2 S, 3 mgr, 4 B, 5 T, 6 mgr, 8 firewall, 9 mgr, 10 router, 11 mgr, 12-13 servers
    units: [BLANK, copperPanel('A', 24), ethernetSwitch('S', 24), BLANK, copperPanel('B', 24), ethernetSwitch('T', 24), BLANK, BLANK, FIREWALL, BLANK, ROUTER, BLANK, server('X', 0.03), server('Y', 0.09), SERVER, UPS, BLANK],
    cables: 20, wrong: 3, loose: 2, slack: [0.3, 0.8], mess: 3,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'F8', b: 'R1', service: 2 },
      { a: 'S23', b: 'X1', service: 4 }, { a: 'T23', b: 'Y1', service: 4 },
    ],
    pairing: true,
    downtime: 880, bypass: 2, cords: [[0.15, 21], [0.5, 1], [0.75, 1], [1, 2], [1.5, 1]],
    labels: true, services: 5, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 1, duct: 4, ring: 2, velcro: 8 },
    preinstalled: [fingerManager(3), fingerManager(6), fingerManager(9), fingerManager(11)],
    seed: 67,
    bundles: 3,
    par: 900,
  },
  {
    id: 'l7',
    kind: 'campaign',
    // 1 fibre, 2 mgr, 3 free (the fibres lying in the drawer's manager would hang in front of A's ports),
    // 4 A, 5 S, 6 mgr, 7 B, 8 T, 9 mgr, 10 C, 11 U, 12 mgr, 13 firewall, 14 mgr, 15 router
    units: [BLANK, opticalPanel('O', 12), BLANK, BLANK, copperPanel('A', 24), ethernetSwitch('S', 24), BLANK, copperPanel('B', 24), ethernetSwitch('T', 24), BLANK, copperPanel('C', 24), ethernetSwitch('U', 24), BLANK, FIREWALL, BLANK, ROUTER, BLANK, SERVER, SERVER, UPS, BLANK],
    cables: 24, wrong: 5, loose: 4, slack: [0.3, 0.8], mess: 4,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'U24', b: 'F3' },
      { a: 'S23', b: 'R1', service: 2 }, { a: 'T23', b: 'R2', service: 2 }, { a: 'F8', b: 'R8', service: 2 },
    ],
    pairing: true,
    downtime: 720, bypass: 3, cords: [[0.15, 19], [0.25, 1], [0.5, 1], [1, 5], [1.5, 2]],
    labels: true, services: 5, types: ['OS2', 'CU'], colorByService: true,
    inventory: { fingerManager: 2, duct: 8, ring: 4, velcro: 10 },
    preinstalled: [fingerManager(6), fingerManager(9), fingerManager(12), fingerManager(14)],
    seed: 79,
    bundles: 3,
    par: 1200,
  },
  {
    id: 'l8',
    kind: 'campaign',
    // 1 A, 2 S, 3 mgr, 4 B, 5 T, 6 mgr, 7 C, 8 U, 9 mgr, 10 D, 11 V, 12 mgr, 13 firewall, 14 mgr, 15 router, 16 mgr, 17-18 servers
    units: [BLANK, copperPanel('A', 24), ethernetSwitch('S', 24), BLANK, copperPanel('B', 24), ethernetSwitch('T', 24), BLANK, copperPanel('C', 24), ethernetSwitch('U', 24), BLANK, copperPanel('D', 24), ethernetSwitch('V', 24), BLANK, FIREWALL, BLANK, ROUTER, BLANK, server('X', 0.03), server('Y', 0.09), SERVER, SERVER, BLANK, UPS, UPS],
    cables: 28, wrong: 8, loose: 6, slack: [0.4, 1.0], mess: 5,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'U24', b: 'F3' }, { a: 'V24', b: 'F4' },
      { a: 'F8', b: 'R1', service: 2 }, { a: 'R7', b: 'X1', service: 4 }, { a: 'R8', b: 'Y1', service: 4 }, { a: 'S23', b: 'X2', service: 4 },
    ],
    pairing: true,
    downtime: 660, bypass: 2, cords: [[0.15, 29], [0.25, 1], [0.5, 3], [0.75, 1], [1, 1], [1.5, 2]],
    labels: true, services: 6, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 2, duct: 6, ring: 4, velcro: 12 },
    preinstalled: [fingerManager(3), fingerManager(6), fingerManager(9), fingerManager(12)],
    seed: 97,
    bundles: 4,
    blind: true,
    par: 1500,
  },
];

/** the guided tutorial: a small cabinet, one wrong port */
export const TUTORIAL: TutorialLevel = {
  id: 'tuto',
  kind: 'tutorial',
  units: [BLANK, opticalPanel('A', 12), BLANK, BLANK, BLANK, BLANK, BLANK, opticalSwitch('S', 12), BLANK, BLANK],
  cables: 4, wrong: 1, loose: 0, slack: [0.25, 0.35], mess: 2,
  labels: true, services: 2, types: ['OS2'],
  inventory: { fingerManager: 1, duct: 1, ring: 1, velcro: 2 },
  preinstalled: [{ kind: 'fingerManager', unit: 2, side: 0 }],
  seed: 5,
};

/** the first level not yet tidy enough to open the next one (undefined: all are) */
export function nextLevelToPlay(stars: Record<string, number>): CampaignLevel | undefined {
  return LEVELS.find((l) => (stars[l.id] ?? 0) < UNLOCK_STARS);
}
