// What a level is made of: its rack, its cords and their starting mess, the
// player's stock, and the rules it plays by. Its words (title, brief, tips)
// are the interface's (ui/levelTexts.ts).

import type { Rack, UnitSpec } from '../rack';
import type { ItemKind, Stock } from '../supplies';
import type { Circuit } from '../schedule';
import type { CordType } from '../cordTypes';
import type { CableStart, StrapStart } from '../cables';
import type { IncidentSpec } from '../incidents';
import type { FindId } from '../finds';
import type { FreeSpec } from './freeLevel';

/** what every level has, whatever its kind */
interface LevelBase {
  id: string;
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
  types: CordType[];
  /** the supports and velcros the player is given */
  inventory: Partial<Stock>;
  preinstalled: { kind: ItemKind; unit: number; side: number }[];
  seed: number;
  /** bending stiffness of the cords (1 = default) */
  bend?: number;
  /** cord segment length and radius (m), when not the defaults */
  seg?: number;
  radius?: number;
  /** an open two-post rack (no cabinet walls) */
  open?: boolean;
  /** cords coloured by their service (copper patch cords) */
  colorByService?: boolean;
  /**
   * Maintenance window: the links working at the start are in production.
   * Every second one of them is cut costs the weight of its service; past
   * this budget, an incident is declared and three stars are out of reach.
   */
  downtime?: number;
  /** incidents while the work goes on (a colleague unplugs a link, a user calls): see incidents.ts */
  incidents?: IncidentSpec[];
  /** bypasses: a temporary path that keeps a production link running while it is recabled */
  bypass?: number;
  /** new cords in stock, by length (m): how many of each */
  cords?: [number, number][];
  /** one-to-one patching: each panel port to the same port of the switch right below */
  pairing?: boolean;
  /** links between equipment (switch uplinks, firewall, router, servers), on top of the panel cords */
  links?: { a: string; b: string; service?: number; type?: CordType }[];
  /** a hand-written patching schedule instead of a random one */
  schedule?: (rack: Rack) => Circuit[];
  /** where the cords lie at the start, when the level knows it already (a cabinet carried over: the career); otherwise drawn */
  starts?: CableStart[];
  /** the straps on at the start (a cabinet carried over) */
  straps?: StrapStart[];
  /** old unmarked cords: where one goes only shows once it is traced, or plugged as planned */
  blind?: boolean;
  /** old cords broken inside: plugged as planned, they carry nothing (the tester finds them) */
  faults?: number;
  /** an odd thing a technician before left in the cabinet, to pick up (finds.ts) */
  find?: FindId;
}

/** a level of the campaign, in order */
export interface CampaignLevel extends LevelBase {
  kind: 'campaign';
}

/** a ticket of the career: one visit to the client's cabinet, as the player left it */
export interface TicketLevel extends LevelBase {
  kind: 'ticket';
  /** its place in the career, from 0 */
  ticket: number;
}

/** the guided tutorial, over a small cabinet */
export interface TutorialLevel extends LevelBase {
  kind: 'tutorial';
}

/** free play: a cabinet the player set up (freeLevel.ts) */
export interface FreeLevel extends LevelBase {
  kind: 'free';
  /** what the player set: its code shares it */
  spec: FreeSpec;
}

/** a cabinet of the before/after aisle (the title screen) */
export interface ShowcaseLevel extends LevelBase {
  kind: 'showcase';
  /** where the starting mess may wander: half width, depth range in front of the rack, pull of the detours towards the floor (power) */
  messSpread: { x: number; z: [number, number]; fall?: number };
  /** absolute cord lengths of the mess (m), instead of tidy route + slack */
  messLength: [number, number];
}

/** a cabinet built by a bench of tools/, to measure one gesture */
export interface BenchLevel extends LevelBase {
  kind: 'bench';
}

export type LevelDef = CampaignLevel | TicketLevel | TutorialLevel | FreeLevel | ShowcaseLevel | BenchLevel;
