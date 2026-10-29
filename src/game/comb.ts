// The cable comb: slid along a bundle, it lays the cords that went through
// its teeth side by side, in even lanes along the way it took, as a
// technician's comb does: each cord keeps its place in the order, the gaps
// close, the crossings come undone. While it moves, it holds the cords at its
// teeth; let go, each cord is laid in its lane along the whole stretch the
// comb went over, held there a moment, then let go gently (as a route is).

import type { World } from './world';
import type { CableIndex, NodeIndex } from './cables';
import { dot, minus, type V3 } from '../lib/vec3';

/** m: half the width of the comb, and how far either side of its line a cord counts as in its teeth */
export const COMB_REACH = 0.045;
const TEETH = 0.015;
/** distance between two lanes, × the diameter of a cord */
const LANE = 1.25;
/** nodes either side of the one in the teeth that the comb holds too, less and less firmly */
const SPAN = 3;
/** s the cords are held in their lanes once the comb is out, then s over which they are let go */
const HOLD = 0.6;
const FADE = 0.5;

/** the lane of each cord: `gap` apart, centred, in the order of `sides` (where each cord crossed the comb) */
export function laneOffsets(sides: ReadonlyMap<CableIndex, number>, gap: number): Map<CableIndex, number> {
  const order = [...sides.keys()].sort((p, q) => sides.get(p)! - sides.get(q)!);
  return new Map(order.map((c, k) => [c, (k - (order.length - 1) / 2) * gap]));
}

/** the point of a way (a polyline in the front plane) nearest `p`, and the way's direction there */
export function nearestOnWay(way: readonly V3[], p: V3): { at: V3; dir: V3 } {
  let best = { at: way[0], dir: [0, 1, 0] as V3 }, bestD = Infinity;
  for (let k = 0; k + 1 < way.length; k++) {
    const a = way[k], b = way[k + 1], ab = minus(b, a);
    const len2 = dot(ab, ab);
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, dot(minus(p, a), ab) / len2));
    const at: V3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    const n = Math.sqrt(len2);
    if (d < bestD) { bestD = d; best = { at, dir: [ab[0] / n, ab[1] / n, 0] }; }
  }
  return best;
}

/** a stroke of the comb, from the moment it goes into a bundle to the moment its cords are let go */
export class CombStroke {
  /** the way the comb took */
  private way: V3[] = [];
  /** the cords that went through its teeth: the stretch it went over, and where they crossed it */
  private passed = new Map<CableIndex, { first: NodeIndex; last: NodeIndex; side: number }>();
  /** the nodes held now, by cord */
  private held = new Map<CableIndex, { start: NodeIndex; count: number }>();
  /** once let go of: the cords laid in their lanes, and the time since */
  private laid: { cable: CableIndex; start: NodeIndex; pos: Float64Array }[] | null = null;
  private since = 0;

  constructor(private w: World) {}

  /**
   * The comb at `centre`, moving along `dir` (a unit vector in the front
   * plane): it holds the cords in its teeth, and lets go of those it has
   * left. Returns how many cords it holds.
   */
  move(centre: V3, dir: V3): number {
    this.way.push(centre);
    const across: V3 = [-dir[1], dir[0], 0];
    const toothed = this.toothed(centre, dir, across);
    for (const c of [...this.held.keys()]) if (!toothed.some((t) => t.cable === c)) this.letGo(c);
    for (const t of toothed) {
      const p = this.passed.get(t.cable);
      if (p) { p.first = Math.min(p.first, t.node); p.last = Math.max(p.last, t.node); }
      else this.passed.set(t.cable, { first: t.node, last: t.node, side: dot(minus(t.at, centre), across) });
      this.hold(t.cable, t.node);
    }
    return toothed.length;
  }

  /** how many cords went through its teeth */
  get combed(): number {
    return this.passed.size;
  }

