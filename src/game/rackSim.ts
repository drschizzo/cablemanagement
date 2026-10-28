// The cable solver as the game drives it (avbd-cables knows nothing
// of the cabinet): the hands, the route goals, the connectors pushed into
// their ports, and the keepers of the finger managers.
//
// The hands, a connector on its way into its port and the route goals are
// the solver's targets (springs on a leash): this sets them at the start of
// every step, from where the hands, the strokes and the goals are (`aim`).
//
// One gameplay aid, outside the physics: the trough of a finger manager is a
// keeper — a cord the player has handled or laid along a route stays in it
// once in it, until the hand pulls it out or a route leads it elsewhere. It
// never draws a cord in: laying a cord in the guides is the route's job.

import { CableSim, defaultSimParams, type CableInit, type NodeSystem, type Pinch, type SimParams, type SimSnapshot, type StaticShape } from '@drschizzo/avbd-cables';

/**
 * A channel that keeps what is left in it (the trough of a finger manager):
 * no collision, but a node of a cord let go inside stays within its height
 * and depth — free to slide along its length and out of its ends — until the
 * hand pulls it out. A gameplay aid: a cord laid in a manager stays laid.
 */
export interface StaticKeeper {
  kind: 'keeper';
  min: [number, number, number];
  max: [number, number, number];
  owner?: number;
}

/** the shapes of the cabinet: those the cords collide with, and the keepers */
export type RackShape = StaticShape | StaticKeeper;

/**
 * a connector's stroke into its port: speed (m/s), shortest and longest (s),
 * how far out it lines up first (m), how close to their places its node and
 * the one behind must come to be pinned there (m), and how long after the
 * stroke they are pinned anyway (s); how many nodes of the cord behind it
 * may be drawn out of a keeper on its way, as near the hand
 */
const PLUG_STROKE = { speed: 0.6, least: 0.1, most: 0.35, lead: 0.03, seat: 0.005, seatBehind: 0.01, giveUp: 0.5, free: 3 };

/** the settings of the game's springs and keepers, beyond the solver's */
export interface RackParams extends SimParams {
  /** stiffness of the hand (× 4 M/h²), and of a connector pushed into its port */
  grabK: number;
  /**
   * Leash of the hand (m): the held node is pulled towards the hand from at
   * most this far, so a cord caught on something is never stretched like an
   * elastic (and does not snap back when let go).
   */
  grabLead: number;
  /** stiffness of a route goal at full weight (× M/h²), and its leash (m): see `setGoals` */
  goalK: number;
  goalLead: number;
  /** nodes on each side of the hand that a pinch takes */
  pinchSpan: number;
  /** firmness of a pinch as it starts, and what it gains per second while the hand keeps pinching (see `firmPinch`) */
  pinchStart: number;
  pinchGrow: number;
  /** nodes of the held cable on each side of the hand that keepers let go of */
  keepHand: number;
  /** nodes of a cable on each side of where the hand last took it that a keeper may take (beyond, only next to nodes it holds) */
  keepZip: number;
  /** stiffness of a keeper's pull in the solve (× M/h²) */
  keepK: number;
  /** how far a node may stick out of a keeper and still be taken (m): a cord resting on the fingers is on the edge */
  keepTol: number;
  /** a kept node of the held cord pulled this far out of its keeper in one substep comes out (m) */
  keepPeel: number;
}

export function defaultRackParams(p: Partial<RackParams> = {}): RackParams {
  return {
    ...defaultSimParams(),
    grabK: 0.4, grabLead: 0.06, goalK: 6, goalLead: 0.05,
    pinchSpan: 3, pinchStart: 0.15, pinchGrow: 0.6,
    keepHand: 2, keepZip: 10, keepK: 16, keepTol: 0.002, keepPeel: 0.003,
    ...p,
  };
}

/** what a worker needs of a RackSim's own, beyond the solver's (see `snapshot`) */
interface RackSnapshot extends SimSnapshot {
  handled: Uint8Array;
  lastHand: Int32Array;
  goal: Float64Array;
  goalW: Float64Array;
  plugs: { i0: number; i1: number; a: number[]; b: number[] }[];
}

