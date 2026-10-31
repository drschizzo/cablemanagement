// Free play: a cabinet the player sets up (its equipment from top to bottom,
// how many cords, how much mess, how many services) and plays at once. In
// production, it has a downtime budget, and from a certain size incidents and
// a cord broken inside; otherwise nothing presses and material is plentiful.
// It travels as a short code (in a link: ?rack=CODE), read back into the same
// cabinet.
//
// The code: the units, one letter each, then the cords, the mess, the
// services, production and the seed, apart with dots:
// "bpsbbfbrbxu.12.n.3.1.k3x9z". A power strip (d) powers the servers.

import type { FreeLevel } from './levelDef';
import type { UnitSpec } from '../rack';
import { SERVICES } from '../services';
import { drawIncidents } from '../incidents';
import { rng } from '../../lib/random';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch, opticalPanel, pdu, poweredServer, server } from './equipment';

/** the equipment a free cabinet is made of, one letter each in the code */
export const PALETTE = {
  b: 'blank', p: 'copperPanel', o: 'fibrePanel', s: 'switch', f: 'firewall', r: 'router', x: 'server', u: 'ups', d: 'pdu',
} as const;
export type PaletteLetter = keyof typeof PALETTE;
export type PaletteItem = (typeof PALETTE)[PaletteLetter];

export type Difficulty = 'easy' | 'normal' | 'hard';
const DIFFICULTY_RULES: Record<Difficulty, { letter: string; wrong: number; loose: number; mess: number; slack: [number, number] }> = {
  easy: { letter: 'e', wrong: 0.05, loose: 0.05, mess: 1, slack: [0.15, 0.35] },
  normal: { letter: 'n', wrong: 0.15, loose: 0.1, mess: 3, slack: [0.25, 0.6] },
  hard: { letter: 'h', wrong: 0.3, loose: 0.2, mess: 5, slack: [0.4, 1.0] },
};
/** the difficulties, the lightest first */
export const DIFFICULTIES = Object.keys(DIFFICULTY_RULES) as Difficulty[];

/** what the player sets */
export interface FreeSpec {
  units: PaletteItem[];
  cables: number;
  difficulty: Difficulty;
  /** services the links carry: the first ones of SERVICES (1..SERVICES.length) */
  services: number;
  /** the links working at the start are in production: a downtime budget, incidents and faults by size */
  production: boolean;
  seed: number;
}

/** units at most, cords at most */
export const MAX_UNITS = 30;
export const MAX_CORDS = 48;
/** ports of a patch panel and of a switch */
const PANEL_PORTS = 24;
const SWITCH_PORTS = 24;

/** why a spec makes no cabinet that can be played */
export type FreeError =
  | { kind: 'noPanel' }
  | { kind: 'noSwitch' }
  | { kind: 'tooManyUnits'; most: number }
  | { kind: 'tooManyCords'; most: number }
  | { kind: 'twice'; item: 'firewall' | 'router' | 'pdu' }
  | { kind: 'badCode' };

/** the most cords the units of a spec can patch: as many as the panel ports, and as the switch ports */
export function mostCords(units: readonly PaletteItem[]): number {
  const count = (item: PaletteItem) => units.filter((u) => u === item).length;
  return Math.min(MAX_CORDS, (count('copperPanel') + count('fibrePanel')) * PANEL_PORTS, count('switch') * SWITCH_PORTS);
}

/** the first thing that keeps a spec from making a cabinet, or null */
export function checkSpec(spec: FreeSpec): FreeError | null {
  if (!spec.units.some((u) => u === 'copperPanel' || u === 'fibrePanel')) return { kind: 'noPanel' };
  if (!spec.units.includes('switch')) return { kind: 'noSwitch' };
  if (spec.units.length > MAX_UNITS) return { kind: 'tooManyUnits', most: MAX_UNITS };
  for (const item of ['firewall', 'router', 'pdu'] as const) if (spec.units.filter((u) => u === item).length > 1) return { kind: 'twice', item };
  const most = mostCords(spec.units);
  if (spec.cables < 1 || spec.cables > most) return { kind: 'tooManyCords', most };
  return null;
}

