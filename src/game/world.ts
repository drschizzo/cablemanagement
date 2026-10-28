// The game state of one cabinet: the physics, the rack and its items, the
// cords with their ends and labels, the velcro straps, the inventory, and the
// evaluation of how tidy it all is.

import { CABLES, type CableInit, type Pinch } from '@drschizzo/avbd-cables';
import { ThreadedSim } from './threadedSim';
import { CABLE_R, CONNECTOR, Rack, SEG, insideBox, type Item, type ItemKind } from './rack';
import { SERVICES, type FibreType, type LevelDef } from './levels';
import { makeCables, makeSchedule, rng, type CableStart, type Circuit } from './tangle';
import { pathToNodes, polyLength, resample, tidyRoutes, type V3 } from './tidy';

export interface CableEnd {
  port: string | null;
  label: number | null;
  /** a free connector hooked where it was let go (connector node, the next one), or null */
  parked?: [V3, V3] | null;
}

export interface Cable {
  type: FibreType;
  start: number;
  count: number;
  ends: [CableEnd, CableEnd];
  /** jacket colour, when it is not the fibre type's */
  color?: string;
}

export interface Strap {
  bundle: number;
  nodes: number[];
}

export interface CircuitStatus {
  cable: number; // cable serving it (−1 none)
  connected: boolean;
  routed: boolean;
  clear: boolean;
  labelled: boolean;
  /** neither pulled taut nor kinked */
  relaxed: boolean;
}

/** how readable the cabinet is, beyond the stars: each part 0..1, the note 0..100 */
export interface Readability {
  note: number;
  parts: { name: string; value: number; tip: string }[];
}

export interface Evaluation {
  circuits: CircuitStatus[];
  connected: number;
  routed: number;
  clear: number;
  labelled: number;
  total: number;
  stars: number;
  /** per cable: tidy route, obstructs a port */
  cableRouted: boolean[];
  cableObstructs: boolean[];
  /** production links cut now; downtime spent so far and the budget (Infinity: none) */
  liveDown: number;
  downtime: number;
  budget: number;
  /** cords pulled taut ('tendu') or kinked ('plié'), per cable (null: neither) */
  cableStrain: (Strain | null)[];
  relaxed: number;
  readability: Readability;
  /** velcro bundles (three cords or more, in the management), and how many three stars need */
  bundles: number;
  bundlesNeeded: number;
}

export type Strain = 'tendu' | 'plié';

/**
 * A cord this much shorter than the tidy route between its ports is pulled
 * taut: it cuts the corners the managers and ducts make it turn. (The route
 * is the outermost lane's; the inner lanes are up to a fifth shorter. A cord
 * straight from one port to the one right under it is no taut cord.)
 */
const TAUT_SHORT = 0.7;
/** a fibre turning this much (rad) over two segments is kinked */
const KINK = 1.9;

/** how a node of a cord is held (World.holdMap) */
export const HOLD = { FREE: 0, HELD: 1, HANGING: 2, LOW: 3 } as const;

export interface Snapshot {
  version: number;
  x: Float64Array;
  pinches: Pinch[];
  ends: CableEnd[][];
}

export type Inventory = Record<ItemKind | 'velcro' | 'bypass', number>;

export class World {
  level: LevelDef;
  rack: Rack;
  sim: ThreadedSim;
  circuits: Circuit[];
  cables: Cable[] = [];
  straps: Strap[] = [];
  inventory: Inventory;
  /** bumps when the rack items change (the view rebuilds them) */
  itemsVersion = 0;
  /** before/after demo: the tidy route of each cord, the items to install */
  tidyPaths: V3[][] = [];
  setAside: { kind: ItemKind; unit: number; side: number }[] = [];

  /** cord segment length and radius of this cabinet */
  seg: number;
  radius: number;
  /** bending stiffness override (0: by cord type) */
  bend: number;

  /** patch cords are springy: copper about twice as stiff as a fibre jumper */
  /** a patch cord of this type through these nodes, for the solver */
  private cord(type: FibreType, points: number[]): CableInit {
    return { ...CABLES.patchCord.cable, points, radius: this.radius, bend: this.stiffness(type) };
  }

  stiffness(type: FibreType): number {
    return this.bend || (type === 'CU' ? 12 : 6);
  }

  /** where every cord was laid at the start (its tangle, or its tidy route) */
  readonly starts: CableStart[];