export class RackSim extends CableSim {
  declare P: RackParams;
  static mirrored = [...CableSim.mirrored, 'pinEnd', 'grab', 'release', 'holdStill', 'letGoStill', 'pinch', 'setGoals'];

  /** the shapes of the cabinet as given, keepers included (the solver gets the others) */
  shapes: RackShape[] = [];
  private keepers: StaticKeeper[] = [];
  /** cables the hand has taken or a route has laid: keepers only take those (not the starting mess) */
  handled = new Uint8Array(0);
  /** the node of each cable the hand last took, or −1: a keeper takes a cord from there */
  lastHand = new Int32Array(0);
  /**
   * The cords the hand is drawing, worked out at the start of every step (see
   * `markDrawn`): the one in hand, and one whose connector is on its way into
   * a port, pushed as by the hand. Such a cord, all of it, is firm against
   * the rack (`firm`). `drawn`: those of its nodes that the hand may draw out
   * of a keeper — all of the cord in hand, but only the connector and the few
   * nodes behind it of a cord being plugged (all of it, a cord laid along a
   * duct slipped out of it).
   */
  private drawn = new Uint8Array(0);
  /** nodes the hands and plugs led at the last step (see `aim`) */
  private aimed: number[] = [];

  // hand
  grabNode = -1;
  grabTarget = [0, 0, 0];
  /** the other hand: holds a node still where it was left (−1: free) */
  holdNode = -1;
  holdTarget = [0, 0, 0];

  // route goals: where each node is led to, and how firmly (0: not led)
  goal = new Float64Array(0);
  goalW = new Float64Array(0);
  /** where the connector nodes on their way into a port are pushed at this frame (see `pinEnd`) */
  plugAt = new Float64Array(0);
  /** connectors on their way into a port (see `pinEnd`) */
  protected plugs: { i0: number; i1: number; s0: number[]; s1: number[]; a: number[]; b: number[]; t: number; T: number }[] = [];

  /** the keeper holding each node, or −1 */
  constructor(params: Partial<RackParams> = {}) {
    super(defaultRackParams(params));
  }

  get keepOf(): Int32Array {
    return this.heldBy;
  }

  /** connector nodes on their way into a port: they pass the rack */
  get plugging(): Uint8Array {
    return this.noStatics;
  }

  build(defs: CableInit[]): number[] {
    const starts = super.build(defs);
    const N = this.n;
    this.goal = new Float64Array(3 * N);
    this.goalW = new Float64Array(N);
    this.plugAt = new Float64Array(3 * N);
    this.handled = new Uint8Array(defs.length);
    this.lastHand = new Int32Array(defs.length).fill(-1);
    this.drawn = new Uint8Array(N);
    this.aimed = [];
    return starts;
  }

  setStatics(shapes: RackShape[]): void {
    this.shapes = shapes;
    this.keepers = shapes.filter((s): s is StaticKeeper => s.kind === 'keeper');
    this.heldBy.fill(-1);
    super.setStatics(shapes.filter((s): s is StaticShape => s.kind !== 'keeper'));
  }

  moveNodes(start: number, pos: ArrayLike<number>): void {
    const n = pos.length / 3;
    if (this.holdNode >= start && this.holdNode < start + n) this.holdNode = -1;
    this.goalW.fill(0, start, Math.min(this.n, start + n));
    super.moveNodes(start, pos);
  }

  teleport(pos: ArrayLike<number>): void {
    this.strokePlugs(0, true);
    super.teleport(pos);
  }

  unpin(i: number): void {
    this.plugs = this.plugs.filter((q) => {
      if (q.i0 !== i && q.i1 !== i) return true;
      this.plugging[q.i0] = 0; this.plugging[q.i1] = 0;
      return false;
    });
    super.unpin(i);
  }

