import type { ItemKind, Rack, UnitSpec } from './rack';
import type { Circuit } from './tangle';

/** OS2 / OM4: optical fibre; CU: copper (RJ45) */
export type FibreType = 'OS2' | 'OM4' | 'CU';

export interface Service {
  name: string;
  color: string;
}

/** label colours: one per service of the patching schedule */
export const SERVICES: Service[] = [
  { name: 'Données', color: '#2f7cf6' },
  { name: 'Voix', color: '#2bb24c' },
  { name: 'Vidéo', color: '#f08a1c' },
  { name: 'Admin', color: '#e23d3d' },
  { name: 'Stockage', color: '#9b5de5' },
  { name: 'Invités', color: '#f2f2f2' },
];

export interface LevelDef {
  id: string;
  title: string;
  brief: string;
  units: UnitSpec[];
  cables: number;
  /** cable ends plugged into the wrong port at the start */
  wrong: number;
  /** cable ends hanging loose at the start */
  loose: number;
  /** extra length of each cord beyond a tidy route (m) */
  slack: [number, number];
  /** random detours of the starting mess */
  mess: number;
  labels: boolean;
  services: number;
  types: FibreType[];
  inventory: Partial<Record<ItemKind | 'velcro', number>>;
  preinstalled: { kind: ItemKind; unit: number; side: number }[];
  seed: number;
  tips?: string[];
  /**
   * Before/after demo: 'mess' cords are long and tangled, the managers set
   * aside; 'tidy' cords are cut to the length of their tidy route.
   */
  showcase?: 'mess' | 'tidy';
  /** bending stiffness of the cords (1 = default) */
  bend?: number;
  /** cord segment length and radius (m), when not the defaults */
  seg?: number;
  radius?: number;
  /** an open two-post rack (no cabinet walls) */
  open?: boolean;
  /** where the starting mess may wander: half width, depth range in front of the rack */
  messSpread?: { x: number; z: [number, number] };
  /** absolute cord lengths of the mess (m), instead of tidy route + slack */
  messLength?: [number, number];
  /** cords coloured by their service (copper patch cords) */
  colorByService?: boolean;
  /**
   * Maintenance window: the links working at the start are in production;
   * no more than this many of them may be cut at the same time.
   */
  maxCuts?: number;
  /** one-to-one patching: each panel port to the same port of the switch right below */
  pairing?: boolean;
  /** links between equipment (switch uplinks, firewall, router, servers), on top of the panel cords */
  links?: { a: string; b: string; service?: number }[];
  /** a hand-written patching schedule instead of a random one */
  schedule?: (rack: Rack) => Circuit[];
  /** guided tutorial */
  tutorial?: boolean;
}

const P = (name: string, ports: number): UnitSpec => ({ kind: 'panel', name, ports, label: `Tiroir optique ${name}` });
const S = (name: string, ports: number): UnitSpec => ({ kind: 'switch', name, ports, label: `Commutateur ${name}` });
const B: UnitSpec = { kind: 'blank' };

// a wiring closet's equipment
const CP = (name: string, ports: number): UnitSpec => ({ kind: 'panel', name, ports, style: 'copper', label: `Panneau de brassage ${name}` });
const SW = (name: string, ports: number): UnitSpec => ({ kind: 'switch', name, ports, style: 'switch', label: `Switch ${name}` });
const FW: UnitSpec = { kind: 'switch', name: 'F', ports: 8, style: 'firewall', label: 'Pare-feu' };
const RT: UnitSpec = { kind: 'switch', name: 'R', ports: 8, style: 'router', label: 'Routeur' };
const SV = (name: string, at: number): UnitSpec => ({ kind: 'server', name, portsAt: [at, at + 0.025], style: 'server', label: `Serveur ${name}` });
const SVd: UnitSpec = { kind: 'server', style: 'server', label: 'Serveur' };
const UPS: UnitSpec = { kind: 'server', style: 'ups', label: 'Onduleur' };
const M = (unit: number) => ({ kind: 'hmgr' as const, unit, side: 0 });

