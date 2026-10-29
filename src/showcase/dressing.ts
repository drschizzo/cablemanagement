// The way a cord of the mess takes into its tidy route, and back: never
// through the walls of a guide. Before the guides come out of the rack, the
// cords hanging where they will stand step forward out of their way; each
// cord is then carried in front of the guides to its place, and pushed back
// into them by their opening (the front slit, for a duct), as a technician
// would slip it in.

import { CABLE_R, DUCT_FRONT, DUCT_SLIT_X, FINGER_R, MANAGER_TIP, SIDE_IN, insideBox, type Rack } from '../game/rack';
import type { ReadonlyCable } from '../game/cables';
import type { World } from '../game/world';
import { resample } from '../game/idealRoutes';
import type { V3 } from '../lib/vec3';

/** a shape of the cords on their way, reached when the flight is `at` (0..1) */
export interface Knot {
  x: Float64Array;
  at: number;
}

/** in front of every guide, where a cord is carried across the rack (m) */
const CLEAR_Z = 0.1;
/** how far round a guide a cord steps out of its way (m) */
const MARGIN = 0.012;
/** how much of the step a node passes on to the next one along the cord (m) */
const TAPER = 0.012;
/** just behind the front of a duct, where a cord has gone in by the slit (m) */
const PAST_SLIT = DUCT_FRONT - 0.014;

/** the guides of `rack`, by the room a cord takes inside each, and the slit of the ducts (|x|·side) */
/**
 * The guides of `rack`: where a cord is in the way of each (or in it), the slit
 * of a duct (x), and for a manager the bottom of its channel and the height
 * a cord laid in it goes in at, over the upturned tips of its bottom fingers (y).
 */
function zones(rack: Rack): { box: { min: number[]; max: number[] }; slit: number | null; channel: [number, number] | null }[] {
  const items = new Map(rack.items.map((it) => [it.id, it]));
  return rack.supports().map((s) => {
    const it = items.get(s.item)!;
    const bottom = rack.unitBottom(it.unit);
    return {
      box: { min: [s.min[0] - MARGIN, s.min[1] - MARGIN, -Infinity], max: [s.max[0] + MARGIN, s.max[1] + MARGIN, CLEAR_Z] },
      slit: it.kind === 'duct' ? it.side * DUCT_SLIT_X : null,
      channel: it.kind === 'fingerManager' ? [bottom + 0.004 + FINGER_R, bottom + 0.004 + MANAGER_TIP + FINGER_R + CABLE_R + 0.002] : null,
    };
  });
}

/** the guide a point stands in (undefined: in none) */
function zoneAt(z: ReturnType<typeof zones>, x: Float64Array, i: number) {
  return z.find((g) => insideBox(g.box as never, x[i], x[i + 1], x[i + 2]));
}

/**
 * The tidy routes `paths` (same schedule, shorter cords), sampled at the
 * nodes of the cords of `mess`: where they go to be swapped for the tidy ones.
 */
export function tidyShapes(mess: World, paths: V3[][]): Float64Array {
  const out = Float64Array.from(mess.sim.x);
  const rest = mess.sim.rest;
  mess.cables.forEach((cb, c) => {
    // the connector tips are in the same ports; the rest of the cord along the route between them
    const path = paths[c];
    const arcs = [0];
    for (let k = 1; k < cb.count - 2; k++) arcs.push(arcs[k - 1] + rest[cb.start + k]);
    resample(path.slice(1, path.length - 1), arcs, out, cb.start + 1);
  });
  return out;
}

/**
 * The mess `x` with the cords that hang where the guides of `rack` will
 * stand moved forward, clear of them (their tips stay in their ports).
 */
export function clearOfGuides(rack: Rack, cables: readonly ReadonlyCable[], x: Float64Array): Float64Array {
  const z = zones(rack);
  const out = Float64Array.from(x);
  for (const cb of cables) {
    const push = new Float64Array(cb.count);
    for (let k = 1; k < cb.count - 1; k++) {
      const i = 3 * (cb.start + k);
      if (zoneAt(z, x, i)) push[k] = CLEAR_Z - x[i + 2];
    }
    // tapered along the cord: no kink where it leaves a guide
    for (let k = 2; k < cb.count - 1; k++) push[k] = Math.max(push[k], push[k - 1] - TAPER);
    for (let k = cb.count - 3; k > 0; k--) push[k] = Math.max(push[k], push[k + 1] - TAPER);
    for (let k = 1; k < cb.count - 1; k++) out[3 * (cb.start + k) + 2] += push[k];
  }
  return out;
}