/** a panel over its switch, the firewall, the router, a server and the UPS */
const BASIC_UNITS: PaletteItem[] = ['blank', 'copperPanel', 'blank', 'switch', 'blank', 'firewall', 'blank', 'router', 'server', 'ups'];

/** a plain cabinet of `cables` cords on three services, its panels and switches as many as it takes */
export function plainSpec(cables: number, seed: number, production: boolean): FreeSpec {
  return { units: fitUnits(BASIC_UNITS, cables), cables, difficulty: 'normal', services: 3, production, seed };
}

/** the servers that have their network cards patched, by name; more servers stand without */
const SERVER_NAMES = ['X', 'Y', 'Z', 'W'];

/** the units of a spec, named in order: panels A, B…, switches S, T…, servers X, Y… */
function unitsOf(items: readonly PaletteItem[]): UnitSpec[] {
  let panels = 0, switches = 0, servers = 0;
  return items.map((item) => {
    switch (item) {
      case 'blank': return BLANK;
      case 'copperPanel': return copperPanel(String.fromCharCode(65 + panels++), PANEL_PORTS);
      case 'fibrePanel': return opticalPanel(String.fromCharCode(65 + panels++), 12);
      case 'switch': return ethernetSwitch(String.fromCharCode(83 + switches++), SWITCH_PORTS);
      case 'firewall': return FIREWALL;
      case 'router': return ROUTER;
      // with a power strip in the cabinet, a server is powered from it
      case 'server': return servers < SERVER_NAMES.length ? (items.includes('pdu') ? poweredServer : server)(SERVER_NAMES[servers++], 0.03) : SERVER;
      case 'ups': return UPS;
      case 'pdu': return pdu();
    }
  });
}

/** from this many cords, a cabinet in production has incidents (a colleague, a call), and from that many, a cord broken inside */
export const INCIDENTS_FROM = 12;
export const FAULT_FROM = 16;
/** from this many cords, a cabinet in production hides the keys somebody lost; from that many, any cabinet the manual nobody read */
export const KEYS_FROM = 20;
export const MANUAL_FROM = 30;

/** the cabinet of a spec (check it first: checkSpec) */
export function freeLevel(spec: FreeSpec): FreeLevel {
  const d = DIFFICULTY_RULES[spec.difficulty];
  const n = spec.cables;
  const units = unitsOf(spec.units);
  const managers = Math.ceil(spec.units.length / 3);
  const base = {
    id: `free-${encodeSpec(spec)}`,
    kind: 'free' as const,
    spec,
    units,
    cables: n,
    links: powerLinks(units),
    wrong: Math.round(n * d.wrong), loose: Math.round(n * d.loose), slack: d.slack, mess: d.mess,
    labels: true, services: spec.services, types: spec.units.includes('fibrePanel') ? ['OS2' as const, 'CU' as const] : ['CU' as const], colorByService: true,
    preinstalled: [],
    seed: spec.seed,
  };
  if (!spec.production) {
    // nothing presses: cords of every length, supports to spare
    const each = Math.ceil(n / 3);
    return {
      ...base,
      find: n >= MANUAL_FROM ? 'manual' : undefined,
      cords: [[0.5, each], [0.75, each], [1, each], [1.5, each], [2, Math.ceil(n / 4.5)]],
      inventory: { fingerManager: managers + 2, duct: 8, velcro: Math.ceil(n * 0.55) },
    };
  }
  return {
    ...base,
    downtime: 40 + 15 * n, bypass: 2,
    // their own draws, apart from the cabinet's
    incidents: n >= INCIDENTS_FROM ? drawIncidents(2, rng(spec.seed ^ 0x51ed)) : undefined,
    faults: n >= FAULT_FROM ? 1 : 0,
    find: n >= MANUAL_FROM ? 'manual' : n >= KEYS_FROM ? 'keys' : undefined,
    cords: [[0.5, Math.ceil(n / 4)], [1, Math.ceil(n / 4)], [1.5, Math.ceil(n / 6)], [2, Math.ceil(n / 8)]],
    inventory: { fingerManager: managers, duct: 4, velcro: Math.ceil(n / 3) },
  };
}

