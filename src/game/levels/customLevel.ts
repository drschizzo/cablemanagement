// A cabinet composed by the player in the editor: its equipment from top to
// bottom, picked from a palette, and the rules of its game. It travels as a
// short code (in a link: ?rack=CODE), read back into the same cabinet.
//
// The code: the units, one letter each, then the cords, the difficulty, the
// services, the maintenance window and the seed, apart with dots:
// "bpsbbfbrbxu.12.n.3.1.k3x9z".

import type { CustomLevel } from './levelDef';
import type { UnitSpec } from '../rack';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch, opticalPanel, server } from './equipment';

/** what the editor offers, one letter each in the code */
export const PALETTE = {
  b: 'blank', p: 'copperPanel', o: 'fibrePanel', s: 'switch', f: 'firewall', r: 'router', x: 'server', u: 'ups',
} as const;
export type PaletteLetter = keyof typeof PALETTE;
export type PaletteItem = (typeof PALETTE)[PaletteLetter];

export type Difficulty = 'easy' | 'normal' | 'hard';
const DIFFICULTIES: Record<Difficulty, { letter: string; wrong: number; loose: number; mess: number; slack: [number, number] }> = {
  easy: { letter: 'e', wrong: 0.05, loose: 0.05, mess: 1, slack: [0.15, 0.35] },
  normal: { letter: 'n', wrong: 0.15, loose: 0.1, mess: 3, slack: [0.25, 0.6] },
  hard: { letter: 'h', wrong: 0.3, loose: 0.2, mess: 5, slack: [0.4, 1.0] },
};

/** what the editor sets */
export interface CustomSpec {
  units: PaletteItem[];
  cables: number;
  difficulty: Difficulty;
  /** services the links carry: the first ones of SERVICES (1..6) */
  services: number;
  /** a maintenance window: the links working at the start are in production */
  maintenance: boolean;
  seed: number;
}

/** units at most, cords at most */
export const MAX_UNITS = 30;
export const MAX_CORDS = 48;
/** ports of a patch panel and of a switch of the editor */
const PANEL_PORTS = 24;
const SWITCH_PORTS = 24;

/** why a spec makes no cabinet that can be played */
export type CustomError =
  | { kind: 'noPanel' }
  | { kind: 'noSwitch' }
  | { kind: 'tooManyUnits'; most: number }
  | { kind: 'tooManyCords'; most: number }
  | { kind: 'twice'; item: 'firewall' | 'router' }
  | { kind: 'badCode' };

/** the most cords the units of a spec can patch: as many as the panel ports, and as the switch ports */
export function mostCords(units: readonly PaletteItem[]): number {
  const count = (item: PaletteItem) => units.filter((u) => u === item).length;
  return Math.min(MAX_CORDS, (count('copperPanel') + count('fibrePanel')) * PANEL_PORTS, count('switch') * SWITCH_PORTS);
}

/** the first thing that keeps a spec from making a cabinet, or null */
export function checkSpec(spec: CustomSpec): CustomError | null {
  if (!spec.units.some((u) => u === 'copperPanel' || u === 'fibrePanel')) return { kind: 'noPanel' };
  if (!spec.units.includes('switch')) return { kind: 'noSwitch' };
  if (spec.units.length > MAX_UNITS) return { kind: 'tooManyUnits', most: MAX_UNITS };
  for (const item of ['firewall', 'router'] as const) if (spec.units.filter((u) => u === item).length > 1) return { kind: 'twice', item };
  const most = mostCords(spec.units);
  if (spec.cables < 1 || spec.cables > most) return { kind: 'tooManyCords', most };
  return null;
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
      case 'server': return servers < SERVER_NAMES.length ? server(SERVER_NAMES[servers++], 0.03) : SERVER;
      case 'ups': return UPS;
    }
  });
}

/** the cabinet of a spec (check it first: checkSpec) */
export function customLevel(spec: CustomSpec): CustomLevel {
  const d = DIFFICULTIES[spec.difficulty];
  const n = spec.cables;
  return {
    id: `custom-${encodeSpec(spec)}`,
    kind: 'custom',
    spec,
    units: unitsOf(spec.units),
    cables: n,
    wrong: Math.round(n * d.wrong), loose: Math.round(n * d.loose), slack: d.slack, mess: d.mess,
    labels: true, services: spec.services, types: spec.units.includes('fibrePanel') ? ['OS2', 'CU'] : ['CU'], colorByService: true,
    downtime: spec.maintenance ? 40 + 15 * n : undefined, bypass: spec.maintenance ? 2 : undefined,
    cords: [[0.5, Math.ceil(n / 4)], [1, Math.ceil(n / 4)], [1.5, Math.ceil(n / 6)], [2, Math.ceil(n / 8)]],
    inventory: { fingerManager: Math.ceil(spec.units.length / 3), duct: 4, ring: 4, velcro: Math.ceil(n / 3) },
    preinstalled: [],
    seed: spec.seed,
  };
}

const LETTER_OF = Object.fromEntries(Object.entries(PALETTE).map(([letter, item]) => [item, letter])) as Record<PaletteItem, PaletteLetter>;

/** the code of a spec: the units as letters, then the rules, apart with dots */
export function encodeSpec(spec: CustomSpec): string {
  return [spec.units.map((u) => LETTER_OF[u]).join(''), spec.cables, DIFFICULTIES[spec.difficulty].letter, spec.services, spec.maintenance ? 1 : 0, spec.seed.toString(36)].join('.');
}

/** the spec a code stands for, or what is wrong with it */
export function decodeSpec(code: string): CustomSpec | CustomError {
  const parts = code.trim().split('.');
  if (parts.length !== 6) return { kind: 'badCode' };
  const [letters, cables, difficulty, services, maintenance, seed] = parts;
  if (!/^[bposfrxu]+$/.test(letters) || !/^\d+$/.test(cables) || !/^[1-6]$/.test(services) || !/^[01]$/.test(maintenance) || !/^[0-9a-z]+$/.test(seed)) return { kind: 'badCode' };
  const level = (Object.keys(DIFFICULTIES) as Difficulty[]).find((k) => DIFFICULTIES[k].letter === difficulty);
  if (!level) return { kind: 'badCode' };
  const spec: CustomSpec = {
    units: [...letters].map((l) => PALETTE[l as PaletteLetter]),
    cables: Number(cables), difficulty: level, services: Number(services), maintenance: maintenance === '1', seed: parseInt(seed, 36),
  };
  return checkSpec(spec) ?? spec;
}