  /**
   * Plugs an end: its connector node i0 and the next one i1 go to a and b
   * (in the port, and just behind it), not at once but along a short
   * stroke that ends in line with the port, as a hand pushes a plug in; the
   * cord follows them. Snapped there, the connector jumped across the gap
   * the pointer had left (centimetres, up to a hand's depth in front of the
   * rack) and the cord, yanked after it, whipped about.
   * On the way they are pushed as the hand pushes, and the cord is as in the
   * hand (firm against the rack, its end free to be drawn out of a keeper): pinned
   * on their way, they dragged the cord with no limit, and one laid along a
   * finger manager slipped through its fingers. They are pinned once there,
   * or a moment after the stroke at the latest.
   */
  pinEnd(i0: number, i1: number, a: ArrayLike<number>, b: ArrayLike<number>): void {
    this.plugs = this.plugs.filter((q) => q.i0 !== i0 && q.i1 !== i1);
    this.plugging[i0] = 0; this.plugging[i1] = 0;
    const x = this.x;
    const s0 = [x[3 * i0], x[3 * i0 + 1], x[3 * i0 + 2]], s1 = [x[3 * i1], x[3 * i1 + 1], x[3 * i1 + 2]];
    const gap = Math.max(Math.hypot(a[0] - s0[0], a[1] - s0[1], a[2] - s0[2]), Math.hypot(b[0] - s1[0], b[1] - s1[1], b[2] - s1[2]));
    if (gap > 1e-3) {
      const P = PLUG_STROKE;
      this.plugs.push({ i0, i1, s0, s1, a: [a[0], a[1], a[2]], b: [b[0], b[1], b[2]], t: 0, T: Math.min(P.most, Math.max(P.least, gap / P.speed)) });
      this.pinned[i0] = 0; this.pinned[i1] = 0;
      this.plugging[i0] = 1; this.plugging[i1] = 1;
      this.wakeCable(this.cableOf[i0]);
      return;
    }
    this.pin(i0, a[0], a[1], a[2]);
    this.pin(i1, b[0], b[1], b[2]);
  }

  /**
   * A frame of the plugs' strokes: a curve from where the connector was,
   * through a point straight out from the port, into it; eased at both ends.
   * There, they are pinned. `finish` puts them all in at once.
   */
  private strokePlugs(dt: number, finish = false): void {
    if (!this.plugs.length) return;
    const back = PLUG_STROKE.lead;
    this.plugs = this.plugs.filter((q) => {
      q.t = finish ? q.T : q.t + dt;
      const r = Math.min(1, q.t / q.T), u = r * r * (3 - 2 * r);
      // straight out of the port: from the node in it towards the one behind
      const ox = q.b[0] - q.a[0], oy = q.b[1] - q.a[1], oz = q.b[2] - q.a[2];
      const ol = Math.hypot(ox, oy, oz) || 1;
      const ex = (ox / ol) * back, ey = (oy / ol) * back, ez = (oz / ol) * back;
      const at = (s: number[], e: number[], k: number) =>
        (1 - u) * (1 - u) * s[k] + 2 * u * (1 - u) * (e[k] + (k === 0 ? ex : k === 1 ? ey : ez)) + u * u * e[k];
      const x = this.x, g = this.plugAt;
      for (let k = 0; k < 3; k++) { g[3 * q.i0 + k] = at(q.s0, q.a, k); g[3 * q.i1 + k] = at(q.s1, q.b, k); }
      const off = (i: number, e: number[]) => Math.hypot(x[3 * i] - e[0], x[3 * i + 1] - e[1], x[3 * i + 2] - e[2]);
      if (!finish && (q.t < q.T || ((off(q.i0, q.a) > PLUG_STROKE.seat || off(q.i1, q.b) > PLUG_STROKE.seatBehind) && q.t < q.T + PLUG_STROKE.giveUp))) return true;
      this.plugging[q.i0] = 0; this.plugging[q.i1] = 0;
      this.pin(q.i0, q.a[0], q.a[1], q.a[2]);
      this.pin(q.i1, q.b[0], q.b[1], q.b[2]);
      return false;
    });
  }

  grab(i: number): void {
    this.grabNode = i;
    this.handled[this.cableOf[i]] = 1;
    this.lastHand[this.cableOf[i]] = i;
    this.grabTarget[0] = this.x[3 * i];
    this.grabTarget[1] = this.x[3 * i + 1];
    this.grabTarget[2] = this.x[3 * i + 2];
    this.wakeCable(this.cableOf[i]);
  }

