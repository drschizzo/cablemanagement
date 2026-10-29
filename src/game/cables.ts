// What a cord is in the game: a stretch of the solver's nodes, two ends that
// may be plugged, hooked in the air or loose, and the straps that close round
// several cords. The indices are plain numbers; their names say which is which.

import type { FibreType } from './cordTypes';
import type { V3 } from '../lib/vec3';

/** a cord: its place in World.cables */
export type CableIndex = number;
/** one of the two ends of a cord: 0 (at its first node) or 1 */
export type EndIndex = number;
/** a node of the solver: the nodes of every cord, in one array */
export type NodeIndex = number;
/** a line of the schedule: its place in World.circuits */
export type CircuitIndex = number;

/** one end of one cord: what a port holds when something is plugged into it */
export interface CordEnd {
  cable: CableIndex;
  end: EndIndex;
}

export interface CableEnd {
  /** the port it is plugged into, or null */
  port: string | null;
  /** the service on its label, or null */
  label: number | null;
  /** a free connector hooked where it was let go (connector node, the next one), or null */
  parked?: [V3, V3] | null;
}

export interface Cable {
  type: FibreType;
  /** its first node; it has `count` */
  start: NodeIndex;
  count: number;
  ends: [CableEnd, CableEnd];
  /** jacket colour, when it is not the fibre type's */
  color?: string;
}

/** a cord as World shows it: changed through World's methods only */
export type ReadonlyCable = Readonly<Omit<Cable, 'ends'>> & { readonly ends: readonly [Readonly<CableEnd>, Readonly<CableEnd>] };

/** where a cord lies at the start: its type, the port of each end, its nodes (x, y, z flat) */
export interface CableStart {
  type: FibreType;
  /** port of each end at the start (null = hanging loose) */
  ends: [string | null, string | null];
  points: number[];
}

export interface Strap {
  /** the solver's bundle that holds it */
  bundle: number;
  /** one node of each cord it closes round */
  nodes: NodeIndex[];
}