const LENGTH_TIP = 'Outil Longueur (7) : remplacez un cordon trop long par un cordon de la bonne longueur, sans le débrancher.';

export const LEVELS: LevelDef[] = [
  {
    id: 'l1',
    title: 'Premier brassage',
    brief: 'Quatre cordons pendent devant le switch. Couchez-les dans le guide-câbles pour dégager la façade.',
    // 0 B, 1 panel, 2 manager, 3 switch
    units: [B, CP('A', 12), B, SW('S', 12), B, B],
    cables: 4, wrong: 0, loose: 0, slack: [0.12, 0.2], mess: 1,
    maxCuts: 1,
    labels: false, services: 1, types: ['CU'], colorByService: true,
    inventory: { velcro: 2 },
    preinstalled: [M(2)],
    seed: 11,
    tips: [
      'Glissez un câble avec le clic gauche pour le déplacer. Maj en tirant : le pousser vers le fond ou le ramener vers vous.',
      'Amenez un câble dans le guide-câbles et glissez-le le long des doigts : il reste posé dessus.',
      'Clic droit + glisser pour tourner la vue, glisser dans le vide pour la déplacer, molette pour zoomer.',
    ],
  },
  {
    id: 'l2',
    title: 'Le mou',
    brief: 'Les cordons sont beaucoup trop longs. Remplacez-les par des cordons à la bonne longueur, ou rangez le surplus dans une goulotte.',
    // 1 panel, 2 manager, 6 manager (to place), 7 switch
    units: [B, CP('A', 12), B, B, B, B, B, SW('S', 12), B, B],
    cables: 6, wrong: 0, loose: 0, slack: [0.6, 1.0], mess: 2,
    maxCuts: 1,
    labels: false, services: 2, types: ['CU'], colorByService: true,
    inventory: { hmgr: 1, duct: 2, vring: 2, velcro: 3 },
    preinstalled: [M(2)],
    seed: 23,
    tips: [
      LENGTH_TIP,
      'Le guide-câbles se pose dans une unité vide ; la goulotte dans un couloir latéral.',
    ],
  },
  {
    id: 'l3',
    title: 'Erreurs de brassage',
    brief: 'Quelqu\'un a brassé à l\'aveugle et a relié le pare-feu au hasard. Suivez le plan : rebranchez chaque cordon sur le bon port, puis rangez.',
    // 1 panel, 2 mgr, 4 switch, 5 mgr, 6 firewall
    units: [B, CP('A', 12), B, B, SW('S', 24), B, FW, B, B],
    cables: 8, wrong: 2, loose: 1, slack: [0.25, 0.5], mess: 2,
    links: [{ a: 'S23', b: 'F1' }, { a: 'S24', b: 'F2' }],
    maxCuts: 2,
    labels: false, services: 2, types: ['CU'], colorByService: true,
    inventory: { hmgr: 1, duct: 2, vring: 3, velcro: 4 },
    preinstalled: [M(2), M(5)],
    seed: 37,
    tips: [
      'Saisissez un connecteur pour le débrancher, relâchez-le devant un port libre pour le brancher.',
      'Outil Traceur (8) : cliquez un câble, il clignote et ses deux ports s\'entourent.',
      'Survolez une ligne du plan pour voir ses deux ports.',
    ],
  },
  {
    id: 'l4',
    title: 'Étiquetage',
    brief: 'Pare-feu, routeur, switch : chaque liaison doit porter l\'étiquette de son service aux deux bouts.',
    // 1 panel, 2 mgr, 4 switch, 5 mgr, 6 firewall, 7 mgr, 8 router
    units: [B, CP('A', 12), B, B, SW('S', 24), B, FW, B, RT, B, B],
    cables: 10, wrong: 1, loose: 1, slack: [0.3, 0.6], mess: 2,
    links: [{ a: 'S23', b: 'F1' }, { a: 'S24', b: 'R1', service: 2 }, { a: 'F8', b: 'R8', service: 2 }],
    maxCuts: 2,
    labels: true, services: 3, types: ['CU'], colorByService: true,
    inventory: { hmgr: 1, duct: 2, vring: 3, velcro: 5 },
    preinstalled: [M(2), M(5), M(7)],
    seed: 41,
    tips: ['Outil Étiquette : choisissez une couleur, puis cliquez près d\'un connecteur.', LENGTH_TIP],
  },
  {
    id: 'l5',
    title: 'Fibre et cuivre',
    brief: 'Un tiroir optique, un panneau cuivre et deux serveurs. Ne mélangez pas les fibres et le cuivre : chaque cordon a son type.',
    // 1 fibre drawer, 2 mgr, 3 copper panel, 4 mgr, 7 switch, 8 mgr, 9 firewall, 10 mgr, 11-12 servers
    units: [B, P('A', 12), B, CP('B', 12), B, B, B, SW('S', 24), B, FW, B, SV('X', 0.03), SV('Y', 0.09), UPS, B],
    cables: 12, wrong: 2, loose: 2, slack: [0.3, 0.7], mess: 3,
    links: [{ a: 'S22', b: 'F1' }, { a: 'F7', b: 'X1', service: 4 }, { a: 'F8', b: 'Y1', service: 4 }],
    maxCuts: 2,
    labels: true, services: 3, types: ['OS2', 'CU'], colorByService: true,
    inventory: { hmgr: 2, duct: 4, vring: 4, velcro: 6 },
    preinstalled: [M(2), M(4), M(8), M(10)],
    seed: 53,
  },
  {
    id: 'l6',
    title: 'Salle serveurs',
    brief: 'Deux panneaux, deux switchs, le cœur de réseau et les serveurs : 25 liaisons. Déposez ce qui gêne dans le bac, puis rebrassez proprement.',
    // 1 A, 2 S, 3 mgr, 4 B, 5 T, 6 mgr, 8 firewall, 9 mgr, 10 router, 11 mgr, 12-13 servers
    units: [B, CP('A', 24), SW('S', 24), B, CP('B', 24), SW('T', 24), B, B, FW, B, RT, B, SV('X', 0.03), SV('Y', 0.09), SVd, UPS, B],
    cables: 20, wrong: 3, loose: 2, slack: [0.3, 0.8], mess: 3,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'F8', b: 'R1', service: 2 },
      { a: 'S23', b: 'X1', service: 4 }, { a: 'T23', b: 'Y1', service: 4 },
    ],
    pairing: true,
    maxCuts: 3,
    labels: true, services: 5, types: ['CU'], colorByService: true,
    inventory: { hmgr: 1, duct: 6, vring: 4, velcro: 8 },
    preinstalled: [M(3), M(6), M(9), M(11)],
    seed: 67,
    tips: ['Outil Déposer (9) : le câble est débranché et jeté dans le bac. Le Stock (0) fournit des cordons neufs.'],
  },
  {
    id: 'l7',
    title: 'Migration',
    brief: 'Trois panneaux et trois switchs, une fibre vers l\'opérateur, beaucoup de ports à corriger. Prenez votre temps.',
    // 1 fibre, 2 mgr, 3 A, 4 S, 5 mgr, 6 B, 7 T, 8 mgr, 9 C, 10 U, 11 mgr, 12 firewall, 13 mgr, 14 router
    units: [B, P('O', 12), B, CP('A', 24), SW('S', 24), B, CP('B', 24), SW('T', 24), B, CP('C', 24), SW('U', 24), B, FW, B, RT, B, SVd, SVd, UPS, B],
    cables: 30, wrong: 5, loose: 4, slack: [0.3, 0.8], mess: 4,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'U24', b: 'F3' },
      { a: 'S23', b: 'R1', service: 2 }, { a: 'T23', b: 'R2', service: 2 }, { a: 'F8', b: 'R8', service: 2 },
    ],
    pairing: true,
    maxCuts: 3,
    labels: true, services: 5, types: ['OS2', 'CU'], colorByService: true,
    inventory: { hmgr: 2, duct: 8, vring: 4, velcro: 10 },
    preinstalled: [M(5), M(8), M(11), M(13)],
    seed: 79,
  },
  {
    id: 'l8',
    title: 'Le plat de spaghettis',
    brief: 'Le local technique que personne n\'ose ouvrir : quatre panneaux, quatre switchs, le pare-feu, le routeur, les serveurs. 48 cordons. Bonne chance.',
    // 1 A, 2 S, 3 mgr, 4 B, 5 T, 6 mgr, 7 C, 8 U, 9 mgr, 10 D, 11 V, 12 mgr, 13 firewall, 14 mgr, 15 router, 16 mgr, 17-18 servers
    units: [B, CP('A', 24), SW('S', 24), B, CP('B', 24), SW('T', 24), B, CP('C', 24), SW('U', 24), B, CP('D', 24), SW('V', 24), B, FW, B, RT, B, SV('X', 0.03), SV('Y', 0.09), SVd, SVd, B, UPS, UPS],
    cables: 40, wrong: 8, loose: 6, slack: [0.4, 1.0], mess: 5,
    links: [
      { a: 'S24', b: 'F1' }, { a: 'T24', b: 'F2' }, { a: 'U24', b: 'F3' }, { a: 'V24', b: 'F4' },
      { a: 'F8', b: 'R1', service: 2 }, { a: 'R7', b: 'X1', service: 4 }, { a: 'R8', b: 'Y1', service: 4 }, { a: 'S23', b: 'X2', service: 4 },
    ],
    pairing: true,
    maxCuts: 4,
    labels: true, services: 6, types: ['CU'], colorByService: true,
    inventory: { hmgr: 2, duct: 10, vring: 6, velcro: 14 },
    preinstalled: [M(3), M(6), M(9), M(12)],
    seed: 97,
  },
];