  release(): void {
    if (this.grabNode >= 0) this.wakeCable(this.cableOf[this.grabNode]);
    this.grabNode = -1;
    this.pinchHeld = null;
  }

  /** the other hand takes node i and holds it at (x, y, z) */
  holdStill(i: number, x: number, y: number, z: number): void {
    if (this.holdNode >= 0) this.wakeCable(this.cableOf[this.holdNode]);
    this.holdNode = i;
    this.holdTarget[0] = x; this.holdTarget[1] = y; this.holdTarget[2] = z;
    this.handled[this.cableOf[i]] = 1;
    this.wakeCable(this.cableOf[i]);
  }

  /** the other hand lets go */
  letGoStill(): void {
    if (this.holdNode >= 0) this.wakeCable(this.cableOf[this.holdNode]);
    this.holdNode = -1;
  }

  /**
   * The hand starts pinching the cord it holds (around the hand: it replaces
   * the pinches there), or stops. While it pinches, the pinch takes the shape
   * the cord has and firms up; when it stops, the shape stays.
   */
  pinch(on: boolean): void {
    this.pinchHeld = null;
    const g = this.grabNode;
    if (on && g >= 0) {
      const cb = this.cables[this.cableOf[g]];
      const a = Math.max(cb.start, g - this.P.pinchSpan), b = Math.min(cb.start + cb.count - 1, g + this.P.pinchSpan);
      const p: Pinch = { a, n: b - a + 1, rest: new Array(3 * (b - a + 1)).fill(0), s: this.P.pinchStart, q: [0, 0, 0, 1] };
      this.shapeOf(p);
      this.pinchHeld = p;
      this.setPinches([...this.pinches.filter((o) => o.a > b || o.a + o.n - 1 < a), p]);
    }
    this.pinchChanged = true;
  }

  /**
   * Leads the nodes from `start` towards the given positions (3 per node),
   * each with its weight (0 to 1, 0: let go of it). A soft spring on a leash, like
   * the hand's: the cord follows where it can, and is held back by the
   * cabinet (an animation that draws a cord along a route, never through
   * it). A led node passes through the other cords, rather than carrying
   * them along; let go, it is solid again once clear of them (or after
   * `ghostFrames`, when it pushes them out).
   */
  setGoals(start: number, pos: ArrayLike<number>, w: ArrayLike<number>): void {
    const n = w.length;
    for (let k = 0; k < n; k++) {
      const i = start + k;
      this.goal[3 * i] = pos[3 * k]; this.goal[3 * i + 1] = pos[3 * k + 1]; this.goal[3 * i + 2] = pos[3 * k + 2];
      this.goalW[i] = w[k];
      this.goalTarget(i);
      if (w[k] > 0) { this.ghost[i] = -1; this.handled[this.cableOf[i]] = 1; }
      else if (this.ghost[i] < 0) this.ghost[i] = this.P.ghostFrames;
    }
    if (n > 0) this.wakeCable(this.cableOf[start]);
  }

  /** node i's target from its route goal, or none (until a hand or a plug takes it: see `aim`) */
  private goalTarget(i: number): void {
    const P = this.P, w = this.goalW[i];
    if (w <= 0) { this.targetK[i] = 0; this.targetHeavy[i] = 0; return; }
    this.target[3 * i] = this.goal[3 * i]; this.target[3 * i + 1] = this.goal[3 * i + 1]; this.target[3 * i + 2] = this.goal[3 * i + 2];
    this.targetK[i] = P.goalK * w;
    this.targetLead[i] = P.goalLead;
    this.targetHeavy[i] = 0;
  }

  /** node i is led as by the hand towards t[o..o+2] */
  private handTarget(i: number, t: ArrayLike<number>, o: number): void {
    this.target[3 * i] = t[o]; this.target[3 * i + 1] = t[o + 1]; this.target[3 * i + 2] = t[o + 2];
    this.targetK[i] = this.P.grabK * 4;
    this.targetLead[i] = this.P.grabLead;
    this.targetHeavy[i] = 1;
    this.aimed.push(i);
  }

