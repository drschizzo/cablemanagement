// The game state of one cabinet: the physics, the rack and its items, the
// cords (cables.ts) with their ends and labels, the velcro straps, the crate
// and the stock of new cords, the supports and velcros left, the maintenance window. How tidy it all is:
// evaluation.ts.

import { CABLES, type CableInit, type Pinch } from '@drschizzo/avbd-cables';
import { bundleCount, cordStrain, evaluate, holdMap, okPorts, type Evaluation, type Strain } from './evaluation';
import { ThreadedSim } from './physics/threadedSim';
import { CABLE_R, CONNECTOR, Rack, SEG, type Item } from './rack';
import { stockOf, type ItemKind, type Stock } from './supplies';
import { SERVICES } from './services';
import { MaintenanceWindow } from './maintenanceWindow';
import type { FibreType } from './cordTypes';
import type { Cable, CableEnd, CableIndex, CircuitIndex, EndIndex, NodeIndex, Strap } from './cables';
import { coilInCrate, minLengthThrough, shapeForLength } from './cordShapes';
import type { LevelDef } from './levels/levelDef';
import { makeCables, makeSchedule, rng, type CableStart, type Circuit } from './mess/tangle';
import { pathToNodes, resample, tidyRoutes } from './idealRoutes';
import { polyLength, type V3 } from './vec3';

export interface Snapshot {
  version: number;
  x: Float64Array;
  pinches: Pinch[];
  ends: CableEnd[][];
}

