// What a level is made of: its rack, its cords and their starting mess, the
// player's stock, and the rules it plays by.

import type { ItemKind, Rack, UnitSpec } from '../rack';
import type { Circuit } from '../mess/tangle';
import type { FibreType } from '../cordTypes';

/** stars a level needs before the next one opens: connected is not enough, it must be tidy */
export const UNLOCK_STARS = 2;

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
  /** where the starting mess may wander: half width, depth range in front of the rack, pull of the detours towards the floor (power) */
  messSpread?: { x: number; z: [number, number]; fall?: number };
  /** absolute cord lengths of the mess (m), instead of tidy route + slack */
  messLength?: [number, number];
  /** cords coloured by their service (copper patch cords) */
  colorByService?: boolean;
  /**
   * Maintenance window: the links working at the start are in production.
   * Every second one of them is cut costs the weight of its service; past
   * this budget, an incident is declared and three stars are out of reach.
   */
  downtime?: number;
  /** bypasses: a temporary path that keeps a production link running while it is recabled */
  bypass?: number;
  /** new cords in stock, by length (m): how many of each */
  cords?: [number, number][];
  /** one-to-one patching: each panel port to the same port of the switch right below */
  pairing?: boolean;
  /** links between equipment (switch uplinks, firewall, router, servers), on top of the panel cords */
  links?: { a: string; b: string; service?: number }[];
  /** a hand-written patching schedule instead of a random one */
  schedule?: (rack: Rack) => Circuit[];
  /** guided tutorial */
  tutorial?: boolean;
  /** three stars need this many velcro bundles: a strap round three cords or more, in a manager or a duct */
  bundles?: number;
  /** old unmarked cords: where one goes only shows once it is traced, or plugged as planned */
  blind?: boolean;
  /** the time challenge: three stars in less than this (s) */
  par?: number;
}
