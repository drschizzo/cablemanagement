// The levels of the game, in order, and the guided tutorial.

import type { CampaignLevel, TutorialLevel } from './levelDef';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch, fingerManager, opticalPanel, opticalSwitch, server } from './equipment';

const LENGTH_TIP = 'Un cordon trop long se remplace par un cordon neuf du Stock (0), qui arrive dans le bac : il faut couper la liaison le temps de changer. Le stock est compté : choisissez bien qui reçoit quel cordon.';

/** stars a level needs before the next one opens: connected is not enough, it must be tidy */
export const UNLOCK_STARS = 2;

export const LEVELS: CampaignLevel[] = [
  {
    id: 'l1',
    kind: 'campaign',
    title: 'Premier brassage',
    brief: 'Quatre cordons pendent devant le switch, et l\'un d\'eux n\'est même plus branché. Rebranchez-le, puis couchez-les dans le guide-câbles pour dégager la façade.',
    // 0 B, 1 panel, 2 manager, 3 switch
    units: [BLANK, copperPanel('A', 12), BLANK, ethernetSwitch('S', 12), BLANK, BLANK],
    cables: 4, wrong: 0, loose: 1, slack: [0.12, 0.2], mess: 1,
    downtime: 40, cords: [[0.25, 2], [0.5, 3]],
    labels: false, services: 1, types: ['CU'], colorByService: true,
    inventory: { velcro: 2 },
    preinstalled: [fingerManager(2)],
    seed: 11,
    par: 120,
    tips: [
      'Glissez un câble avec le clic gauche pour le déplacer. Maj en tirant : le pousser vers le fond ou le ramener vers vous.',
      'Le bout qui pend : saisissez son connecteur et relâchez-le devant le port entouré du plan (survolez sa ligne).',
      'Outil Chemin (C) : partez d\'un câble et tracez son chemin par-dessus le guide-câbles, jusqu\'à un port libre si besoin : il y est posé, et branché.',
      'Clic droit + glisser pour tourner la vue, glisser dans le vide pour la déplacer, molette pour zoomer.',
    ],
  },
  {
    id: 'l2',
    kind: 'campaign',
    title: 'Le mou',
    brief: 'Les cordons sont beaucoup trop longs, et l\'un d\'eux est sur le mauvais port. Corrigez-le, puis remplacez les cordons par d\'autres à la bonne longueur, ou rangez le surplus dans une goulotte.',
    // 1 panel, 2 manager, 6 manager (to place), 7 switch
    units: [BLANK, copperPanel('A', 12), BLANK, BLANK, BLANK, BLANK, BLANK, ethernetSwitch('S', 12), BLANK, BLANK],
    cables: 6, wrong: 1, loose: 0, slack: [0.6, 1.0], mess: 2,
    downtime: 60, cords: [[0.5, 7]],
    labels: false, services: 2, types: ['CU'], colorByService: true,
    inventory: { fingerManager: 1, duct: 2, ring: 2, velcro: 3 },
    preinstalled: [fingerManager(2)],
    seed: 23,
    par: 240,
    tips: [
      LENGTH_TIP,
      'Le guide-câbles se pose dans une unité vide ; la goulotte dans un couloir latéral.',
    ],
  },
  {
    id: 'l3',
    kind: 'campaign',
    title: 'Erreurs de brassage',
    brief: 'Quelqu\'un a brassé à l\'aveugle et a relié le pare-feu au hasard. Suivez le plan : rebranchez chaque cordon sur le bon port, puis rangez.',
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
    tips: [
      'Saisissez un connecteur et tirez pour le débrancher, relâchez-le devant un port libre pour le brancher. Ctrl+Z annule le dernier geste.',
      'Traceur : survolez un câble et appuyez sur T, il clignote et ses deux ports s\'entourent.',
      'Survolez une ligne du plan pour voir ses deux ports.',
    ],
  },
  {
    id: 'l4',
    kind: 'campaign',
    title: 'Étiquetage',
    brief: 'Pare-feu, routeur, switch : chaque liaison doit porter l\'étiquette de son service aux deux bouts.',
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
    tips: ['Chaque liaison appartient à un service (sa couleur dans le plan). Un cordon branché comme prévu reçoit son étiquette tout seul. Couper la Voix ou l\'Admin coûte bien plus cher que les Données.', LENGTH_TIP],
  },
  {
    id: 'l5',
    kind: 'campaign',
    title: 'Fibre et cuivre',
    brief: 'Un tiroir optique, un panneau cuivre et deux serveurs. Ne mélangez pas les fibres et le cuivre : chaque cordon a son type.',
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
    title: 'Salle serveurs',
    brief: 'Deux panneaux, deux switchs, le cœur de réseau et les serveurs : 25 liaisons. Déposez ce qui gêne dans le bac, rebrassez proprement, et serrez les câbles en faisceaux.',
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
    tips: [
      'Suppr sur un câble : il est débranché et jeté dans le bac. Le Stock (0) fournit des cordons neufs, en nombre limité.',
      '<b>Faisceaux</b> : pour ★★★, au moins 3 velcros qui serrent chacun 3 câbles ou plus, dans un guide-câbles ou une goulotte.',
      'Seulement 4 goulottes : choisissez les couloirs où elles servent le plus.',
    ],
  },
  {
    id: 'l7',
    kind: 'campaign',
    title: 'Migration',
    brief: 'Trois panneaux et trois switchs, une fibre vers l\'opérateur, beaucoup de ports à corriger. La migration se fait en production, avec un budget d\'interruption serré.',
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
    tips: ['Budget serré : rangez d\'abord les liaisons en production sans les débrancher. Avant de couper une liaison chère (Admin, Voix), posez-lui une dérivation (cliquez son ⚡ dans le plan).'],
  },
  {
    id: 'l8',
    kind: 'campaign',
    title: 'Le plat de spaghettis',
    brief: 'Le local technique que personne n\'ose ouvrir : quatre panneaux, quatre switchs, le pare-feu, le routeur, les serveurs. Les vieux cordons ne portent aucune marque : tracez-les pour savoir où ils vont. Bonne chance.',
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
    tips: ['Cordons sans marque : survolés, ils ne disent pas où ils vont. Le Traceur (T sur un câble) le révèle, et un cordon branché comme prévu se reconnaît tout seul.'],
  },
];

/** the guided tutorial: a small cabinet, one wrong port */
export const TUTORIAL: TutorialLevel = {
  id: 'tuto',
  kind: 'tutorial',
  title: 'Tutoriel',
  brief: '',
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
