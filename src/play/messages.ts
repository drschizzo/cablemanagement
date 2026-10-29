// What a level has to tell the player, as data: the interface (ui/messages.ts)
// puts it into words. play/ never writes a sentence or a tag of HTML, so the
// wording can change without touching the game, and the game can be read
// without wading through French.

import type { CircuitIndex } from '../game/cables';
import type { FibreType } from '../game/cordTypes';
import type { Strain } from '../game/evaluation';
import type { RouteError } from '../game/routeLaying';
import type { ItemKind } from '../game/supplies';

/** a short message that comes and goes */
export type Toast =
  | { kind: 'bypassBack'; link: CircuitIndex }
  /** production links just cut; `costPerSecond` 0: their bypasses carry the traffic */
  | { kind: 'linksCut'; links: { link: CircuitIndex; service: number }[]; costPerSecond: number }
  | { kind: 'nothingToUndo' }
  | { kind: 'undoBlocked' }
  | { kind: 'undone' }
  | { kind: 'noCordOfThatLength' }
  | { kind: 'noBypassLeft' }
  | { kind: 'notInProduction' }
  | { kind: 'portsTaken' }
  | { kind: 'noLooseEnd' }
  | { kind: 'itemLocked' }
  | { kind: 'noSupportLeft'; item: ItemKind }
  | { kind: 'cannotPlace'; item: ItemKind }
  | { kind: 'routeRefused'; error: RouteError }
  /** a cord laid along a way much shorter than it (m too long) */
  | { kind: 'routeSlack'; extra: number }
  | { kind: 'connectorHeldBack' }
  | { kind: 'velcroClick' }
  | { kind: 'noVelcroLeft' }
  | { kind: 'velcroNeedsTwo' };

/** what the player is doing now, under the cabinet (null: back to the tool's help) */
export type Hint =
  | { kind: 'carry' }
  | { kind: 'pullToUnplug' }
  | { kind: 'plugConnector' }
  | { kind: 'depth'; on: boolean }
  | { kind: 'drawRoute' }
  /** `cords`: how many the velcro line would strap (fewer than two: none) */
  | { kind: 'velcroLine'; cords: number };

/** the cord under the pointer */
export interface CordInfo {
  type: FibreType;
  /** the ports of its ends (null: loose), or null when it is unmarked and not traced yet */
  ends: (string | null)[] | null;
  /** m */
  length: number;
  /** the line of the schedule it makes, or −1 */
  line: CircuitIndex;
  strain: Strain | null;
}

/** the debug line: what the physics costs */
export interface PhysicsStats {
  nodes: number;
  contacts: number;
  /** cords moving, of `cords` */
  awake: number;
  cords: number;
  physicsMs: number;
  inWorker: boolean;
  /** physics steps given up since the last report (the game ran in slow motion) */
  lostSteps: number;
}

/** a line the tooltip adds under the cord */
export type HoverNote =
  | { kind: 'connectorPlugged' }
  | { kind: 'connectorLoose' }
  | { kind: 'traceOrCrate' }
  | { kind: 'pinched' }
  | { kind: 'heldByOtherHand' }
  | { kind: 'stacked'; count: number }
  | { kind: 'cycling'; index: number; count: number };