/**
 * The units with room for `cables` cords: while the panels or the switches
 * have too few ports, another panel goes under the last panel, another switch
 * under the last switch (below the empty unit that follows it), each with an
 * empty unit under it for a manager.
 */
export function fitUnits(units: readonly PaletteItem[], cables: number): PaletteItem[] {
  const out = [...units];
  const count = (item: PaletteItem) => out.filter((u) => u === item).length;
  const addUnder = (items: PaletteItem[], item: PaletteItem) => {
    const last = Math.max(...items.map((i) => out.lastIndexOf(i)));
    // under the empty unit that follows the last one, if it has one: each keeps its manager's room
    const at = last < 0 ? out.length : out[last + 1] === 'blank' ? last + 2 : last + 1;
    out.splice(at, 0, item, 'blank');
  };
  while (out.length + 2 <= MAX_UNITS && (count('copperPanel') + count('fibrePanel')) * PANEL_PORTS < cables) addUnder(['copperPanel', 'fibrePanel'], 'copperPanel');
  while (out.length + 2 <= MAX_UNITS && count('switch') * SWITCH_PORTS < cables) addUnder(['switch'], 'switch');
  return out;
}

/** the power cords of a cabinet: from the outlets of its strip, the last first, to the inlets of each server */
function powerLinks(units: readonly UnitSpec[]): NonNullable<FreeLevel['links']> {
  const strip = units.find((u) => u.style === 'pdu');
  if (!strip) return [];
  const inlets = units.flatMap((u) => (u.inlets ?? []).map((_, k) => `${u.name}P${k + 1}`));
  return inlets.slice(0, strip.ports).map((inlet, k) => ({ a: `${strip.name}${strip.ports! - k}`, b: inlet, service: 4, type: 'PWR' as const }));
}

const LETTER_OF = Object.fromEntries(Object.entries(PALETTE).map(([letter, item]) => [item, letter])) as Record<PaletteItem, PaletteLetter>;

/** the code of a spec: the units as letters, then the rules, apart with dots */
export function encodeSpec(spec: FreeSpec): string {
  return [spec.units.map((u) => LETTER_OF[u]).join(''), spec.cables, DIFFICULTY_RULES[spec.difficulty].letter, spec.services, spec.production ? 1 : 0, spec.seed.toString(36)].join('.');
}

const isPaletteLetter = (l: string): l is PaletteLetter => Object.hasOwn(PALETTE, l);

/** the spec a code stands for, or what is wrong with it */
export function decodeSpec(code: string): FreeSpec | FreeError {
  const parts = code.trim().split('.');
  if (parts.length !== 6) return { kind: 'badCode' };
  const [letters, cables, difficulty, services, production, seed] = parts;
  const units = [...letters];
  const serviceCount = Number(services);
  if (!units.length || !units.every(isPaletteLetter) || !/^\d+$/.test(cables) || !/^\d$/.test(services) || serviceCount < 1 || serviceCount > SERVICES.length
    || !/^[01]$/.test(production) || !/^[0-9a-z]+$/.test(seed)) return { kind: 'badCode' };
  const level = DIFFICULTIES.find((k) => DIFFICULTY_RULES[k].letter === difficulty);
  if (!level) return { kind: 'badCode' };
  const spec: FreeSpec = {
    units: units.map((l) => PALETTE[l]),
    cables: Number(cables), difficulty: level, services: serviceCount, production: production === '1', seed: parseInt(seed, 36),
  };
  return checkSpec(spec) ?? spec;
}