  /** the nodes the hands and the plugs led go back to their route goal, or to no target */
  protected unaim(): void {
    for (const i of this.aimed) this.goalTarget(i);
    this.aimed.length = 0;
  }

  /**
   * The targets of the game's springs, from where they are now. The nodes
   * the hands or the plugs led go back to their route goal, if any; then the
   * plugs, the other hand and the hand, in that order: on one node, the last
   * of them wins.
   */
  private aim(): void {
    this.unaim();
    for (const q of this.plugs) { this.handTarget(q.i0, this.plugAt, 3 * q.i0); this.handTarget(q.i1, this.plugAt, 3 * q.i1); }
    if (this.holdNode >= 0) this.handTarget(this.holdNode, this.holdTarget, 0);
    if (this.grabNode >= 0) this.handTarget(this.grabNode, this.grabTarget, 0);
  }

  // ---------------------------------------------------------- worker

  snapshot(): RackSnapshot {
    // (the hands and the plugs set their targets again in the worker, at every step)
    this.unaim();
    return {
      ...super.snapshot(), statics: this.shapes, handled: this.handled, lastHand: this.lastHand, goal: this.goal, goalW: this.goalW,
      plugs: this.plugs.map((q) => ({ i0: q.i0, i1: q.i1, a: q.a, b: q.b })),
    };
  }

  restore(s: SimSnapshot): void {
    super.restore(s);
    const r = s as RackSnapshot;
    this.handled.set(r.handled);
    this.lastHand.set(r.lastHand);
    this.goal.set(r.goal);
    this.goalW.set(r.goalW);
    // connectors on their way into a port go on from where they are
    for (const q of r.plugs) this.pinEnd(q.i0, q.i1, q.a, q.b);
  }

  /** the hand, where the pointer has taken it this frame */
  stepInput(): number[] {
    return [this.grabTarget[0], this.grabTarget[1], this.grabTarget[2]];
  }

  setStepInput(t: number[]): void {
    this.grabTarget[0] = t[0]; this.grabTarget[1] = t[1]; this.grabTarget[2] = t[2];
  }

  // ---------------------------------------------------------------- step

  /** start of a step: the strokes, the targets, the cords drawn and kept, the pinch in the making */
  protected prepare(dt: number): void {
    this.strokePlugs(dt);
    this.aim();
    this.markDrawn();
    this.markKept();
    // the pinch the hand is making takes the shape of the cord
    const ph = this.pinchHeld;
    if (ph) {
      if (this.grabNode < 0) this.pinchHeld = null;
      else { this.shapeOf(ph); this.pinchChanged = true; }
    }
  }

  /** fills `firm` and `drawn`, for this step */
  private markDrawn(): void {
    this.firm.fill(0);
    this.drawn.fill(0);
    if (this.grabNode >= 0) {
      const ci = this.cableOf[this.grabNode], c = this.cables[ci];
      this.firm[ci] = 1;
      this.drawn.fill(1, c.start, c.start + c.count);
    }
    for (const q of this.plugs) {
      const ci = this.cableOf[q.i0], c = this.cables[ci], f = PLUG_STROKE.free;
      this.firm[ci] = 1;
      this.drawn.fill(1, Math.max(c.start, q.i0 - f), Math.min(c.start + c.count, q.i0 + f + 1));
    }
  }