  /** `starts`: the tangle already drawn for this level (by another World, in a worker): not drawn again */
  constructor(level: LevelDef, starts?: CableStart[]) {
    this.level = level;
    this.seg = level.seg ?? SEG;
    this.radius = level.radius ?? CABLE_R;
    this.bend = level.bend ?? 0;
    this.rack = new Rack(level.units, { open: level.open });
    for (const p of level.preinstalled) this.rack.addItem(p.kind, p.unit, p.side, true);
    const r = rng(level.seed);
    this.circuits = level.schedule ? level.schedule(this.rack) : makeSchedule(level, this.rack, r);
    // before/after demo: tidy cords are cut to their route; the mess has no managers yet
    if (level.showcase === 'mess') {
      this.setAside = this.rack.items.map((it) => ({ kind: it.kind, unit: it.unit, side: it.side }));
      this.rack.items = [];
    }
    if (level.showcase === 'tidy') {
      // the cords are laid along their tidy routes, cut to length (no tangle to draw: it was half
      // the time it took to build, for nothing)
      this.tidyPaths = tidyRoutes(this.rack, this.circuits, this.radius, this.seg);
      this.starts = this.circuits.map((ci, c) => ({ type: ci.type, ends: [ci.a, ci.b] as [string, string], points: pathToNodes(this.tidyPaths[c], this.seg) }));
    } else this.starts = starts ?? makeCables(level, this.rack, this.circuits, r);
    // big cabinets trade a substep for frame rate (≈ 13 ms instead of 18 for 40 cords);
    // the solver settings were tuned at these substep counts (see `refSubsteps`)
    const big = level.cables >= 20;
    this.sim = new ThreadedSim(big ? { substeps: 2, refSubsteps: 2, iterations: 5 } : { substeps: 3, refSubsteps: 3, iterations: 6 });
    const at = this.sim.build(this.starts.map((s) => this.cord(s.type, s.points)));
    this.starts.forEach((s, c) => {
      this.cables.push({
        type: s.type,
        start: at[c],
        count: s.points.length / 3,
        ends: [{ port: null, label: null }, { port: null, label: null }],
        color: level.colorByService && s.type === 'CU' ? SERVICES[this.circuits[c].service].color : undefined,
      });
      for (const e of [0, 1] as const) {
        if (s.ends[e]) this.plug(c, e, s.ends[e]!);
      }
    });
    this.sim.setStatics(this.rack.statics());
    this.inventory = { hmgr: 0, duct: 0, vring: 0, velcro: 0, ...level.inventory, bypass: level.bypass ?? 0 };
    this.cordStock = new Map(level.cords ?? []);
    this.budget = level.downtime ?? Infinity;
    // what works at the start is in production
    this.circuits.forEach((_, i) => { if (this.circuitUp(i)) this.live.add(i); });
  }

  // ------------------------------------------------- maintenance window

  /** circuits that worked at the start: the service must keep running */
  live = new Set<number>();

  /** a circuit carries traffic: one cord of the right type joins its two ports */
  circuitUp(i: number): boolean {
    const ci = this.circuits[i];
    const pa = this.rack.port(ci.a).plug, pb = this.rack.port(ci.b).plug;
    return pa >= 0 && pb >= 0 && pa >> 1 === pb >> 1 && this.cables[pa >> 1].type === ci.type;
  }

  /** production links currently cut */
  liveDown(): number {
    let n = 0;
    for (const i of this.live) if (!this.circuitUp(i)) n++;
    return n;
  }

  /** downtime spent: every second a production link is cut costs its service's weight */
  downtime = 0;
  budget: number;
  /** production links on a bypass (the traffic takes a temporary path), and whether they were cut since */
  bypassed = new Map<number, { cut: boolean }>();

  /**
   * Time passes with production links cut: the downtime grows. A bypass
   * carries its link meanwhile, and comes back to the stock once the link is
   * restored. Returns the links whose bypass just came back.
   */
  tickDowntime(dt: number): number[] {
    const back: number[] = [];
    for (const i of this.live) {
      const up = this.circuitUp(i), by = this.bypassed.get(i);
      if (by) {
        if (!up) by.cut = true;
        else if (by.cut) {
          this.bypassed.delete(i);
          this.inventory.bypass++;
          back.push(i);
        }
      } else if (!up) this.downtime += dt * SERVICES[this.circuits[i].service].weight;
    }
    return back;
  }

  /** puts a bypass on a production link, or takes it off; false when there is none left or it is no production link */
  toggleBypass(i: number): boolean {
    if (this.bypassed.has(i)) {
      this.bypassed.delete(i);
      this.inventory.bypass++;
      return true;
    }
    if (!this.live.has(i) || this.inventory.bypass <= 0) return false;
    this.bypassed.set(i, { cut: !this.circuitUp(i) });
    this.inventory.bypass--;
    return true;
  }

  /** what a second of this link cut costs now (0: not in production, or on a bypass) */
  cutCost(i: number): number {
    return this.live.has(i) && !this.bypassed.has(i) ? SERVICES[this.circuits[i].service].weight : 0;
  }

  /** bumps when the cords are rebuilt (a cord swapped for another length) */
  cablesVersion = 0;

  /** length of a cord (m) */
  cableLength(c: number): number {
    const cb = this.cables[c];
    let L = 0;
    for (let k = 0; k < cb.count - 1; k++) L += this.sim.rest[cb.start + k];
    return L;
  }

  /** the shortest cord that still reaches from one end to the other */
  minCableLength(c: number): number {
    const q = this.cablePoints(c);
    const n = q.length;
    return dist3(q[0], q[1]) + dist3(q[1], q[n - 2]) + dist3(q[n - 2], q[n - 1]) + 0.02;
  }

  private cablePoints(c: number): V3[] {
    const cb = this.cables[c];
    const x = this.sim.x;
    const out: V3[] = [];
    for (let k = 0; k < cb.count; k++) { const i = 3 * (cb.start + k); out.push([x[i], x[i + 1], x[i + 2]]); }
    return out;
  }