/**
 * The before/after cabinet: an open rack, packed like a real wiring closet.
 * Four copper patch panels, each above its switch; a firewall, a router, two
 * linked servers, two more and a UPS. 100 cords: every panel port to the same
 * port of the switch right below, the switches' uplinks to the firewall and
 * the router, the servers' two NICs.
 * 'mess': the cords are long and tangled, nothing is managed.
 * 'tidy': short cords on their tidy routes, managers and ducts installed.
 */
export function showcaseRack(state: 'mess' | 'tidy'): LevelDef {
  const cu = (name: string): UnitSpec => ({ kind: 'panel', name, ports: 24, style: 'copper', label: `Panneau de brassage ${name}` });
  const sw = (name: string): UnitSpec => ({ kind: 'switch', name, ports: 24, style: 'switch', label: `Switch ${name}` });
  const units: UnitSpec[] = [
    B,
    cu('A'), sw('S'), B,
    cu('B'), sw('T'), B,
    cu('C'), sw('U'), B,
    cu('D'), sw('V'), B,
    { kind: 'switch', name: 'F', ports: 8, style: 'firewall', label: 'Pare-feu' }, B,
    { kind: 'switch', name: 'R', ports: 8, style: 'router', label: 'Routeur' }, B,
    { kind: 'server', name: 'X', portsAt: [0.025, 0.05], style: 'server', label: 'Serveur X' },
    { kind: 'server', name: 'Y', portsAt: [0.075, 0.1], style: 'server', label: 'Serveur Y' },
    { kind: 'server', style: 'server', label: 'Serveur' },
    { kind: 'server', style: 'server', label: 'Serveur' },
    B,
    { kind: 'server', style: 'ups', label: 'Onduleur' },
    { kind: 'server', style: 'ups', label: 'Onduleur' },
  ];
  const managers = [3, 6, 9, 12, 14, 16];
  const schedule = (): Circuit[] => {
    const out: Circuit[] = [];
    // colour codes of the panels: data, voice, data, guests
    const svc = [0, 1, 0, 5];
    ['A', 'B', 'C', 'D'].forEach((p, k) => {
      const swn = 'STUV'[k];
      for (let i = 1; i <= 22; i++) out.push({ a: `${p}${i}`, b: `${swn}${i}`, type: 'CU', service: i % 11 === 0 ? 3 : svc[k] });
    });
    'STUV'.split('').forEach((n, k) => {
      out.push({ a: `${n}23`, b: `F${k + 1}`, type: 'CU', service: 3 });
      out.push({ a: `${n}24`, b: `R${k + 1}`, type: 'CU', service: 2 });
    });
    ['X', 'Y'].forEach((n, k) => {
      out.push({ a: `F${5 + k}`, b: `${n}1`, type: 'CU', service: 4 });
      out.push({ a: `R${5 + k}`, b: `${n}2`, type: 'CU', service: 4 });
    });
    return out;
  };
  return {
    id: `showcase-${state}`,
    title: 'Avant / Après',
    brief: '',
    units, cables: 100, wrong: 0, loose: 0, slack: [0, 0], mess: 3,
    labels: true, services: 6, types: ['CU'],
    inventory: { velcro: 60 },
    preinstalled: [
      ...managers.map((unit) => ({ kind: 'hmgr' as const, unit, side: 0 })),
      ...[-1, 1].flatMap((side) => [3, 7, 11, 15].map((unit) => ({ kind: 'duct' as const, unit, side }))),
    ],
    seed: 777,
    showcase: state,
    // the old cords of the mess are limp, the new ones springy
    bend: state === 'mess' ? 1.5 : 0,
    open: true,
    seg: state === 'mess' ? 0.045 : 0.025,
    radius: 0.0028,
    messSpread: { x: 0.55, z: [0.02, 0.36] },
    messLength: [1.5, 3.2],
    colorByService: true,
    schedule,
  };
}