export class World {
  level: LevelDef;
  rack: Rack;
  sim: ThreadedSim;
  circuits: Circuit[];
  cables: Cable[] = [];
  straps: Strap[] = [];
  /** the supports and velcros left */
  stock: Stock;
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
    this.stock = stockOf(level.inventory);
    this.cordStock = new Map(level.cords ?? []);
    this.maintenance = new MaintenanceWindow(this.circuits, (i) => this.circuitUp(i), level.downtime ?? Infinity, level.bypass ?? 0);
  }

  // ------------------------------------------------- maintenance window

  /** the links in production, the downtime budget, the bypasses */
  readonly maintenance: MaintenanceWindow;

  /** a circuit carries traffic: one cord of the right type joins its two ports */
  circuitUp(i: CircuitIndex): boolean {
    const ci = this.circuits[i];
    const cable = this.rack.cableJoining(ci.a, ci.b);
    return cable >= 0 && this.cables[cable].type === ci.type;
  }

  /** the production links a cord carries now (unplugging it cuts them) */
  liveLinksCarriedBy(c: CableIndex): CircuitIndex[] {
    return [...this.maintenance.live].filter((i) => this.circuitUp(i) && this.rack.port(this.circuits[i].a).plugged?.cable === c);
  }

  /** bumps when the cords are rebuilt (a cord swapped for another length) */
  cablesVersion = 0;

  /** length of a cord (m) */
  cableLength(c: CableIndex): number {
    const cb = this.cables[c];
    let L = 0;
    for (let k = 0; k < cb.count - 1; k++) L += this.sim.rest[cb.start + k];
    return L;
  }

  /** the shortest cord that still reaches from one end to the other */
  minCableLength(c: CableIndex): number {
    return minLengthThrough(this.cablePoints(c));
  }

  private cablePoints(c: CableIndex): V3[] {
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
  setCableLength(c: CableIndex, L: number): boolean {
    if (L < this.minCableLength(c)) return false;
    // the lowest a node may lie: its cord resting on the floor
    const floorY = this.rack.floorY + this.radius + 0.004;
    const fresh = pathToNodes(shapeForLength(this.cablePoints(c), L, floorY), this.seg);
    this.rebuild(new Map([[c, fresh]]));
    return true;
  }

  /**
   * The length a cord needs to run tidily between the two ports it is plugged
   * into, through the managers and ducts of the cabinet as it is now, rounded
   * up to 5 cm with a little play (null: it is not plugged at both ends).
   */
  tidyLength(c: CableIndex): number | null {
    const L = this.routeLength(c);
    return L === null ? null : Math.ceil((L + 0.03) / 0.05) * 0.05;
  }

  /** length of the tidy route between the two ports a cord is plugged into (null: not plugged at both ends) */
  routeLength(c: CableIndex): number | null {
    const [pa, pb] = this.cables[c].ends.map((e) => e.port);
    if (!pa || !pb) return null;
    // the route starts from the upper port
    const [a, b] = this.rack.port(pa).unit <= this.rack.port(pb).unit ? [pa, pb] : [pb, pa];
    return polyLength(tidyRoutes(this.rack, [{ a, b, type: this.cables[c].type, service: 0 }], this.radius, this.seg)[0]);
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

  /** coils thrown into the crate so far: each falls a little higher than the last */
  private thrown = 0;

  /** a coil of cord (as it comes out of its bag), at a random spot of the crate */
  private coil(rests: number[]): number[] {
    return coilInCrate(this.rack.crate(), rests, this.radius, this.thrown++);
  }

  /** unplugs a cord, coils it and throws it in the crate (its straps come off) */
  depositCable(c: CableIndex): void {
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
    for (const p of this.rack.ports) p.plugged = null;
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
  endNodes(c: CableIndex, e: EndIndex): [NodeIndex, NodeIndex] {
    const cb = this.cables[c];
    return e === 0 ? [cb.start, cb.start + 1] : [cb.start + cb.count - 1, cb.start + cb.count - 2];
  }

  /** which end a node belongs to, if it is part of a connector */
  endOfNode(node: NodeIndex): { cable: CableIndex; end: EndIndex } | null {
    const c = this.sim.cableOf[node];
    const cb = this.cables[c];
    const k = node - cb.start;
    if (k <= 1) return { cable: c, end: 0 };
    if (k >= cb.count - 2) return { cable: c, end: 1 };
    return null;
  }

  plug(c: CableIndex, e: EndIndex, portId: string): boolean {
    const port = this.rack.port(portId);
    if (port.plugged) return false;
    const end = this.cables[c].ends[e];
    if (end.port) this.unplug(c, e);
    const [n0, n1] = this.endNodes(c, e);
    end.parked = null;
    this.sim.pinEnd(n0, n1, [port.x, port.y, CONNECTOR], [port.x, port.y, CONNECTOR + this.seg]);
    port.plugged = { cable: c, end: e };
    end.port = portId;
    this.autoLabel(c);
    return true;
  }

  /** a cord plugged on both ports of a line of the schedule takes its service's label, at both ends */
  private autoLabel(c: CableIndex): void {
    const cb = this.cables[c];
    const [pa, pb] = cb.ends.map((e) => e.port);
    if (!this.level.labels || !pa || !pb) return;
    const ci = this.circuits.find((q) => q.type === cb.type && ((q.a === pa && q.b === pb) || (q.a === pb && q.b === pa)));
    if (ci) for (const e of cb.ends) e.label = ci.service;
  }

  /** a free connector let go in the air: it stays hooked there until taken again */
  park(c: CableIndex, e: EndIndex, at?: [V3, V3]): void {
    const end = this.cables[c].ends[e];
    if (end.port) return;
    const [n0, n1] = this.endNodes(c, e);
    const x = this.sim.x;
    const p = at ?? [[x[3 * n0], x[3 * n0 + 1], x[3 * n0 + 2]], [x[3 * n1], x[3 * n1 + 1], x[3 * n1 + 2]]];
    end.parked = p;
    this.sim.pinEnd(n0, n1, p[0], p[1]);
  }

  /** a hooked connector is taken again */
  unpark(c: CableIndex, e: EndIndex): void {
    const end = this.cables[c].ends[e];
    if (!end.parked) return;
    end.parked = null;
    const [n0, n1] = this.endNodes(c, e);
    this.sim.unpin(n0);
    this.sim.unpin(n1);
  }

  unplug(c: CableIndex, e: EndIndex): void {
    const end = this.cables[c].ends[e];
    if (!end.port) return;
    this.rack.port(end.port).plugged = null;
    end.port = null;
    const [n0, n1] = this.endNodes(c, e);
    this.sim.unpin(n0);
    this.sim.unpin(n1);
  }

  /** tip of the connector of an end (where it enters a port) */
  connectorTip(c: CableIndex, e: EndIndex): [number, number, number] {
    const [n0, n1] = this.endNodes(c, e);
    const x = this.sim.x;
    const dx = x[3 * n0] - x[3 * n1], dy = x[3 * n0 + 1] - x[3 * n1 + 1], dz = x[3 * n0 + 2] - x[3 * n1 + 2];
    const L = Math.hypot(dx, dy, dz) || 1;
    return [x[3 * n0] + (dx / L) * CONNECTOR, x[3 * n0 + 1] + (dy / L) * CONNECTOR, x[3 * n0 + 2] + (dz / L) * CONNECTOR];
  }

  // -------------------------------------------------------------- items

  placeItem(kind: ItemKind, unit: number, side: number): Item | null {
    if (this.stock[kind] <= 0) return null;
    const it = this.rack.addItem(kind, unit, side);
    if (!it) return null;
    this.stock[kind]--;
    this.refreshStatics();
    return it;
  }

  removeItem(it: Item): boolean {
    if (!this.rack.removeItem(it.id)) return false;
    this.stock[it.kind]++;
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
    if (this.stock.velcro <= 0) return null;
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
    return this.strapNodes([...best.values()].map((b) => b.node));
  }

  /** straps these nodes together (one of each cord); needs two of them, and a velcro left */
  strapNodes(nodes: number[]): Strap | null {
    if (this.stock.velcro <= 0 || nodes.length < 2) return null;
    // the strap holds the bundle as tight as the cords allow
    const r = Math.max(this.radius * 2, Math.sqrt(nodes.length) * this.radius * 1.25);
    const bundle = this.sim.addBundle(nodes, r);
    const s = { bundle, nodes };
    this.straps.push(s);
    this.stock.velcro--;
    return s;
  }

  removeStrap(s: Strap): void {
    this.sim.removeBundle(s.bundle);
    this.straps = this.straps.filter((q) => q !== s);
    this.stock.velcro++;
  }

  strapCentre(s: Strap): [number, number, number] {
    const x = this.sim.x;
    let cx = 0, cy = 0, cz = 0;
    for (const i of s.nodes) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
    const n = s.nodes.length;
    return [cx / n, cy / n, cz / n];
  }

  // ---------------------------------------------------------- evaluation
  // (the scoring itself lives in evaluation.ts)

  evaluate(): Evaluation {
    return evaluate(this);
  }

  /** how each node of a cord is held (see evaluation.ts) */
  holdMap(c: CableIndex): Uint8Array {
    return holdMap(this, c);
  }

  /** a cord pulled taut or a fibre kinked; null when neither */
  strain(c: CableIndex): Strain | null {
    return cordStrain(this, c);
  }

  /** ports of the lines connected as planned (their LEDs are green) */
  okPorts(ev?: Evaluation): Set<string> {
    return okPorts(this, ev);
  }

  /** straps round three cords or more, lying in a manager or a duct */
  bundleCount(): number {
    return bundleCount(this);
  }
}