  /**
   * Swaps a cord for one of another length, in place: same ends (still
   * plugged), same straps. Shorter, it takes a shape between its current one
   * and the straight line between its boots; longer, the extra hangs as a
   * belly. Returns false when the length cannot reach from one end to the other.
   */
  setCableLength(c: number, L: number): boolean {
    if (L < this.minCableLength(c)) return false;
    const q = this.cablePoints(c);
    const n = q.length;
    const a = q[1], b = q[n - 2];
    // straight route and belly direction, per node (by arc fraction between the boots)
    const cum = [0];
    for (let k = 2; k < n - 1; k++) cum.push(cum[cum.length - 1] + dist3(q[k], q[k - 1]));
    const tot = cum[cum.length - 1] || 1;
    const frac = (k: number) => (k <= 1 ? 0 : k >= n - 2 ? 1 : cum[k - 1] / tot);
    const shape = (t: number): V3[] => q.map((p, k) => {
      if (k <= 1 || k >= n - 2) return p;
      const f = frac(k);
      if (t <= 1) {
        const s: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        return [s[0] + (p[0] - s[0]) * t, s[1] + (p[1] - s[1]) * t, s[2] + (p[2] - s[2]) * t];
      }
      // the belly hangs down, and forward once it meets the floor
      const w = Math.sin(Math.PI * f) * (t - 1);
      const floor = this.rack.floorY + this.radius + 0.004;
      const y = p[1] - w;
      return y >= floor ? [p[0], y, p[2] + w * 0.25] : [p[0], floor, p[2] + w * 0.25 + (floor - y)];
    });
    let lo = 0, hi = 1;
    if (polyLength(shape(1)) < L) { hi = 2; while (polyLength(shape(hi)) < L && hi < 64) hi = 1 + (hi - 1) * 2; lo = 1; }
    for (let it = 0; it < 30; it++) {
      const m = (lo + hi) / 2;
      if (polyLength(shape(m)) < L) lo = m; else hi = m;
    }
    const fresh = pathToNodes(shape((lo + hi) / 2), this.seg);
    this.rebuild(new Map([[c, fresh]]));
    return true;
  }

  /**
   * The length a cord needs to run tidily between the two ports it is plugged
   * into, through the managers and ducts of the cabinet as it is now, rounded
   * up to 5 cm with a little play (null: it is not plugged at both ends).
   */
  tidyLength(c: number): number | null {
    const L = this.routeLength(c);
    return L === null ? null : Math.ceil((L + 0.03) / 0.05) * 0.05;
  }

  /** length of the tidy route between the two ports a cord is plugged into (null: not plugged at both ends) */
  routeLength(c: number): number | null {
    const [pa, pb] = this.cables[c].ends.map((e) => e.port);
    if (!pa || !pb) return null;
    // the route starts from the upper port
    const [a, b] = this.rack.port(pa).unit <= this.rack.port(pb).unit ? [pa, pb] : [pb, pa];
    return polyLength(tidyRoutes(this.rack, [{ a, b, type: this.cables[c].type, service: 0 }], this.radius, this.seg)[0]);
  }

