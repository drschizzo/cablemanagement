// The game state of one cabinet: the physics, the rack and its items, the
// cords with their ends and labels, the velcro straps, the inventory, and the
// evaluation of how tidy it all is.

import { ThreadedSim } from '../physics/threadedSim';
import type { Pinch } from '../physics/cableSim';
import { CABLE_R, CONNECTOR, Rack, SEG, insideBox, type Item, type ItemKind } from './rack';
import { SERVICES, type FibreType, type LevelDef } from './levels';
import { makeCables, makeSchedule, rng, type Circuit } from './tangle';
import { pathToNodes, polyLength, resample, tidyRoutes, type V3 } from './tidy';

export interface CableEnd {
  port: string | null;
  label: number | null;
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
  /** production links cut now, and the most allowed at once */
  liveDown: number;
  maxCuts?: number;
  /** velcro bundles (three cords or more, in the management), and how many three stars need */
  bundles: number;
  bundlesNeeded: number;
}

/** how a node of a cord is held (World.holdMap) */
export const HOLD = { FREE: 0, HELD: 1, HANGING: 2, LOW: 3 } as const;

export interface Snapshot {
  version: number;
  x: Float64Array;
  pinches: Pinch[];
  ends: CableEnd[][];
}

export type Inventory = Record<ItemKind | 'velcro', number>;

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
  stiffness(type: FibreType): number {
    return this.bend || (type === 'CU' ? 12 : 6);
  }

  constructor(level: LevelDef) {
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
    let starts = makeCables(level, this.rack, this.circuits, r);
    if (level.showcase === 'tidy') {
      // the cords are laid along their tidy routes, cut to length
      this.tidyPaths = tidyRoutes(this.rack, this.circuits, this.radius, this.seg);
      starts = starts.map((st, c) => ({ ...st, ends: [this.circuits[c].a, this.circuits[c].b], points: pathToNodes(this.tidyPaths[c], this.seg) }));
    }
    // big cabinets trade a substep for frame rate (≈ 13 ms instead of 18 for 40 cords);
    // the solver settings were tuned at these substep counts (see `refSubsteps`)
    const big = level.cables >= 20;
    this.sim = new ThreadedSim(big ? { substeps: 2, refSubsteps: 2, iterations: 5 } : { substeps: 3, refSubsteps: 3, iterations: 6 });
    const at = this.sim.build(starts.map((s) => ({ points: s.points, radius: this.radius, bend: this.stiffness(s.type) })));
    starts.forEach((s, c) => {
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
    this.inventory = { hmgr: 0, duct: 0, vring: 0, velcro: 0, ...level.inventory };
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

  /** may this cord be unplugged without cutting more production links than allowed? */
  canUnplug(c: number): boolean {
    const max = this.level.maxCuts;
    if (max === undefined) return true;
    let cuts = 0;
    for (const i of this.live) {
      if (!this.circuitUp(i)) continue;
      const ci = this.circuits[i];
      if (this.rack.port(ci.a).plug >> 1 === c) cuts++;
    }
    return cuts === 0 || this.liveDown() + cuts <= max;
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
    const [pa, pb] = this.cables[c].ends.map((e) => e.port);
    if (!pa || !pb) return null;
    // the route starts from the upper port
    const [a, b] = this.rack.port(pa).unit <= this.rack.port(pb).unit ? [pa, pb] : [pb, pa];
    const route = tidyRoutes(this.rack, [{ a, b, type: this.cables[c].type, service: 0 }], this.radius, this.seg)[0];
    return Math.ceil((polyLength(route) + 0.03) / 0.05) * 0.05;
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
    this.cables.forEach((cb, c) => cb.ends.forEach((e, k) => { if (e.port !== s.ends[c][k].port) this.unplug(c, k); }));
    this.sim.teleport(s.x);
    this.sim.loadPinches(s.pinches);
    this.cables.forEach((cb, c) => cb.ends.forEach((e, k) => {
      const want = s.ends[c][k];
      if (want.port && e.port !== want.port) this.plug(c, k, want.port);
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
    for (const e of [0, 1]) this.unplug(c, e);
    const cb = this.cables[c];
    for (const st of [...this.straps]) if (st.nodes.some((i) => i >= cb.start && i < cb.start + cb.count)) this.removeStrap(st);
    const rests = Array.from(this.sim.rest.subarray(cb.start, cb.start + cb.count - 1));
    this.sim.moveNodes(cb.start, this.coil(rests));
  }

  /** a new cord from the stock, dropped in the crate */
  addCable(type: FibreType, length: number, color?: string): number {
    const n = Math.max(3, Math.round(length / this.seg));
    const rests = new Array(n).fill(length / n);
    this.rebuild(new Map(), [{ points: this.coil(rests), type, color }]);
    return this.cables.length - 1;
  }

  /** rebuilds the physics with some cords replaced and others added, keeping every pin, strap, rest length and pinch */
  private rebuild(replace: Map<number, number[]>, append: { points: number[]; type: FibreType; color?: string }[] = []): void {
    const old = this.sim;
    const threaded = old.threaded;
    const defs = this.cables.map((cb, k) => {
      const points = replace.get(k) ?? Array.from(old.x.subarray(3 * cb.start, 3 * (cb.start + cb.count)));
      return { points, radius: this.radius, bend: this.stiffness(cb.type) };
    });
    for (const a of append) defs.push({ points: a.points, radius: this.radius, bend: this.stiffness(a.type) });
    const rests = this.cables.map((cb) => Array.from(old.rest.subarray(cb.start, cb.start + cb.count)));
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
      if (!replace.has(k) && k < rests.length) for (let j = 0; j < cb.count - 1; j++) this.sim.rest[cb.start + j] = rests[k][j];
      cb.ends.forEach((e) => { e.port = null; });
      ends[k].forEach((port, e) => { if (port) this.plug(k, e, port); });
    });
    this.sim.setStatics(this.rack.statics());
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
    this.sim.pinEnd(n0, n1, [port.x, port.y, CONNECTOR], [port.x, port.y, CONNECTOR + this.seg]);
    port.plug = c * 2 + e;
    end.port = portId;
    return true;
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

  /** straps the cords passing within reach of a point; needs two of them */
  addStrap(px: number, py: number, pz: number, reach = 0.03): Strap | null {
    if (this.inventory.velcro <= 0) return null;
    const x = this.sim.x;
    const best = new Map<number, { node: number; d: number }>();
    for (let c = 0; c < this.cables.length; c++) {
      const cb = this.cables[c];
      for (let i = cb.start + 2; i < cb.start + cb.count - 2; i++) {
        if (this.sim.bundleOf[i] >= 0) continue;
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

  /** ports of the lines connected as planned (their LEDs are green) */
  okPorts(ev: Evaluation): Set<string> {
    const ok = new Set<string>();
    ev.circuits.forEach((s, i) => { if (s.connected) ok.add(this.circuits[i].a).add(this.circuits[i].b); });
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

    const circuits: CircuitStatus[] = this.circuits.map((ci) => {
      let cable = -1;
      const pa = this.rack.port(ci.a).plug, pb = this.rack.port(ci.b).plug;
      if (pa >= 0 && pb >= 0 && pa >> 1 === pb >> 1) cable = pa >> 1;
      const connected = cable >= 0 && this.cables[cable].type === ci.type;
      const routed = connected && cableRouted[cable];
      const clear = connected && !cableObstructs[cable];
      const labelled = connected && this.cables[cable].ends.every((e) => e.label === ci.service);
      return { cable, connected, routed, clear, labelled };
    });
    const n = circuits.length;
    const count = (f: (s: CircuitStatus) => boolean) => circuits.filter(f).length;
    const connected = count((s) => s.connected);
    const routed = count((s) => s.routed);
    const clear = count((s) => s.clear);
    const labelled = this.level.labels ? count((s) => s.labelled) : n;
    const bundles = this.bundleCount(supports);
    const bundlesNeeded = this.level.bundles ?? 0;
    let stars = 0;
    if (connected === n) {
      stars = 1;
      if (routed >= 0.7 * n && clear >= 0.85 * n) stars = 2;
      if (routed === n && clear === n && labelled === n && bundles >= bundlesNeeded) stars = 3;
    }
    return { circuits, connected, routed, clear, labelled, total: n, stars, cableRouted, cableObstructs, liveDown: this.liveDown(), maxCuts: this.level.maxCuts, bundles, bundlesNeeded };
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

function dist3(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