  /** the comb comes out: each cord it went over is laid in its lane along its way */
  release(): void {
    for (const c of [...this.held.keys()]) this.letGo(c);
    const offsets = laneOffsets(new Map([...this.passed].map(([c, p]) => [c, p.side])), 2 * this.w.radius * LANE);
    const stretches = [...this.passed].map(([cable, p]) => ({ cable, start: p.first - SPAN, count: p.last - p.first + 2 * SPAN + 1 }));
    // one depth for the whole combed bundle: where it was on average
    let z = 0, n = 0;
    for (const s of stretches) for (let k = 0; k < s.count; k++) { z += this.w.nodePosition(s.start + k)[2]; n++; }
    z /= Math.max(1, n);
    this.laid = stretches.map(({ cable, start, count }) => {
      const pos = new Float64Array(3 * count);
      for (let k = 0; k < count; k++) {
        const p = this.w.nodePosition(start + k), { at, dir } = nearestOnWay(this.way, p);
        const off = offsets.get(cable)!;
        pos[3 * k] = at[0] - dir[1] * off; pos[3 * k + 1] = at[1] + dir[0] * off; pos[3 * k + 2] = z;
      }
      return { cable, start, pos };
    });
    this.since = 0;
    this.lay(1);
  }

  /** time passes once the comb is out: the cords held in their lanes, then let go; true once they all are */
  step(dt: number): boolean {
    if (!this.laid) return true;
    this.since += dt;
    const weight = Math.max(0, 1 - Math.max(0, this.since - HOLD) / FADE);
    this.lay(weight);
    if (weight > 0) return false;
    this.laid = null;
    return true;
  }

  /** whatever it holds, let go at once (the stroke is dropped) */
  end(): void {
    for (const c of [...this.held.keys()]) this.letGo(c);
    if (this.laid) this.lay(0);
    this.laid = null;
  }

  /** the laid stretches held in their lanes this firmly (0: let go) */
  private lay(weight: number): void {
    for (const l of this.laid ?? []) {
      // the ends of a stretch held less firmly: it joins the rest of its cord smoothly
      const count = l.pos.length / 3;
      const w = new Float64Array(count).map((_, k) => weight * Math.min(1, (Math.min(k, count - 1 - k) + 1) / (SPAN + 1)));
      this.w.sim.setGoals(l.start, l.pos, w);
    }
  }

  /** for each cord, its node nearest the comb's line, if it is in the teeth */
  private toothed(centre: V3, dir: V3, across: V3): { cable: CableIndex; node: NodeIndex; at: V3 }[] {
    const out: { cable: CableIndex; node: NodeIndex; at: V3 }[] = [];
    this.w.cables.forEach((cb, c) => {
      let best: { cable: CableIndex; node: NodeIndex; at: V3 } | null = null, bestD = Infinity;
      // the connectors and the stretch next to them are the ports': the comb leaves them be
      for (let k = 2 * SPAN; k < cb.count - 2 * SPAN; k++) {
        const at = this.w.nodePosition(cb.start + k), d = minus(at, centre);
        const off = Math.abs(dot(d, dir));
        if (off < TEETH && Math.abs(dot(d, across)) < COMB_REACH && Math.abs(d[2]) < COMB_REACH && off < bestD) {
          best = { cable: c, node: cb.start + k, at };
          bestD = off;
        }
      }
      if (best) out.push(best);
    });
    return out;
  }

  /** the node in the teeth held where it is, its neighbours less firmly */
  private hold(c: CableIndex, node: NodeIndex): void {
    const start = node - SPAN, count = 2 * SPAN + 1;
    const pos = new Float64Array(3 * count), weight = new Float64Array(count);
    for (let k = 0; k < count; k++) {
      const at = this.w.nodePosition(start + k);
      pos.set(at, 3 * k);
      weight[k] = 1 - Math.abs(k - SPAN) / (SPAN + 1);
    }
    const before = this.held.get(c);
    if (before && before.start !== start) this.letGo(c);
    this.w.sim.setGoals(start, pos, weight);
    this.held.set(c, { start, count });
  }

  private letGo(c: CableIndex): void {
    const held = this.held.get(c);
    if (!held) return;
    this.w.sim.setGoals(held.start, new Float64Array(3 * held.count), new Float64Array(held.count));
    this.held.delete(c);
  }
}