  /**
   * A cord plugged at both ends pulled taut (much shorter than its tidy
   * route), or a fibre kinked away from
   * its connectors; null when neither.
   */
  strain(c: number): Strain | null {
    const cb = this.cables[c];
    if (!cb.ends[0].port || !cb.ends[1].port) return null;
    if (this.cableLength(c) < TAUT_SHORT * this.routeLength(c)!) return 'tendu';
    const x = this.sim.x;
    if (cb.type === 'CU') return null;
    // away from the boots (where the cord turns sharply on purpose), over two segments either side
    const near = Math.ceil(0.15 / this.seg);
    for (let k = near; k < cb.count - near; k++) {
      const i = cb.start + k;
      const ux = x[3 * i] - x[3 * i - 6], uy = x[3 * i + 1] - x[3 * i - 5], uz = x[3 * i + 2] - x[3 * i - 4];
      const vx = x[3 * i + 6] - x[3 * i], vy = x[3 * i + 7] - x[3 * i + 1], vz = x[3 * i + 8] - x[3 * i + 2];
      const cos = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) || 1);
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > KINK) return 'plié';
    }
    return null;
  }

  // ------------------------------------------------------- undo

  /** what an undo puts back: every node, every plug, every label (null when the cords were rebuilt since) */
  snapshot(): Snapshot {
    return {
      version: this.cablesVersion,
      x: Float64Array.from(this.sim.x),
      pinches: this.sim.pinches.map((p) => ({ ...p, rest: [...p.rest], q: [...p.q] })),
      ends: this.cables.map((cb) => cb.ends.map((e) => ({ ...e }))),
    };
  }

  /** puts a snapshot back; false when the cords have been rebuilt since (another length, a new cord) */
  restore(s: Snapshot): boolean {
    if (s.version !== this.cablesVersion || s.ends.length !== this.cables.length) return false;
    this.cables.forEach((cb, c) => cb.ends.forEach((e, k) => {
      if (e.port !== s.ends[c][k].port) this.unplug(c, k);
      this.unpark(c, k);
    }));
    this.sim.teleport(s.x);
    this.sim.loadPinches(s.pinches);
    this.cables.forEach((cb, c) => cb.ends.forEach((e, k) => {
      const want = s.ends[c][k];
      if (want.port && e.port !== want.port) this.plug(c, k, want.port);
      else if (!want.port && want.parked) this.park(c, k, want.parked);
      e.label = want.label;
    }));
    return true;
  }

  // ------------------------------------------------------- crate, stock

  private thrown = 0;

  /** a coil of cord (as it comes out of its bag), at a random spot of the crate */
  private coil(rests: number[]): number[] {
    const c = this.rack.crate();
    const R = 0.055 + Math.random() * 0.02;
    const cx = c.min[0] + R + 0.02 + Math.random() * (c.max[0] - c.min[0] - 2 * R - 0.04);
    const cz = c.min[2] + R + 0.02 + Math.random() * (c.max[2] - c.min[2] - 2 * R - 0.04);
    // drop it from a little higher each time: the coils pile up into a heap
    const y0 = c.min[1] + 0.03 + (this.thrown++ % 8) * 0.012;
    const tilt = (Math.random() - 0.5) * 0.4;
    const out: number[] = [];
    let s = 0;
    for (let k = 0; k <= rests.length; k++) {
      const a = s / R;
      out.push(cx + Math.cos(a) * R, y0 + (a / (2 * Math.PI)) * this.radius * 2.6 + Math.sin(a) * R * tilt, cz + Math.sin(a) * R);
      if (k < rests.length) s += rests[k];
    }
    return out;
  }

  /** unplugs a cord, coils it and throws it in the crate (its straps come off) */
  depositCable(c: number): void {
    for (const e of [0, 1]) { this.unplug(c, e); this.unpark(c, e); }
    const cb = this.cables[c];
    for (const st of [...this.straps]) if (st.nodes.some((i) => i >= cb.start && i < cb.start + cb.count)) this.removeStrap(st);
    const rests = Array.from(this.sim.rest.subarray(cb.start, cb.start + cb.count - 1));
    this.sim.moveNodes(cb.start, this.coil(rests));
  }

  /** new cords left in the stock, by length (m) */
  cordStock: Map<number, number>;

  /** takes a new cord of that length out of the stock, into the crate; −1 when there is none left */
  takeCord(type: FibreType, length: number, color?: string): number {
    const left = this.cordStock.get(length) ?? 0;
    if (left <= 0) return -1;
    this.cordStock.set(length, left - 1);
    return this.addCable(type, length, color);
  }

  /** a new cord, dropped in the crate */
  addCable(type: FibreType, length: number, color?: string): number {
    const n = Math.max(3, Math.round(length / this.seg));
    const rests = new Array(n).fill(length / n);
    this.rebuild(new Map(), [{ points: this.coil(rests), rests, type, color }]);
    return this.cables.length - 1;
  }

  /**
   * rebuilds the physics with some cords replaced and others added, keeping
   * every pin, strap, rest length (an added cord's are given) and pinch, and
   * what the keepers know of the cords (a replaced one is still handled)
   */
  private rebuild(replace: Map<number, number[]>, append: { points: number[]; rests: number[]; type: FibreType; color?: string }[] = []): void {
    const old = this.sim;
    const threaded = old.threaded;
    const defs = this.cables.map((cb, k) => {
      const points = replace.get(k) ?? Array.from(old.x.subarray(3 * cb.start, 3 * (cb.start + cb.count)));
      return this.cord(cb.type, points);
    });
    for (const a of append) defs.push(this.cord(a.type, a.points));
    const rests = this.cables.map((cb) => Array.from(old.rest.subarray(cb.start, cb.start + cb.count)));
    for (const a of append) rests.push(a.rests);
    const kept = this.cables.map((cb, k) => ({
      handled: old.handled[k],
      lastHand: replace.has(k) || old.lastHand[k] < 0 ? -1 : old.lastHand[k] - cb.start,
      keepOf: replace.has(k) ? null : old.keepOf.slice(cb.start, cb.start + cb.count),
    }));
    const straps = this.straps.map((s) => s.nodes.map((i) => {
      const k = old.cableOf[i], cb = this.cables[k];
      return { k, f: (i - cb.start) / (cb.count - 1) };
    }));
    const ends = this.cables.map((cb) => cb.ends.map((e) => e.port));
    // the pinches of the cords kept, by cord and place along it
    const pinches = old.pinches.filter((p) => !replace.has(old.cableOf[p.a])).map((p) => {
      const k = old.cableOf[p.a];
      return { k, off: p.a - this.cables[k].start, p };
    });
    old.dispose();
    for (const p of this.rack.ports) p.plug = -1;
    for (const a of append) {
      this.cables.push({ type: a.type, start: 0, count: 0, ends: [{ port: null, label: null }, { port: null, label: null }], color: a.color });
      ends.push([null, null]);
    }
    this.sim = new ThreadedSim({ ...old.P });
    const at = this.sim.build(defs);
    this.cables.forEach((cb, k) => {
      cb.start = at[k];
      cb.count = defs[k].points.length / 3;
      if (!replace.has(k)) for (let j = 0; j < cb.count - 1; j++) this.sim.rest[cb.start + j] = rests[k][j];
      const parked = cb.ends.map((e) => e.parked);
      cb.ends.forEach((e) => { e.port = null; e.parked = null; });
      ends[k].forEach((port, e) => { if (port) this.plug(k, e, port); else if (parked[e]) this.park(k, e, parked[e]!); });
    });
    this.sim.setStatics(this.rack.statics());
    kept.forEach((s, k) => {
      const cb = this.cables[k];
      this.sim.handled[k] = s.handled;
      this.sim.lastHand[k] = s.lastHand < 0 ? -1 : cb.start + s.lastHand;
      if (s.keepOf) this.sim.keepOf.set(s.keepOf, cb.start);
    });
    this.sim.loadPinches(pinches.map(({ k, off, p }) => ({ ...p, a: this.cables[k].start + off })));
    this.straps = straps.map((list) => {
      const nodes = list.map(({ k, f }) => {
        const cb = this.cables[k];
        return cb.start + Math.min(cb.count - 3, Math.max(2, Math.round(f * (cb.count - 1))));
      });
      const r = Math.max(this.radius * 2, Math.sqrt(nodes.length) * this.radius * 1.25);
      return { bundle: this.sim.addBundle(nodes, r), nodes };
    });
    if (threaded) this.sim.startWorker();
    this.cablesVersion++;
  }

  /** node positions of the tidy cabinet (before/after demo) */
  tidyTargets(): Float64Array {
    const out = Float64Array.from(this.sim.x);
    this.cables.forEach((cb, c) => {
      const arcs = [0];
      for (let k = 0; k < cb.count - 1; k++) arcs.push(arcs[k] + this.sim.rest[cb.start + k]);
      resample(this.tidyPaths[c], arcs, out, cb.start);
    });
    return out;
  }

  /** installs the managers and ducts of the demo (true) or takes them out (false) */
  installDemoItems(on: boolean): void {
    if (on) {
      if (this.rack.items.length === 0) for (const it of this.setAside) this.rack.addItem(it.kind, it.unit, it.side, true);
    } else this.rack.items = [];
    this.sim.setStatics(this.rack.statics());
    this.itemsVersion++;
  }

  clearStraps(): void {
    for (const s of [...this.straps]) this.removeStrap(s);
  }

  dispose(): void {
    this.sim.dispose();
  }

  /** settle the starting mess before the player sees it */
  preroll(frames: number): void {
    for (let f = 0; f < frames; f++) this.sim.step();
  }

  // --------------------------------------------------------------- ends

  /** the connector node and the next one, for end 0 or 1 of a cable */
  endNodes(c: number, e: number): [number, number] {
    const cb = this.cables[c];
    return e === 0 ? [cb.start, cb.start + 1] : [cb.start + cb.count - 1, cb.start + cb.count - 2];
  }

  /** which end a node belongs to, if it is part of a connector */
  endOfNode(node: number): { cable: number; end: number } | null {
    const c = this.sim.cableOf[node];
    const cb = this.cables[c];
    const k = node - cb.start;
    if (k <= 1) return { cable: c, end: 0 };
    if (k >= cb.count - 2) return { cable: c, end: 1 };
    return null;
  }

  plug(c: number, e: number, portId: string): boolean {
    const port = this.rack.port(portId);
    if (port.plug >= 0) return false;
    const end = this.cables[c].ends[e];
    if (end.port) this.unplug(c, e);
    const [n0, n1] = this.endNodes(c, e);
    end.parked = null;
    this.sim.pinEnd(n0, n1, [port.x, port.y, CONNECTOR], [port.x, port.y, CONNECTOR + this.seg]);
    port.plug = c * 2 + e;
    end.port = portId;
    this.autoLabel(c);
    return true;
  }

  /** a cord plugged on both ports of a line of the schedule takes its service's label, at both ends */
  private autoLabel(c: number): void {
    const cb = this.cables[c];
    const [pa, pb] = cb.ends.map((e) => e.port);
    if (!this.level.labels || !pa || !pb) return;
    const ci = this.circuits.find((q) => q.type === cb.type && ((q.a === pa && q.b === pb) || (q.a === pb && q.b === pa)));
    if (ci) for (const e of cb.ends) e.label = ci.service;
  }

  /** a free connector let go in the air: it stays hooked there until taken again */
  park(c: number, e: number, at?: [V3, V3]): void {
    const end = this.cables[c].ends[e];
    if (end.port) return;
    const [n0, n1] = this.endNodes(c, e);
    const x = this.sim.x;
    const p = at ?? [[x[3 * n0], x[3 * n0 + 1], x[3 * n0 + 2]], [x[3 * n1], x[3 * n1 + 1], x[3 * n1 + 2]]];
    end.parked = p;
    this.sim.pinEnd(n0, n1, p[0], p[1]);
  }

  /** a hooked connector is taken again */
  unpark(c: number, e: number): void {
    const end = this.cables[c].ends[e];
    if (!end.parked) return;
    end.parked = null;
    const [n0, n1] = this.endNodes(c, e);
    this.sim.unpin(n0);
    this.sim.unpin(n1);
  }

  unplug(c: number, e: number): void {
    const end = this.cables[c].ends[e];
    if (!end.port) return;
    this.rack.port(end.port).plug = -1;
    end.port = null;
    const [n0, n1] = this.endNodes(c, e);
    this.sim.unpin(n0);
    this.sim.unpin(n1);
  }

  /** tip of the connector of an end (where it enters a port) */
  connectorTip(c: number, e: number): [number, number, number] {
    const [n0, n1] = this.endNodes(c, e);
    const x = this.sim.x;
    const dx = x[3 * n0] - x[3 * n1], dy = x[3 * n0 + 1] - x[3 * n1 + 1], dz = x[3 * n0 + 2] - x[3 * n1 + 2];
    const L = Math.hypot(dx, dy, dz) || 1;
    return [x[3 * n0] + (dx / L) * CONNECTOR, x[3 * n0 + 1] + (dy / L) * CONNECTOR, x[3 * n0 + 2] + (dz / L) * CONNECTOR];
  }

  // -------------------------------------------------------------- items

  placeItem(kind: ItemKind, unit: number, side: number): Item | null {
    if (this.inventory[kind] <= 0) return null;
    const it = this.rack.addItem(kind, unit, side);
    if (!it) return null;
    this.inventory[kind]--;
    this.refreshStatics();
    return it;
  }

  removeItem(it: Item): boolean {
    if (!this.rack.removeItem(it.id)) return false;
    this.inventory[it.kind]++;
    this.refreshStatics();
    return true;
  }

  private refreshStatics(): void {
    this.sim.setStatics(this.rack.statics());
    this.itemsVersion++;
  }

  // ------------------------------------------------------------- velcro

  /**
   * straps the cords passing within reach of a point; needs two of them.
   * `along`: only those running that way there (a unit vector), not those
   * leaving the bundle for a port, which a band round them all would cut across
   */
  addStrap(px: number, py: number, pz: number, reach = 0.03, along?: [number, number, number]): Strap | null {
    if (this.inventory.velcro <= 0) return null;
    const x = this.sim.x;
    const best = new Map<number, { node: number; d: number }>();
    for (let c = 0; c < this.cables.length; c++) {
      const cb = this.cables[c];
      for (let i = cb.start + 2; i < cb.start + cb.count - 2; i++) {
        if (this.sim.bundleOf[i] >= 0) continue;
        if (along) {
          const ex = x[3 * i + 3] - x[3 * i - 3], ey = x[3 * i + 4] - x[3 * i - 2], ez = x[3 * i + 5] - x[3 * i - 1];
          if (Math.abs(ex * along[0] + ey * along[1] + ez * along[2]) < 0.9 * Math.hypot(ex, ey, ez)) continue;
        }
        const d = Math.hypot(x[3 * i] - px, x[3 * i + 1] - py, x[3 * i + 2] - pz);
        if (d < reach && (!best.has(c) || best.get(c)!.d > d)) best.set(c, { node: i, d });
      }
    }
    if (best.size < 2) return null;
    const nodes = [...best.values()].map((b) => b.node);
    // the strap holds the bundle as tight as the cords allow
    const r = Math.max(this.radius * 2, Math.sqrt(nodes.length) * this.radius * 1.25);
    const bundle = this.sim.addBundle(nodes, r);
    const s = { bundle, nodes };
    this.straps.push(s);
    this.inventory.velcro--;
    return s;
  }

  removeStrap(s: Strap): void {
    this.sim.removeBundle(s.bundle);
    this.straps = this.straps.filter((q) => q !== s);
    this.inventory.velcro++;
  }

  strapCentre(s: Strap): [number, number, number] {
    const x = this.sim.x;
    let cx = 0, cy = 0, cz = 0;
    for (const i of s.nodes) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
    const n = s.nodes.length;
    return [cx / n, cy / n, cz / n];
  }

  // ---------------------------------------------------------- evaluation

  /** ports of the lines connected as planned (their LEDs are green); without an evaluation, from the plugs alone */
  okPorts(ev?: Evaluation): Set<string> {
    const ok = new Set<string>();
    this.circuits.forEach((ci, i) => { if (ev ? ev.circuits[i].connected : this.circuitUp(i)) ok.add(ci.a).add(ci.b); });
    return ok;
  }

  /** height below which a cord lies on the floor of the cabinet rather than in it */
  private floorLimit(): number {
    const lowest = this.rack.units.reduce((m, u, k) => (u.kind === 'switch' || u.kind === 'panel' ? Math.max(m, k) : m), 0);
    return this.rack.unitBottom(lowest) - 0.12;
  }

  /**
   * How each node of a cord is held: HELD by the management or next to a
   * plugged connector, FREE on a short stretch (20 cm at most) between two
   * holds, HANGING on a longer one, LOW under the equipment (on the floor).
   * The cord is routed when it has neither of the last two.
   */
  holdMap(c: number, supports = this.rack.supports(), floorLimit = this.floorLimit()): Uint8Array {
    const cb = this.cables[c];
    const x = this.sim.x;
    const out = new Uint8Array(cb.count);
    const reach = 6;
    let run = 0;
    const close = (k: number) => {
      // the stretch that ends before node k
      if (run > 0.2) for (let j = k - Math.round(run / this.seg); j < k; j++) if (out[j] === HOLD.FREE) out[j] = HOLD.HANGING;
      run = 0;
    };
    for (let k = 0; k < cb.count; k++) {
      const i = cb.start + k;
      const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2];
      const nearEnd = (k < reach && cb.ends[0].port) || (k >= cb.count - reach && cb.ends[1].port);
      let held = !!nearEnd;
      if (!held) {
        for (const s of supports) {
          if (insideBox(s, px, py, pz)) { held = true; break; }
        }
      }
      if (held) { close(k); out[k] = HOLD.HELD; } else { run += this.seg; out[k] = HOLD.FREE; }
      if (py < floorLimit) out[k] = HOLD.LOW;
    }
    close(cb.count);
    return out;
  }

  evaluate(): Evaluation {
    const supports = this.rack.supports();
    const x = this.sim.x;
    const cableRouted: boolean[] = [];
    const cableObstructs: boolean[] = [];
    const floorLimit = this.floorLimit();
    for (let c = 0; c < this.cables.length; c++) {
      const cb = this.cables[c];
      const hold = this.holdMap(c, supports, floorLimit);
      cableRouted.push(!hold.some((h) => h === HOLD.HANGING || h === HOLD.LOW) && !!cb.ends[0].port && !!cb.ends[1].port);
      // a cord hanging in front of somebody else's port
      let obstructs = false;
      for (const p of this.rack.ports) {
        if (obstructs) break;
        const own = cb.ends[0].port === p.id || cb.ends[1].port === p.id;
        if (own) continue;
        const pitch = this.rack.portPitch(p);
        const hx = Math.max(0.006, pitch * 0.45);
        const near = Math.ceil(0.15 / this.seg);
        for (let k = near; k < cb.count - near; k++) {
          const i = cb.start + k;
          if (Math.abs(x[3 * i] - p.x) < hx && Math.abs(x[3 * i + 1] - (p.y - 0.002)) < 0.011 && x[3 * i + 2] < 0.11) { obstructs = true; break; }
        }
      }
      cableObstructs.push(obstructs);
    }

    const cableStrain = this.cables.map((_, c) => this.strain(c));
    const circuits: CircuitStatus[] = this.circuits.map((ci) => {
      let cable = -1;
      const pa = this.rack.port(ci.a).plug, pb = this.rack.port(ci.b).plug;
      if (pa >= 0 && pb >= 0 && pa >> 1 === pb >> 1) cable = pa >> 1;
      const connected = cable >= 0 && this.cables[cable].type === ci.type;
      const routed = connected && cableRouted[cable];
      const clear = connected && !cableObstructs[cable];
      const labelled = connected && this.cables[cable].ends.every((e) => e.label === ci.service);
      const relaxed = connected && !cableStrain[cable];
      return { cable, connected, routed, clear, labelled, relaxed };
    });
    const n = circuits.length;
    const count = (f: (s: CircuitStatus) => boolean) => circuits.filter(f).length;
    const connected = count((s) => s.connected);
    const routed = count((s) => s.routed);
    const clear = count((s) => s.clear);
    const labelled = this.level.labels ? count((s) => s.labelled) : n;
    const relaxed = count((s) => s.relaxed);
    const bundles = this.bundleCount(supports);
    const bundlesNeeded = this.level.bundles ?? 0;
    let stars = 0;
    if (connected === n) {
      stars = 1;
      if (routed >= 0.7 * n && clear >= 0.85 * n) stars = 2;
      // past the downtime budget, an incident: three stars are out of reach
      if (routed === n && clear === n && labelled === n && relaxed === n && bundles >= bundlesNeeded && this.downtime <= this.budget) stars = 3;
    }
    return {
      circuits, connected, routed, clear, labelled, relaxed, total: n, stars, cableRouted, cableObstructs, cableStrain,
      liveDown: this.liveDown(), downtime: this.downtime, budget: this.budget, bundles, bundlesNeeded,
      readability: this.readability(circuits, cableStrain, supports),
    };
  }

  /**
   * What a technician coming after you would think of the cabinet, beyond
   * the stars: cords with just the slack they need, of their service's
   * colour, bundles of one service, fibre and copper apart, no cords crossing
   * in front of the cabinet.
   */
  private readability(circuits: CircuitStatus[], strain: (Strain | null)[], supports: ReturnType<Rack['supports']>): Readability {
    const parts: Readability['parts'] = [];
    const made = circuits.map((s, i) => ({ s, i })).filter(({ s }) => s.connected);
    // the slack: none pulled taut or kinked, and no more than half a metre beyond the route
    if (made.length) {
      let sum = 0;
      for (const { s } of made) {
        if (strain[s.cable]) continue;
        const extra = this.cableLength(s.cable) - this.routeLength(s.cable)!;
        sum += Math.max(0, Math.min(1, 1 - (extra - 0.5)));
      }
      parts.push({ name: 'Le mou juste', value: sum / made.length, tip: 'ni tendu ni plié, et pas plus de 50 cm de trop' });
    }
    // copper cords of the colour of their service
    if (this.level.colorByService) {
      const cu = made.filter(({ s }) => this.cables[s.cable].type === 'CU');
      if (cu.length) {
        const ok = cu.filter(({ s, i }) => this.cables[s.cable].color === SERVICES[this.circuits[i].service].color).length;
        parts.push({ name: 'Couleurs', value: ok / cu.length, tip: 'chaque cordon cuivre de la couleur de son service' });
      }
    }
    // bundles of one service
    const serviceOf = new Map<number, number>();
    circuits.forEach((s, i) => { if (s.connected) serviceOf.set(s.cable, this.circuits[i].service); });
    const straps = this.straps.filter((st) => st.nodes.length >= 2);
    if (straps.length) {
      const pure = straps.filter((st) => new Set(st.nodes.map((i) => serviceOf.get(this.sim.cableOf[i]) ?? -1)).size === 1).length;
      parts.push({ name: 'Faisceaux', value: pure / straps.length, tip: 'un seul service par velcro' });
    }
    // fibre and copper in separate ducts and managers
    const x = this.sim.x;
    if (new Set(this.cables.map((cb) => cb.type === 'CU')).size > 1) {
      let used = 0, mixed = 0;
      for (const sp of supports) {
        const kinds = new Set<boolean>();
        this.cables.forEach((cb) => {
          for (let k = 4; k < cb.count - 4; k += 2) {
            const i = cb.start + k;
            if (insideBox(sp, x[3 * i], x[3 * i + 1], x[3 * i + 2])) { kinds.add(cb.type === 'CU'); break; }
          }
        });
        if (kinds.size) used++;
        if (kinds.size > 1) mixed++;
      }
      if (used) parts.push({ name: 'Fibre et cuivre', value: 1 - mixed / used, tip: 'la fibre et le cuivre dans des supports séparés' });
    }
    // cords crossing each other in front of the cabinet, out of every support
    const crossings = this.crossings(supports);
    parts.push({ name: 'Croisements', value: Math.max(0, 1 - crossings / Math.max(4, this.cables.length)), tip: `${crossings} croisement${crossings > 1 ? 's' : ''} hors des supports` });
    const note = Math.round((100 * parts.reduce((a, p) => a + p.value, 0)) / parts.length);
    return { note, parts };
  }

  /** pairs of cord segments crossing seen from the front, where neither is in a support */
  private crossings(supports: ReturnType<Rack['supports']>): number {
    const x = this.sim.x;
    const segs: { c: number; ax: number; ay: number; bx: number; by: number }[] = [];
    this.cables.forEach((cb, c) => {
      if (!cb.ends[0].port && !cb.ends[1].port) return;
      for (let k = 0; k < cb.count - 1; k++) {
        const i = cb.start + k;
        if (x[3 * i + 2] > 0.3) continue;
        if (supports.some((s) => insideBox(s, x[3 * i], x[3 * i + 1], x[3 * i + 2]))) continue;
        segs.push({ c, ax: x[3 * i], ay: x[3 * i + 1], bx: x[3 * i + 3], by: x[3 * i + 4] });
      }
    });
    // a grid of 5 cm cells, each pair tested once
    const cell = 0.05, grid = new Map<string, number[]>();
    segs.forEach((s, j) => {
      const key = `${Math.floor((s.ax + s.bx) / 2 / cell)},${Math.floor((s.ay + s.by) / 2 / cell)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(j);
    });
    const pairs = new Set<string>();
    for (const [key, list] of grid) {
      const [gx, gy] = key.split(',').map(Number);
      const near: number[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.push(...(grid.get(`${gx + dx},${gy + dy}`) ?? []));
      for (const j of list) {
        for (const k of near) {
          if (k <= j) continue;
          const p = segs[j], q = segs[k];
          if (p.c === q.c) continue;
          const key2 = p.c < q.c ? `${p.c}:${q.c}` : `${q.c}:${p.c}`;
          if (!pairs.has(key2) && cross(p, q)) pairs.add(key2);
        }
      }
    }
    return pairs.size;
  }

  /** straps round three cords or more, lying in a manager or a duct */
  bundleCount(supports = this.rack.supports()): number {
    return this.straps.filter((st) => {
      if (st.nodes.length < 3) return false;
      const [x, y, z] = this.strapCentre(st);
      return supports.some((s) => insideBox(s, x, y, z));
    }).length;
  }
}

/** do two segments of the front view cross? */
function cross(p: { ax: number; ay: number; bx: number; by: number }, q: { ax: number; ay: number; bx: number; by: number }): boolean {
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  return o(p.ax, p.ay, p.bx, p.by, q.ax, q.ay) * o(p.ax, p.ay, p.bx, p.by, q.bx, q.by) < 0
    && o(q.ax, q.ay, q.bx, q.by, p.ax, p.ay) * o(q.ax, q.ay, q.bx, q.by, p.bx, p.by) < 0;
}

function dist3(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