/**
 * From `from` (clear of the guides) to `to` (in them): each node bound for a
 * guide is carried in front of it, then pushed back in, by the slit of a
 * duct; the others go straight.
 */
export function dressingPath(rack: Rack, from: Float64Array, to: Float64Array): Knot[] {
  const z = zones(rack);
  const front = new Float64Array(to.length), inside = new Float64Array(to.length);
  for (let i = 0; i < to.length; i += 3) {
    const g = zoneAt(z, to, i);
    for (let d = 0; d < 3; d++) {
      // the free nodes on the straight line, at the same pace as the others
      front[i + d] = from[i + d] + (to[i + d] - from[i + d]) * 0.65;
      inside[i + d] = from[i + d] + (to[i + d] - from[i + d]) * 0.85;
    }
    if (!g) continue;
    const x = g.slit ?? to[i];
    // in a manager's channel: in over the tips, then down onto the fingers
    const y = g.channel && Math.abs(to[i]) < SIDE_IN - 0.02 && to[i + 1] > g.channel[0] && to[i + 1] < g.channel[1] ? g.channel[1] : to[i + 1];
    front[i] = x; front[i + 1] = y; front[i + 2] = Math.max(CLEAR_Z, to[i + 2]);
    inside[i] = x; inside[i + 1] = y; inside[i + 2] = g.slit === null ? to[i + 2] : Math.max(to[i + 2], PAST_SLIT);
  }
  return [{ x: from, at: 0 }, { x: front, at: 0.65 }, { x: inside, at: 0.85 }, { x: to, at: 1 }];
}

/** the same way, back */
export function reversed(path: Knot[]): Knot[] {
  return path.map((k) => ({ x: k.x, at: 1 - k.at })).reverse();
}

/** how a cord goes its way */
export interface Pace {
  /** share of the flight the motion takes to run along the cord */
  wave: number;
  /** when each point of the cord sets off (0..1), by its place along it (0..1) */
  lag: (s: number) => number;
  ease: (p: number) => number;
  /** the cord bows out towards the viewer on its way (m) */
  lift: number;
  /**
   * Where along the way the cord goes as one, every point at the pace of its
   * last one (from there to the end) or of its first one (from the start to
   * there): in and out of a guide, a point ahead of its neighbour would draw
   * the cord between them through its wall.
   */
  asOne?: { from: number } | { until: number };
}

/**
 * How far along the way (`e`, 0..1) each of the `count` points of a cord is
 * when the cord is `u` into its flight (0..1, and beyond while it comes to
 * rest), and how far it bows out (`bow`, m).
 */
export function paces(count: number, u: number, o: Pace, e: Float64Array, bow: Float64Array): void {
  let first = 0, last = 1;
  for (let k = 0; k < count; k++) {
    // each point of the cord has its own progress: the motion runs along it
    const p = Math.min(1, Math.max(0, (u - o.wave * o.lag(k / (count - 1))) / (1 - o.wave)));
    e[k] = o.ease(p);
    bow[k] = o.lift * Math.sin(Math.PI * p);
    first = Math.max(first, e[k]);
    last = Math.min(last, e[k]);
  }
  const one = o.asOne;
  if (!one) return;
  for (let k = 0; k < count; k++) {
    e[k] = 'from' in one ? Math.min(e[k], Math.max(one.from, last)) : Math.max(e[k], Math.min(one.until, first));
    // bowed out on the free part of the way only: not into a wall of the guide it goes in or out of
    const q = 'from' in one ? e[k] / one.from : (e[k] - one.until) / (1 - one.until);
    bow[k] = o.lift * Math.sin(Math.PI * Math.min(1, Math.max(0, q)));
  }
}

/** coordinate `i` of the cords when the flight is `e` along `path` */
export function along(path: Knot[], i: number, e: number): number {
  let j = 1;
  while (j < path.length - 1 && e > path[j].at) j++;
  const a = path[j - 1], b = path[j];
  const t = Math.min(1, Math.max(0, (e - a.at) / (b.at - a.at)));
  return a.x[i] + (b.x[i] - a.x[i]) * t;
}
