// The work as it went, to play it again once the cabinet is signed off: not
// pictures of the screen but the state of the cabinet, a few times a second
// of play (every node of the cords, their plugs and labels, the velcros, the
// items, the LEDs). Played back (replayView.ts), the game's own views draw it
// again at the screen's rate and size, the cords gliding from one key to the
// next along a smooth curve.

import type { World } from '../game/world';
import type { LedState, RackView } from '../render/rackView';
import type { CableEnd, NodeIndex } from '../game/cables';
import type { CordType } from '../game/cordTypes';
import type { ItemKind } from '../game/supplies';

/** the cords as they were built: they change only with a new cord, or another length */
export interface CordLayout {
  readonly cables: readonly { type: CordType; color?: string; start: NodeIndex; count: number }[];
  readonly cableOf: Int32Array;
  readonly segOK: Uint8Array;
  readonly radius: Float64Array;
}

export interface ItemSlot {
  kind: ItemKind;
  unit: number;
  side: number;
  locked: boolean;
}

/** the cabinet at one moment of the work; what had not changed since the key before is shared with it */
export interface ReplayKey {
  /** s of play */
  t: number;
  /** every node (x, y, z), as the solver had them */
  x: Float32Array;
  layout: CordLayout;
  ends: readonly (readonly [Readonly<CableEnd>, Readonly<CableEnd>])[];
  /** the nodes each velcro closes round */
  straps: readonly (readonly NodeIndex[])[];
  /** the rack items; `version` tells the sets apart */
  items: { readonly version: number; readonly slots: readonly ItemSlot[] };
  leds: ReadonlyMap<string, LedState>;
}

/** of the replay's length, the share given to the time of play; the rest goes where things moved */
const TIME_SHARE = 0.3;

export class ReplayRecorder {
  private last: ReplayKey | null = null;
  private layoutVersion = -1;
  private itemsVersion = -1;
  private ledsVersion = -1;
  private strapsSig = '';

  constructor(private world: World, private rackView: RackView) {}

  /** the cabinet now, `t` s into the play */
  key(t: number): ReplayKey {
    const w = this.world, last = this.last;
    const layout = last && this.layoutVersion === w.cablesVersion ? last.layout : this.layout();
    this.layoutVersion = w.cablesVersion;
    const same = last?.layout === layout;
    const ends = same && w.cables.every((cb, c) => cb.ends.every((e, k) => e.port === last.ends[c][k].port && e.label === last.ends[c][k].label))
      ? last.ends
      : w.cables.map((cb) => [{ port: cb.ends[0].port, label: cb.ends[0].label }, { port: cb.ends[1].port, label: cb.ends[1].label }] as const);
    const sig = w.straps.map((s) => s.nodes.join(',')).join(';');
    const straps = last && sig === this.strapsSig ? last.straps : w.straps.map((s) => [...s.nodes]);
    this.strapsSig = sig;
    const items = last && this.itemsVersion === w.itemsVersion ? last.items
      : { version: w.itemsVersion, slots: w.rack.items.map((it) => ({ ...w.rack.slotOf(it), locked: it.locked })) };
    this.itemsVersion = w.itemsVersion;
    const leds = last && this.ledsVersion === this.rackView.ledsVersion ? last.leds : new Map(this.rackView.ledStates);
    this.ledsVersion = this.rackView.ledsVersion;
    this.last = { t, x: Float32Array.from(w.sim.x), layout, ends, straps, items, leds };
    return this.last;
  }

  private layout(): CordLayout {
    const sim = this.world.sim;
    return {
      cables: this.world.cables.map((cb) => ({ type: cb.type, color: cb.color, start: cb.start, count: cb.count })),
      cableOf: Int32Array.from(sim.cableOf),
      segOK: Uint8Array.from(sim.segOK),
      radius: Float64Array.from(sim.radius),
    };
  }
}

/**
 * Where each key falls in the replay (0..1, in order): partly by the time of
 * play, mostly by how far the cords moved, so that the replay lingers on the
 * work and hurries through the waits. A new set of cords counts as a move.
 */
export function keyTimes(keys: readonly ReplayKey[]): number[] {
  const n = keys.length;
  if (n < 2) return keys.map(() => 0);
  const moved = [0];
  for (let k = 1; k < n; k++) {
    const a = keys[k - 1], b = keys[k];
    let d = 0;
    if (a.layout !== b.layout) d = Infinity;
    else for (let i = 0; i < a.x.length; i += 3) d += Math.abs(b.x[i] - a.x[i]) + Math.abs(b.x[i + 1] - a.x[i + 1]) + Math.abs(b.x[i + 2] - a.x[i + 2]);
    moved.push(d);
  }
  // a new set of cords: as much as the most the cords moved between two keys
  const most = Math.max(0, ...moved.filter(Number.isFinite));
  for (let k = 1; k < n; k++) if (!Number.isFinite(moved[k])) moved[k] = most;
  const total = moved.reduce((s, d) => s + d, 0);
  const t0 = keys[0].t, span = keys[n - 1].t - t0;
  const out: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += moved[k];
    const byTime = span > 0 ? (keys[k].t - t0) / span : k / (n - 1);
    const byMove = total > 0 ? acc / total : byTime;
    out.push(TIME_SHARE * byTime + (1 - TIME_SHARE) * byMove);
  }
  return out;
}

/** the key at or just before `u` (0..1) in `times` (see keyTimes), and how far towards the next one (0..1) */
export function keyAt(times: readonly number[], u: number): { i: number; f: number } {
  const n = times.length;
  if (n < 2 || u <= times[0]) return { i: 0, f: 0 };
  if (u >= times[n - 1]) return { i: n - 1, f: 0 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  return { i: lo, f: span > 0 ? (u - times[lo]) / span : 0 };
}

/**
 * The nodes between key i and the next, `f` of the way: a Catmull-Rom curve
 * through the keys around (those of the same cords), so that the cords keep
 * their speed from one key to the next instead of turning sharp at each.
 * Keys i and i + 1 must have the same cords; `out` has their nodes.
 */
export function nodesBetween(keys: readonly ReplayKey[], i: number, f: number, out: Float64Array): void {
  const p1 = keys[i], p2 = keys[Math.min(keys.length - 1, i + 1)];
  const before = keys[i - 1], after = keys[i + 2];
  const p0 = before && before.layout === p1.layout ? before : p1;
  const p3 = after && after.layout === p2.layout ? after : p2;
  const a = p0.x, b = p1.x, c = p2.x, d = p3.x;
  const f2 = f * f, f3 = f2 * f;
  const wa = -0.5 * f3 + f2 - 0.5 * f, wb = 1.5 * f3 - 2.5 * f2 + 1, wc = -1.5 * f3 + 2 * f2 + 0.5 * f, wd = 0.5 * f3 - 0.5 * f2;
  for (let k = 0; k < out.length; k++) out[k] = wa * a[k] + wb * b[k] + wc * c[k] + wd * d[k];
}