  /**
   * Keepers take the awake nodes inside them, of the cords the hand has
   * already taken or a route has laid (a little tolerance: a cord resting on
   * the fingers is on the edge). They draw nothing in: a node must be in.
   * A keeper only takes the nodes near where the hand holds the cord (or
   * last held it), those a route has just laid, and those next to ones it
   * already holds: the kept stretch grows along the cord from the hand, and
   * a loop further down the cord that lies across the channel or swings into
   * it is not taken there, as if the channel had folded the cord in two.
   * They let go of nodes that slid out of an end, of the few nodes around
   * the hand, and of the nodes a route is leading.
   */
  private markKept(): void {
    if (!this.keepers.length) return;
    const P = this.P, x = this.x, g = this.grabNode;
    const held = g >= 0 ? this.cableOf[g] : -1;
    for (let i = 0; i < this.n; i++) {
      if (this.fixed[i] || !this.handled[this.cableOf[i]]) continue;
      const fromHand = this.cableOf[i] === held ? Math.abs(i - g) : Infinity;
      if (fromHand <= P.keepHand || this.goalW[i] > 0 || this.plugging[i]) { this.keepOf[i] = -1; continue; }
      const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2];
      const k = this.keepOf[i];
      if (k >= 0) {
        const b = this.keepers[k];
        if (px < b.min[0] || px > b.max[0]) this.keepOf[i] = -1;
        continue;
      }
      const r = this.radius[i] - P.keepTol;
      const ci = this.cableOf[i], cb = this.cables[ci];
      const lh = this.lastHand[ci];
      const nearHand = (lh >= 0 && Math.abs(i - lh) <= P.keepZip) || this.ghost[i] > 0;
      for (let j = 0; j < this.keepers.length; j++) {
        const b = this.keepers[j];
        if (px < b.min[0] || px > b.max[0]) continue;
        if (!nearHand && (i <= cb.start || this.keepOf[i - 1] !== j) && (i >= cb.start + cb.count - 1 || this.keepOf[i + 1] !== j)) continue;
        if (py >= b.min[1] + r && py <= b.max[1] - r && pz >= b.min[2] + r && pz <= b.max[2] - r) { this.keepOf[i] = j; break; }
      }
    }
  }

  /**
   * The pull of its keeper on a kept node, in the solve, so that the solve
   * itself carries the cord hanging from the kept part (rather than `keep`
   * putting the nodes back after it, against the solve: the cord stretched,
   * and sprang back when let go).
   */
  protected nodeTerm(i: number, holder: number, mh: number, s: NodeSystem): void {
    const b = this.keepers[holder], r = this.radius[i];
    const kk = this.P.keepK * mh;
    const yi = this.x[3 * i + 1], zi = this.x[3 * i + 2];
    const ylo = b.min[1] + r, yhi = b.max[1] - r, zlo = b.min[2] + r, zhi = b.max[2] - r;
    let ey = 0, ez = 0;
    if (!this.drawn[i]) {
      // in it: a stiff one-sided pull back within its height and depth
      ey = yi < ylo ? yi - ylo : yi > yhi ? yi - yhi : 0;
      ez = zi < zlo ? zi - zlo : zi > zhi ? zi - zhi : 0;
    } else {
      // in it, on the cord in hand: only held up, so that the hand can
      // still draw it out (see `keep`)
      ey = yi < ylo ? yi - ylo : 0;
    }
    if (ey !== 0) { s.gy += kk * ey; s.h11 += kk; }
    if (ez !== 0) { s.gz += kk * ez; s.h22 += kk; }
  }

  /**
   * Around the length passes of a substep: the kept nodes are put back
   * within the height and depth of their keeper. One of the held cord pulled
   * out further than `keepPeel` in a substep — the hand drawing it out, not
   * its own weight — comes free.
   */
  protected keepHeld(h: number): void {
    if (!this.keepers.length) return;
    const x = this.x, P = this.P;
    const peel = P.keepPeel * (h / (P.dt / P.refSubsteps));
    for (let q = 0; q < this.nAwake; q++) {
      const cb = this.cables[this.awake[q]];
      for (let i = cb.start; i < cb.start + cb.count; i++) {
        const k = this.keepOf[i];
        if (k < 0 || this.fixed[i]) continue;
        const b = this.keepers[k], r = this.radius[i];
        const y = x[3 * i + 1], z = x[3 * i + 2];
        const cy = Math.min(Math.max(y, b.min[1] + r), b.max[1] - r);
        const cz = Math.min(Math.max(z, b.min[2] + r), b.max[2] - r);
        if (cy === y && cz === z) continue;
        const d = Math.hypot(cy - y, cz - z);
        if (this.drawn[i] && d > peel) { this.keepOf[i] = -1; continue; }
        x[3 * i + 1] = cy; x[3 * i + 2] = cz;
      }
    }
  }
}