/** the guided tutorial: a small cabinet, one wrong port */
export const TUTORIAL: LevelDef = {
  id: 'tuto',
  title: 'Tutoriel',
  brief: '',
  units: [B, P('A', 12), B, B, B, B, B, S('S', 12), B, B],
  cables: 4, wrong: 1, loose: 0, slack: [0.25, 0.35], mess: 2,
  labels: true, services: 2, types: ['OS2'],
  inventory: { hmgr: 1, duct: 1, vring: 1, velcro: 2 },
  preinstalled: [{ kind: 'hmgr', unit: 2, side: 0 }],
  seed: 5,
  tutorial: true,
};

/** free play: a generated cabinet of any size */
export function freeLevel(cables: number, seed: number): LevelDef {
  const panels = Math.max(1, Math.ceil(cables / 24));
  const switches = Math.max(1, Math.ceil(cables / 24));
  const units: UnitSpec[] = [B];
  for (let i = 0; i < panels; i++) units.push(CP(String.fromCharCode(65 + i), 24), B);
  units.push(B, B, B, B);
  for (let i = 0; i < switches; i++) units.push(SW(String.fromCharCode(83 + i), 24), B, B);
  units.push(FW, B, RT, B, SVd, UPS);
  return {
    id: `free-${cables}-${seed}`,
    title: `Partie libre — ${cables} câbles`,
    brief: 'Une baie générée au hasard.',
    units, cables,
    wrong: Math.round(cables * 0.15), loose: Math.round(cables * 0.1),
    slack: [0.25, 0.6], mess: Math.min(5, 1 + Math.round(cables / 10)),
    labels: true, services: Math.min(6, 1 + Math.round(cables / 8)), types: ['CU'], colorByService: true,
    maxCuts: 3,
    inventory: { hmgr: panels + switches, duct: 6, vring: 6, velcro: Math.ceil(cables / 3) },
    preinstalled: [],
    seed,
  };
}
