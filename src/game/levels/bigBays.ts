// The big cabinets, ready to play in free play: busy server rooms where every
// rule of the training and the career meets the others.

import type { BigBayLevel } from './levelDef';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch, fingerManager, opticalPanel, server } from './equipment';

/** the big cabinets, the lightest first */
export const BIG_BAYS: BigBayLevel[] = [
  {
    id: 'l6',
    kind: 'bigBay',
    find: 'screwdriver',
    // 1 A, 2 S, 3 mgr, 4 B, 5 T, 6 mgr, 8 firewall, 9 mgr, 10 router, 11 mgr, 12-13 servers
    units: [BLANK, copperPanel('A', 24), ethernetSwitch('S', 24), BLANK, copperPanel('B', 24), ethernetSwitch('T', 24), BLANK, BLANK, FIREWALL, BLANK, ROUTER, BLANK, server('X', 0.03), server('Y', 0.09), SERVER, UPS, BLANK],
    cables: 20, wrong: 3, loose: 2, slack: [0.3, 0.8], mess: 3,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'F8', b: 'R1' },
      { a: 'S23', b: 'X1', service: 4 }, { a: 'T23', b: 'Y1', service: 4 },
    ],
    pairing: true,
    downtime: 880, bypass: 2, cords: [[0.15, 21], [0.5, 1], [0.75, 1], [1, 3], [1.5, 1]],
    labels: true, services: 5, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 1, duct: 4, velcro: 8 },
    preinstalled: [fingerManager(3), fingerManager(6), fingerManager(9), fingerManager(11)],
    seed: 67,
  },
  {
    id: 'l7',
    kind: 'bigBay',
    find: 'badge',
    // 1 fibre, 2 mgr, 3 free (the fibres lying in the drawer's manager would hang in front of A's ports),
    // 4 A, 5 S, 6 mgr, 7 B, 8 T, 9 mgr, 10 C, 11 U, 12 mgr, 13 firewall, 14 mgr, 15 router
    units: [BLANK, opticalPanel('O', 12), BLANK, BLANK, copperPanel('A', 24), ethernetSwitch('S', 24), BLANK, copperPanel('B', 24), ethernetSwitch('T', 24), BLANK, copperPanel('C', 24), ethernetSwitch('U', 24), BLANK, FIREWALL, BLANK, ROUTER, BLANK, SERVER, SERVER, UPS, BLANK],
    cables: 24, wrong: 5, loose: 4, slack: [0.3, 0.8], mess: 4,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'U24', b: 'F3' },
      { a: 'S23', b: 'R1', service: 2 }, { a: 'T23', b: 'R2', service: 2 }, { a: 'F8', b: 'R8', service: 2 },
    ],
    pairing: true,
    downtime: 720, bypass: 3, cords: [[0.15, 19], [0.25, 1], [0.5, 1], [0.75, 1], [1, 5], [1.5, 4]],
    labels: true, services: 5, types: ['OS2', 'CU'], colorByService: true,
    inventory: { fingerManager: 2, duct: 8, velcro: 10 },
    preinstalled: [fingerManager(6), fingerManager(9), fingerManager(12), fingerManager(14)],
    seed: 79,
  },
  {
    id: 'l8',
    kind: 'bigBay',
    find: 'sandwich',
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
    inventory: { fingerManager: 2, duct: 6, velcro: 12 },
    preinstalled: [fingerManager(3), fingerManager(6), fingerManager(9), fingerManager(12)],
    seed: 97,
    blind: true,
  },
];
