// Cable dynamics with Augmented Vertex Block Descent (Giles, Diaz, Yuksel,
// SIGGRAPH 2025), in the spirit of the 2D engine of the AVBD course project.
//
// A cable is a chain of nodes (point masses). Every substep:
//   1. contacts are found once, at the start, with a speculative margin that
//      grows with the speed of the segments (so fast cables do not tunnel);
//   2. each free node jumps to its inertial prediction x̃ = x + h v + h² g;
//   3. Gauss-Seidel sweeps solve, node by node, the 3x3 system
//        (M/h² + Σ k ∇C∇Cᵀ) Δx = −(M/h² (x − x̃) + Σ (k C + λ) ∇C)
//      over the constraints that touch the node;
//   4. after every sweep, the dual update: λ absorbs the force the penalty is
//      still supplying, and the contact stiffness k climbs where it is needed.
//   5. v = (x − x_start) / h.
//
// Hard constraints (λ + rising k): stretch (inextensible cable), contacts
// (cable–cable segment capsules and cable–rack geometry, one-sided) and their
// friction (a tangential λ clamped to the Coulomb cone, §3.3 of the paper).
// The multipliers are carried from substep to substep, so that a loaded
// contact or a taut cord keeps its force instead of rebuilding it by sinking.
// Soft energies: bending (second difference), the hand that drags a cable
// and the velcro straps.
//
// Cables at rest fall asleep (their nodes are frozen and act as static
// geometry for the others) and wake when something awake touches them.

import { boxHit, closest, segBox, segSeg, solveSym3, sol } from './geom';

export interface StaticCapsule {
  kind: 'capsule';
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r: number;
  /** a gate lets the part of the cable held by the hand pass through it */
  gate?: boolean;
  owner?: number;
  mu?: number;
}

export interface StaticBox {
  kind: 'box';
  min: [number, number, number];
  max: [number, number, number];
  gate?: boolean;
  owner?: number;
  mu?: number;
}

export type StaticShape = StaticCapsule | StaticBox;

export interface CableInit {
  /** node positions, xyz interleaved */
  points: ArrayLike<number>;
  radius: number;
  /** mass of one node (kg); end nodes (connectors) get `endMass` */
  mass?: number;
  endMass?: number;
  bend?: number;
}

export interface SimParams {
  dt: number;
  substeps: number;
  iterations: number;
  gravity: number;
  /** stretch stiffness, in multiples of M/h² */
  stretch: number;
  /** contact stiffness: starting value and ceiling (× M/h²), growth (× M/h² per metre of violation) */
  kMin: number;
  kCap: number;
  beta: number;
  gamma: number;
  /** fraction of an existing overlap forgiven per substep (gentle de-penetration) */
  alpha: number;
  /** same, for the stretch constraints */
  alphaS: number;
  /** contact multipliers carried to the next substep (×) */
  lamWarm: number;
  /** stretch multipliers carried to the next substep (×) */
  lamWarmS: number;
  /** remove the separating velocity left by contact push-outs */
  contactVelocity: boolean;
  /** fraction of the sliding velocity of a pushing contact removed per substep */
  contactDamping: number;
  /** speed (m/s) removed per substep from nodes resting on a contact */
  restFriction: number;
  /** cable–cable and cable–rack Coulomb friction */
  muCable: number;
  muStatic: number;
  /** linear air drag (1/s) */
  drag: number;
  /** speculative contact margin (m), plus a speed-dependent part */
  margin: number;
  marginCap: number;
  /** same ceiling against the rack, whose contacts are few and cheap */
  marginStatic: number;
  /** clamp of one block solve's displacement (m) */
  maxMove: number;
  /** stiffness of the hand (× M/h²) */
  grabK: number;
  /**
   * Leash of the hand (m): the held node is pulled towards the hand from at
   * most this far, so a cord caught on something is never stretched like an
   * elastic (and does not snap back when let go).
   */
  grabLead: number;
  /** inextensibility passes after the solve (position projection along each cord) */
  pbdPasses: number;
  /**
   * Coulomb friction with anchors kept from frame to frame: a contact sticks
   * until the tangential force reaches μ·N, then slides. Without it the
   * friction restarts every substep and a loaded cord creeps forever.
   */
  anchoredFriction: boolean;
  /** stiffness of the friction anchors (× M/h²) */
  frictionK: number;
  /**
   * Friction as a hard constraint (AVBD §3.3): a tangential multiplier holds
   * the contact on its anchor, clamped to the cone μ·λn; the anchor only
   * moves when the contact slides. Otherwise a spring of stiffness frictionK.
   */
  hardFriction: boolean;
  /** the most an overlap is undone per substep (m): a soft way out instead of a kick */
  maxDepen: number;
  /** nodes of the held cable on each side of the hand that ignore gates (−1: all of it) */
  gateSpan: number;
  /** a cable whose nodes all stay within sleepDist (m) for sleepTime (s) falls asleep */
  sleepDist: number;
  sleepTime: number;
  wakeSpeed: number;
}

export function defaultSimParams(p: Partial<SimParams> = {}): SimParams {
  return {
    dt: 1 / 60, substeps: 3, iterations: 6, gravity: -9.81,
    stretch: 10, kMin: 0.05, kCap: 2, beta: 2000, gamma: 0.99, alpha: 0.25, alphaS: 0.3, lamWarm: 0.8, lamWarmS: 0.8, contactVelocity: true, contactDamping: 0.3, restFriction: 0.012,
    muCable: 0.3, muStatic: 0.4, drag: 2.5,
    margin: 0.0015, marginCap: 0.008, marginStatic: 0.03, maxMove: 0.012,
    grabK: 0.4, grabLead: 0.06, pbdPasses: 4, maxDepen: 0.001, gateSpan: -1, anchoredFriction: true, frictionK: 0.3, hardFriction: true,
    sleepDist: 0.006, sleepTime: 0.5, wakeSpeed: 0.1,
    ...p,
  };
}

export interface CableInfo {
  start: number;
  count: number;
  radius: number;
  asleep: boolean;
  calm: number;
}

const FRICTION_K = { start: 0.05, growth: 3, max: 1.5 }; // × M/h²

export class CableSim {
  P: SimParams;
  n = 0;
  x = new Float64Array(0);
  x0 = new Float64Array(0);
  xt = new Float64Array(0);
  v = new Float64Array(0);
  mass = new Float64Array(0);
  pinned = new Uint8Array(0);
  fixed = new Uint8Array(0);
  cableOf = new Int32Array(0);
  /** node i is linked to node i + 1 */
  segOK = new Uint8Array(0);
  rest = new Float64Array(0);
  lam = new Float64Array(0);
  segK = new Float64Array(0);
  segC0 = new Float64Array(0);
  bendK = new Float64Array(0);
  radius = new Float64Array(0);
  gateFree = new Uint8Array(0);
  /** segments let go across a gate: they pass through it until they are clear of it */
  gateHold = new Uint8Array(0);
  private gateAcross = new Uint8Array(0);
  private sleepRef = new Float64Array(0);
  cables: CableInfo[] = [];

  // contacts (structure of arrays, grown on demand)
  nc = 0;
  private cap = 0;
  ca0 = new Int32Array(0); ca1 = new Int32Array(0);
  cb0 = new Int32Array(0); cb1 = new Int32Array(0);
  cs = new Float64Array(0); ct = new Float64Array(0);
  cn = new Float64Array(0); cq = new Float64Array(0);
  crs = new Float64Array(0); cc0 = new Float64Array(0);
  ck = new Float64Array(0); clam = new Float64Array(0);
  ckt = new Float64Array(0); cmu = new Float64Array(0); ckmax = new Float64Array(0);
  ckey = new Float64Array(0);
  /** friction anchor of each contact: pA − pB (or pA against the rack) where it last stuck */
  canc = new Float64Array(0);
  /** tangential multiplier of each contact (hard friction) */
  clt = new Float64Array(0);
  // the previous frame's contacts, for warm starts and friction anchors
  private prevK = new Float64Array(0);
  private prevLam = new Float64Array(0);
  private prevAnc = new Float64Array(0);
  private prevLt = new Float64Array(0);
  private prevS = new Float64Array(0);
  private prevT = new Float64Array(0);
  /** contact key → its index in the previous frame's arrays */
  private warm = new Map<number, number>();

  // node → contacts adjacency (CSR)
  private adjStart = new Int32Array(0);
  private adjC = new Int32Array(0);
  private adjW = new Float64Array(0);

  // broadphase
  private segCell = new Int32Array(0);
  private hashCount = new Int32Array(0);
  private hashItems = new Int32Array(0);
  private hashCells = 0;
  private segSpeed = new Float64Array(0);
  protected statics: StaticShape[] = [];
  private staticGrid = new Map<number, number[]>();
  private readonly SCELL = 0.05;

  // hand
  grabNode = -1;
  grabTarget = [0, 0, 0];

  // velcro
  bundleOf = new Int32Array(0);
  bundles: { nodes: number[]; r: number; cx: number; cy: number; cz: number; alive: boolean }[] = [];

  stats = { contacts: 0, awake: 0, ms: 0 };
  private flip = false;

  constructor(params: Partial<SimParams> = {}) {
    this.P = defaultSimParams(params);
  }

  // ------------------------------------------------------------ building

  build(defs: CableInit[]): number[] {
    let total = 0;
    for (const d of defs) total += d.points.length / 3;
    this.n = total;
    const N = total;
    this.x = new Float64Array(3 * N);
    this.x0 = new Float64Array(3 * N);
    this.xt = new Float64Array(3 * N);
    this.v = new Float64Array(3 * N);
    this.mass = new Float64Array(N);
    this.pinned = new Uint8Array(N);
    this.fixed = new Uint8Array(N);
    this.cableOf = new Int32Array(N);
    this.segOK = new Uint8Array(N);
    this.rest = new Float64Array(N);
    this.lam = new Float64Array(N);
    this.segK = new Float64Array(N);
    this.segC0 = new Float64Array(N);
    this.bendK = new Float64Array(N);
    this.radius = new Float64Array(N);
    this.gateFree = new Uint8Array(N);
    this.gateHold = new Uint8Array(N);
    this.gateAcross = new Uint8Array(N);
    this.bundleOf = new Int32Array(N).fill(-1);
    this.adjStart = new Int32Array(N + 1);
    this.segCell = new Int32Array(N * 3);
    this.cables = [];
    this.bundles = [];
    this.warm.clear();
    const starts: number[] = [];
    let at = 0;
    defs.forEach((d, ci) => {
      const cnt = d.points.length / 3;
      starts.push(at);
      for (let k = 0; k < cnt; k++) {
        const i = at + k;
        this.x[3 * i] = d.points[3 * k];
        this.x[3 * i + 1] = d.points[3 * k + 1];
        this.x[3 * i + 2] = d.points[3 * k + 2];
        const end = k < 2 || k >= cnt - 2;
        this.mass[i] = end ? d.endMass ?? 0.004 : d.mass ?? 0.001;
        this.cableOf[i] = ci;
        this.radius[i] = d.radius;
        // the boot of the connector is much stiffer than the cord
        const edge = Math.min(k, cnt - 1 - k);
        const b = d.bend ?? 1;
        this.bendK[i] = edge <= 2 ? b * 3 : edge <= 4 ? b * 1.8 : b;
        if (k < cnt - 1) {
          this.segOK[i] = 1;
          const dx = d.points[3 * k + 3] - d.points[3 * k];
          const dy = d.points[3 * k + 4] - d.points[3 * k + 1];
          const dz = d.points[3 * k + 5] - d.points[3 * k + 2];
          this.rest[i] = Math.hypot(dx, dy, dz);
        }
      }
      this.cables.push({ start: at, count: cnt, radius: d.radius, asleep: false, calm: 0 });
      at += cnt;
    });
    this.x0.set(this.x);
    this.xt.set(this.x);
    this.sleepRef = Float64Array.from(this.x);
    const hc = 1 << Math.ceil(Math.log2(Math.max(64, N * 2)));
    this.hashCells = hc;
    this.hashCount = new Int32Array(hc + 1);
    this.hashItems = new Int32Array(N);
    return starts;
  }

  setStatics(shapes: StaticShape[]): void {
    this.statics = shapes;
    this.staticGrid.clear();
    const pad = 0.05; // half a segment, a radius and the static margin
    const C = this.SCELL;
    shapes.forEach((s, id) => {
      let x0: number, y0: number, z0: number, x1: number, y1: number, z1: number;
      if (s.kind === 'capsule') {
        x0 = Math.min(s.ax, s.bx) - s.r; x1 = Math.max(s.ax, s.bx) + s.r;
        y0 = Math.min(s.ay, s.by) - s.r; y1 = Math.max(s.ay, s.by) + s.r;
        z0 = Math.min(s.az, s.bz) - s.r; z1 = Math.max(s.az, s.bz) + s.r;
      } else {
        [x0, y0, z0] = s.min; [x1, y1, z1] = s.max;
      }
      const ix0 = Math.floor((x0 - pad) / C), ix1 = Math.floor((x1 + pad) / C);
      const iy0 = Math.floor((y0 - pad) / C), iy1 = Math.floor((y1 + pad) / C);
      const iz0 = Math.floor((z0 - pad) / C), iz1 = Math.floor((z1 + pad) / C);
      for (let ix = ix0; ix <= ix1; ix++)
        for (let iy = iy0; iy <= iy1; iy++)
          for (let iz = iz0; iz <= iz1; iz++) {
            const key = cellKey(ix, iy, iz);
            let list = this.staticGrid.get(key);
            if (!list) { list = []; this.staticGrid.set(key, list); }
            list.push(id);
          }
    });
    this.wakeAll();
  }

  // ------------------------------------------------------------- control

  /** puts the nodes from `start` at the given positions, at rest */
  moveNodes(start: number, pos: ArrayLike<number>): void {
    const n = pos.length / 3;
    for (let k = 0; k < n; k++) {
      const i = start + k;
      for (let d = 0; d < 3; d++) {
        this.x[3 * i + d] = pos[3 * k + d];
        this.x0[3 * i + d] = pos[3 * k + d];
        this.xt[3 * i + d] = pos[3 * k + d];
        this.v[3 * i + d] = 0;
      }
      this.sleepRef[3 * i] = 1e9; // "moved": it must not fall asleep mid-air
      if (i < this.n) this.lam[i] = 0;
    }
    this.nc = 0;
    this.wakeAll();
  }

  /** puts every free node at the given positions, at rest (pins keep theirs) */
  teleport(pos: ArrayLike<number>): void {
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      for (let d = 0; d < 3; d++) this.x[3 * i + d] = pos[3 * i + d];
    }
    this.x0.set(this.x);
    this.xt.set(this.x);
    this.sleepRef.set(this.x);
    this.v.fill(0);
    this.lam.fill(0);
    this.nc = 0;
    this.wakeAll();
  }

  wakeAll(): void {
    for (const c of this.cables) { c.asleep = false; c.calm = 0; }
  }

  wakeCable(ci: number): void {
    const c = this.cables[ci];
    if (c.asleep) { c.asleep = false; c.calm = 0; }
    c.calm = 0;
  }

  pin(i: number, x: number, y: number, z: number): void {
    this.pinned[i] = 1;
    this.x[3 * i] = x; this.x[3 * i + 1] = y; this.x[3 * i + 2] = z;
    this.x0[3 * i] = x; this.x0[3 * i + 1] = y; this.x0[3 * i + 2] = z;
    this.v[3 * i] = 0; this.v[3 * i + 1] = 0; this.v[3 * i + 2] = 0;
    this.wakeCable(this.cableOf[i]);
  }

  unpin(i: number): void {
    this.pinned[i] = 0;
    this.wakeCable(this.cableOf[i]);
  }

  grab(i: number): void {
    this.grabNode = i;
    this.grabTarget[0] = this.x[3 * i];
    this.grabTarget[1] = this.x[3 * i + 1];
    this.grabTarget[2] = this.x[3 * i + 2];
    this.wakeCable(this.cableOf[i]);
  }

  release(): void {
    if (this.grabNode >= 0) this.wakeCable(this.cableOf[this.grabNode]);
    this.grabNode = -1;
  }

  /** Straps the given nodes together (velcro): each stays within r of their centre. */
  addBundle(nodes: number[], r: number): number {
    const id = this.bundles.length;
    const ok = nodes.filter((i) => this.bundleOf[i] < 0);
    this.bundles.push({ nodes: ok, r, cx: 0, cy: 0, cz: 0, alive: true });
    for (const i of ok) { this.bundleOf[i] = id; this.wakeCable(this.cableOf[i]); }
    return id;
  }

  removeBundle(id: number): void {
    const b = this.bundles[id];
    if (!b || !b.alive) return;
    b.alive = false;
    for (const i of b.nodes) { this.bundleOf[i] = -1; this.wakeCable(this.cableOf[i]); }
  }

  // ---------------------------------------------------------------- step

  step(): void {
    const t0 = performance.now();
    const P = this.P;
    const h = P.dt / P.substeps;
    this.markGateFree();
    // Contacts are found once per frame, with a speculative margin covering
    // the motion of the whole frame, then kept for all substeps.
    this.refreshFixed();
    this.collide(h, P.dt);
    this.refreshFixed();
    this.buildAdjacency();
    for (let s = 0; s < P.substeps; s++) this.substep(h);
    this.updateSleep();
    this.stats.ms = performance.now() - t0;
  }

  /**
   * Gates (duct fingers, manager tips, ring fronts) let the cord in hand
   * through — all of it, so that the part trailing behind the hand follows
   * it into a manager. A segment let go while still across a gate keeps
   * passing through it until it has slipped free, rather than being kicked
   * to one side.
   */
  private markGateFree(): void {
    this.gateFree.fill(0);
    const g = this.grabNode;
    if (g < 0) return;
    const c = this.cables[this.cableOf[g]];
    const span = this.P.gateSpan;
    const a = span < 0 ? c.start : Math.max(c.start, g - span);
    const b = span < 0 ? c.start + c.count - 1 : Math.min(c.start + c.count - 1, g + span);
    for (let i = a; i <= b; i++) { this.gateFree[i] = 1; this.gateHold[i] = 1; }
  }

  private substep(h: number): void {
    const P = this.P;
    const N = this.n;
    const x = this.x, x0 = this.x0, xt = this.xt, v = this.v;
    // contacts: separation at the start of the substep (α stabilisation), λ rebuilt
    for (let c = 0; c < this.nc; c++) { this.cc0[c] = this.contactC(c); this.clam[c] *= P.lamWarm; if (!P.anchoredFriction) this.ckt[c] = FRICTION_K.start; }
    if (P.hardFriction) for (let k = 0; k < 3 * this.nc; k++) this.clt[k] *= P.lamWarm;
    // bundles hold on to the centre of their nodes at the start of the substep
    for (const b of this.bundles) {
      if (!b.alive || b.nodes.length === 0) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const i of b.nodes) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
      b.cx = cx / b.nodes.length; b.cy = cy / b.nodes.length; b.cz = cz / b.nodes.length;
    }
    // inertial prediction
    const gy = P.gravity * h * h;
    for (let i = 0; i < N; i++) {
      const j = 3 * i;
      x0[j] = x[j]; x0[j + 1] = x[j + 1]; x0[j + 2] = x[j + 2];
      if (this.fixed[i]) { xt[j] = x[j]; xt[j + 1] = x[j + 1]; xt[j + 2] = x[j + 2]; continue; }
      xt[j] = x[j] + h * v[j];
      xt[j + 1] = x[j + 1] + h * v[j + 1] + gy;
      xt[j + 2] = x[j + 2] + h * v[j + 2];
      x[j] = xt[j]; x[j + 1] = xt[j + 1]; x[j + 2] = xt[j + 2];
    }
    // warm start of the stretch constraints (AVBD: λ ← αγλ, k ← γk) and
    // their error at the start of the substep, for the stabilisation
    const mh = 1 / (h * h);
    for (let s = 0; s < N; s++) {
      if (!this.segOK[s]) continue;
      const m = Math.max(this.mass[s], this.mass[s + 1]) * mh;
      this.lam[s] *= P.lamWarmS * P.gamma;
      this.segK[s] = Math.min(P.stretch * m, Math.max(P.kMin * m, this.segK[s] * P.gamma));
      const dx = x0[3 * s] - x0[3 * s + 3], dy = x0[3 * s + 1] - x0[3 * s + 4], dz = x0[3 * s + 2] - x0[3 * s + 5];
      this.segC0[s] = Math.sqrt(dx * dx + dy * dy + dz * dz) - this.rest[s];
    }
    for (let it = 0; it < P.iterations; it++) {
      this.flip = !this.flip;
      if (this.flip) for (let i = 0; i < N; i++) { if (!this.fixed[i]) this.solveNode(i, h); }
      else for (let i = N - 1; i >= 0; i--) { if (!this.fixed[i]) this.solveNode(i, h); }
      this.dualUpdate(h);
    }
    if (P.anchoredFriction && !P.hardFriction) this.updateAnchors(h);
    for (let k = 0; k < P.pbdPasses; k++) this.inextensible(k % 2 === 0);
    const damp = 1 / (1 + P.drag * h);
    const ih = 1 / h;
    for (let i = 0; i < N; i++) {
      const j = 3 * i;
      if (this.fixed[i]) { v[j] = 0; v[j + 1] = 0; v[j + 2] = 0; continue; }
      v[j] = (x[j] - x0[j]) * ih * damp;
      v[j + 1] = (x[j + 1] - x0[j + 1]) * ih * damp;
      v[j + 2] = (x[j + 2] - x0[j + 2]) * ih * damp;
    }
    if (P.contactVelocity) this.contactVelocities();
    // rest friction: a node pressed against something and barely moving stops
    // (the static friction a few sweeps cannot resolve), anything faster only
    // loses that much speed
    if (P.restFriction > 0) {
      const vs = P.restFriction;
      for (let i = 0; i < N; i++) {
        if (this.fixed[i] || this.adjStart[i + 1] === this.adjStart[i]) continue;
        let pressed = false;
        for (let e = this.adjStart[i]; e < this.adjStart[i + 1]; e++) if (this.clam[this.adjC[e]] < 0) { pressed = true; break; }
        if (!pressed) continue;
        const j = 3 * i;
        const sp = Math.sqrt(v[j] * v[j] + v[j + 1] * v[j + 1] + v[j + 2] * v[j + 2]);
        const f = sp > vs ? 1 - vs / sp : 0;
        v[j] *= f; v[j + 1] *= f; v[j + 2] *= f;
      }
    }
  }

  /**
   * v = Δx / h turns every push-out of a resting contact into a small upward
   * velocity: each substep gravity sinks the cable a little, the contact lifts
   * it back, and the pile never stops shimmering. A post-pass removes the
   * separating normal velocity of the contacts that pushed (λ < 0), with no
   * restitution, as position-based solvers do.
   */
  private contactVelocities(): void {
    const v = this.v;
    const P = this.P;
    for (let pass = 0; pass < 2; pass++) {
      for (let c = 0; c < this.nc; c++) {
        if (this.clam[c] >= 0 && this.contactC(c) > 0) continue;
        const nx = this.cn[3 * c], ny = this.cn[3 * c + 1], nz = this.cn[3 * c + 2];
        const s = this.cs[c], t = this.ct[c];
        const a0 = this.ca0[c], a1 = this.ca1[c], b0 = this.cb0[c], b1 = this.cb1[c];
        const ws0 = 1 - s, ws1 = s, wt0 = -(1 - t), wt1 = -t;
        let vn = 0, denom = 0;
        if (!this.fixed[a0]) { vn += ws0 * (v[3 * a0] * nx + v[3 * a0 + 1] * ny + v[3 * a0 + 2] * nz); denom += ws0 * ws0 / this.mass[a0]; }
        if (!this.fixed[a1]) { vn += ws1 * (v[3 * a1] * nx + v[3 * a1 + 1] * ny + v[3 * a1 + 2] * nz); denom += ws1 * ws1 / this.mass[a1]; }
        if (b0 >= 0) {
          if (!this.fixed[b0]) { vn += wt0 * (v[3 * b0] * nx + v[3 * b0 + 1] * ny + v[3 * b0 + 2] * nz); denom += wt0 * wt0 / this.mass[b0]; }
          if (!this.fixed[b1]) { vn += wt1 * (v[3 * b1] * nx + v[3 * b1 + 1] * ny + v[3 * b1 + 2] * nz); denom += wt1 * wt1 / this.mass[b1]; }
        }
        if (denom <= 0) continue;
        // relative velocity of the two contact points
        let rx = 0, ry = 0, rz = 0;
        const acc = (i: number, w: number) => {
          if (i < 0 || this.fixed[i]) return;
          rx += w * v[3 * i]; ry += w * v[3 * i + 1]; rz += w * v[3 * i + 2];
        };
        acc(a0, ws0); acc(a1, ws1); acc(b0, wt0); acc(b1, wt1);
        const imp = vn > 0 ? -vn / denom : 0;
        // and a share of the sliding velocity, as kinetic friction would
        const tx = rx - vn * nx, ty = ry - vn * ny, tz = rz - vn * nz;
        const td = P.contactDamping / denom;
        const apply = (i: number, w: number) => {
          if (i < 0 || this.fixed[i]) return;
          const f = (w * imp) / this.mass[i];
          const g = (w * td) / this.mass[i];
          v[3 * i] += f * nx - g * tx; v[3 * i + 1] += f * ny - g * ty; v[3 * i + 2] += f * nz - g * tz;
        };
        if (vn > 0 || td > 0) { apply(a0, ws0); apply(a1, ws1); apply(b0, wt0); apply(b1, wt1); }
      }
    }
  }

  private refreshFixed(): void {
    for (let ci = 0; ci < this.cables.length; ci++) {
      const c = this.cables[ci];
      const f = c.asleep ? 1 : 0;
      for (let i = c.start; i < c.start + c.count; i++) this.fixed[i] = f | this.pinned[i];
    }
  }

  // ------------------------------------------------------------- solving

  private solveNode(i: number, h: number): void {
    const P = this.P;
    const x = this.x;
    const j = 3 * i;
    const xi = x[j], yi = x[j + 1], zi = x[j + 2];
    const m = this.mass[i];
    const ih2 = 1 / (h * h);
    const a = m * ih2;
    let gx = a * (xi - this.xt[j]);
    let gy = a * (yi - this.xt[j + 1]);
    let gz = a * (zi - this.xt[j + 2]);
    let h00 = a, h11 = a, h22 = a, h01 = 0, h02 = 0, h12 = 0;

    // --- stretch (hard: k fixed, λ carries the tension)
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? i - 1 : i;
      if (s < 0 || !this.segOK[s]) continue;
      const o = side === 0 ? i - 1 : i + 1;
      const dx = xi - x[3 * o], dy = yi - x[3 * o + 1], dz = zi - x[3 * o + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const k = this.segK[s];
      const C = len - this.rest[s] - P.alphaS * this.segC0[s];
      const f = k * C + this.lam[s];
      gx += f * ux; gy += f * uy; gz += f * uz;
      // Gauss-Newton term + |f|/len (I − uuᵀ): the geometric stiffness kept
      // positive, which steadies a taut cable bent around a hook
      const geo = (globalThis as any).NOGEO ? 0 : Math.abs(f) / len;
      const kk = k - geo;
      h00 += kk * ux * ux + geo; h11 += kk * uy * uy + geo; h22 += kk * uz * uz + geo;
      h01 += kk * ux * uy; h02 += kk * ux * uz; h12 += kk * uy * uz;
    }

    // --- bending: E = kb/2 |x[c−1] − 2x[c] + x[c+1]|² for the three stencils around i
    for (let c = i - 1; c <= i + 1; c++) {
      if (c - 1 < 0 || c + 1 >= this.n) continue;
      if (!this.segOK[c - 1] || !this.segOK[c]) continue;
      const kb = this.bendK[c] * ((globalThis as any).BEND ?? 1);
      const w = c === i ? -2 : 1;
      const dx = x[3 * c - 3] - 2 * x[3 * c] + x[3 * c + 3];
      const dy = x[3 * c - 2] - 2 * x[3 * c + 1] + x[3 * c + 4];
      const dz = x[3 * c - 1] - 2 * x[3 * c + 2] + x[3 * c + 5];
      gx += kb * w * dx; gy += kb * w * dy; gz += kb * w * dz;
      const hh = kb * w * w;
      h00 += hh; h11 += hh; h22 += hh;
    }

    // --- contacts
    for (let e = this.adjStart[i]; e < this.adjStart[i + 1]; e++) {
      const c = this.adjC[e];
      const w = this.adjW[e];
      const nx = this.cn[3 * c], ny = this.cn[3 * c + 1], nz = this.cn[3 * c + 2];
      const C = this.contactC(c) - this.forgive(c);
      const k = this.ck[c];
      const f = k * C + this.clam[c];
      if (f >= 0) continue;
      gx += f * w * nx; gy += f * w * ny; gz += f * w * nz;
      const kw = k * w * w;
      h00 += kw * nx * nx; h11 += kw * ny * ny; h22 += kw * nz * nz;
      h01 += kw * nx * ny; h02 += kw * nx * nz; h12 += kw * ny * nz;
      // friction: tangential drift of the contact since the substep began
      const mu = this.cmu[c];
      if (mu <= 0) continue;
      if (P.anchoredFriction) {
        this.contactRel(c);
        drift.x -= this.canc[3 * c]; drift.y -= this.canc[3 * c + 1]; drift.z -= this.canc[3 * c + 2];
      } else this.contactDrift(c);
      let dx = drift.x, dy = drift.y, dz = drift.z;
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lim = mu * -f;
      let ke: number;
      if (P.hardFriction) {
        // λt + kt·d, clamped to the cone (stiffness rescaled for the Hessian)
        const kt = this.ckt[c] * this.ckmax[c] / P.kCap;
        const lx = this.clt[3 * c], ly = this.clt[3 * c + 1], lz = this.clt[3 * c + 2];
        const ln = lx * nx + ly * ny + lz * nz;
        let Fx = kt * dx + lx - ln * nx, Fy = kt * dy + ly - ln * ny, Fz = kt * dz + lz - ln * nz;
        const F = Math.sqrt(Fx * Fx + Fy * Fy + Fz * Fz);
        ke = kt;
        if (F > lim) { const sc = lim / F; Fx *= sc; Fy *= sc; Fz *= sc; ke = kt * sc; }
        gx += Fx * w; gy += Fy * w; gz += Fz * w;
      } else {
        const kt = this.ckt[c] * ih2 * m;
        let ft = kt * dl;
        ke = kt;
        if (ft > lim) { ft = lim; ke = dl > 1e-12 ? lim / dl : 0; }
        if (dl > 1e-12) {
          const sc = (ft / dl) * w;
          gx += sc * dx; gy += sc * dy; gz += sc * dz;
        }
      }
      const kt2 = ke * w * w;
      h00 += kt2 * (1 - nx * nx); h11 += kt2 * (1 - ny * ny); h22 += kt2 * (1 - nz * nz);
      h01 -= kt2 * nx * ny; h02 -= kt2 * nx * nz; h12 -= kt2 * ny * nz;
    }

    // --- hand
    if (i === this.grabNode) {
      const kg = P.grabK * ih2 * m * 4;
      let ex = xi - this.grabTarget[0], ey = yi - this.grabTarget[1], ez = zi - this.grabTarget[2];
      const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (el > P.grabLead) { const f = P.grabLead / el; ex *= f; ey *= f; ez *= f; }
      gx += kg * ex;
      gy += kg * ey;
      gz += kg * ez;
      h00 += kg; h11 += kg; h22 += kg;
    }

    // --- velcro
    const bi = this.bundleOf[i];
    if (bi >= 0) {
      const b = this.bundles[bi];
      const dx = xi - b.cx, dy = yi - b.cy, dz = zi - b.cz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const C = len - b.r;
      if (C > 0 && len > 1e-9) {
        const kb = 0.3 * ih2 * m;
        const ux = dx / len, uy = dy / len, uz = dz / len;
        gx += kb * C * ux; gy += kb * C * uy; gz += kb * C * uz;
        h00 += kb * ux * ux; h11 += kb * uy * uy; h22 += kb * uz * uz;
        h01 += kb * ux * uy; h02 += kb * ux * uz; h12 += kb * uy * uz;
      }
    }

    solveSym3(h00, h01, h02, h11, h12, h22, -gx, -gy, -gz);
    let dx = sol.x, dy = sol.y, dz = sol.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(L < 1e9)) return; // NaN guard
    if (L > P.maxMove) { const f = P.maxMove / L; dx *= f; dy *= f; dz *= f; }
    x[j] = xi + dx; x[j + 1] = yi + dy; x[j + 2] = zi + dz;
  }

  /**
   * Position projection of the segment lengths (PBD), one sweep along every
   * cord: what the block descent leaves of a stretch under load (a heap, the
   * hand) is taken out here. Pins and sleeping nodes do not move; the hand's
   * node is heavy, so the cord follows it rather than the opposite.
   */
  private inextensible(forward: boolean): void {
    const x = this.x;
    const N = this.n;
    const w = (i: number) => (this.fixed[i] ? 0 : i === this.grabNode ? 0.1 / this.mass[i] : 1 / this.mass[i]);
    for (let k = 0; k < N; k++) {
      const s = forward ? k : N - 1 - k;
      if (!this.segOK[s]) continue;
      const wa = w(s), wb = w(s + 1);
      if (wa + wb === 0) continue;
      const a = 3 * s, b = a + 3;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-9) continue;
      const corr = (L - this.rest[s]) / (L * (wa + wb));
      x[a] += dx * corr * wa; x[a + 1] += dy * corr * wa; x[a + 2] += dz * corr * wa;
      x[b] -= dx * corr * wb; x[b + 1] -= dy * corr * wb; x[b + 2] -= dz * corr * wb;
    }
  }

  private dualUpdate(h: number): void {
    const P = this.P;
    const x = this.x;
    const N = this.n;
    const ih2 = 1 / (h * h);
    for (let s = 0; s < N; s++) {
      if (!this.segOK[s]) continue;
      if (this.fixed[s] && this.fixed[s + 1]) continue;
      const dx = x[3 * s] - x[3 * s + 3], dy = x[3 * s + 1] - x[3 * s + 4], dz = x[3 * s + 2] - x[3 * s + 5];
      const C = Math.sqrt(dx * dx + dy * dy + dz * dz) - this.rest[s] - P.alphaS * this.segC0[s];
      this.lam[s] += this.segK[s] * C;
      const kmax = P.stretch * Math.max(this.mass[s], this.mass[s + 1]) * ih2;
      this.segK[s] = Math.min(kmax, this.segK[s] + P.beta * Math.abs(C) * kmax / P.stretch);
    }
    for (let c = 0; c < this.nc; c++) {
      const C = this.contactC(c) - this.forgive(c);
      if (Math.abs(C) < 1e-7) continue;
      const lam = Math.min(0, this.clam[c] + this.ck[c] * C);
      this.clam[c] = lam;
      if (lam < 0) this.ck[c] = Math.min(this.ckmax[c], this.ck[c] + P.beta * Math.abs(C) * this.ckmax[c] / P.kCap);
      if (!P.anchoredFriction) this.ckt[c] = Math.min(FRICTION_K.max, this.ckt[c] * FRICTION_K.growth);
    }
    if (P.hardFriction) this.frictionDual();
  }

  /**
   * Dual update of the friction (AVBD §3.3): the tangential multiplier takes
   * over the force of the anchor spring; past the cone μ·λn it is clamped and
   * the contact slides — its anchor follows it. A contact that does not press
   * lets go of both.
   */
  private frictionDual(): void {
    for (let c = 0; c < this.nc; c++) {
      this.contactRel(c);
      const lam = this.clam[c], mu = this.cmu[c];
      if (lam >= 0 || mu <= 0) {
        this.canc[3 * c] = drift.x; this.canc[3 * c + 1] = drift.y; this.canc[3 * c + 2] = drift.z;
        this.clt[3 * c] = 0; this.clt[3 * c + 1] = 0; this.clt[3 * c + 2] = 0;
        continue;
      }
      const nx = this.cn[3 * c], ny = this.cn[3 * c + 1], nz = this.cn[3 * c + 2];
      let dx = drift.x - this.canc[3 * c], dy = drift.y - this.canc[3 * c + 1], dz = drift.z - this.canc[3 * c + 2];
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const kt = this.ckt[c] * this.ckmax[c] / this.P.kCap;
      const lx = this.clt[3 * c], ly = this.clt[3 * c + 1], lz = this.clt[3 * c + 2];
      const ln = lx * nx + ly * ny + lz * nz;
      let Fx = kt * dx + lx - ln * nx, Fy = kt * dy + ly - ln * ny, Fz = kt * dz + lz - ln * nz;
      const F = Math.sqrt(Fx * Fx + Fy * Fy + Fz * Fz);
      const lim = mu * -lam;
      if (F > lim) {
        const sc = lim / F;
        Fx *= sc; Fy *= sc; Fz *= sc;
        this.canc[3 * c] = drift.x; this.canc[3 * c + 1] = drift.y; this.canc[3 * c + 2] = drift.z;
      }
      this.clt[3 * c] = Fx; this.clt[3 * c + 1] = Fy; this.clt[3 * c + 2] = Fz;
    }
  }

  /**
   * The part of an existing overlap the solve may leave this substep: a
   * fraction α of it, and more when it is deep, so that at most `maxDepen`
   * is undone per substep — a cord released across a duct finger slides out
   * of it instead of being kicked away.
   */
  private forgive(c: number): number {
    const c0 = this.cc0[c];
    if (c0 >= 0) return 0;
    const P = this.P;
    return Math.min(P.alpha * c0, c0 + P.maxDepen);
  }

  /** does segment a overlap this gate (closer than the two radii)? */
  private acrossGate(a: number, sh: StaticShape, r: number): boolean {
    const x = this.x;
    if (sh.kind === 'capsule') {
      segSeg(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5], sh.ax, sh.ay, sh.az, sh.bx, sh.by, sh.bz);
      const rs = r + sh.r;
      return closest.d2 < rs * rs;
    }
    segBox(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5], sh.min[0], sh.min[1], sh.min[2], sh.max[0], sh.max[1], sh.max[2]);
    return boxHit.dist < r;
  }

  /** C = n·(pA − pB) − (rA + rB), with the weights fixed when the contact was made. */
  private contactC(c: number): number {
    const x = this.x;
    const s = this.cs[c];
    const a0 = 3 * this.ca0[c], a1 = 3 * this.ca1[c];
    const ax = x[a0] + (x[a1] - x[a0]) * s;
    const ay = x[a0 + 1] + (x[a1 + 1] - x[a0 + 1]) * s;
    const az = x[a0 + 2] + (x[a1 + 2] - x[a0 + 2]) * s;
    let bx: number, by: number, bz: number;
    if (this.cb0[c] >= 0) {
      const t = this.ct[c];
      const b0 = 3 * this.cb0[c], b1 = 3 * this.cb1[c];
      bx = x[b0] + (x[b1] - x[b0]) * t;
      by = x[b0 + 1] + (x[b1 + 1] - x[b0 + 1]) * t;
      bz = x[b0 + 2] + (x[b1 + 2] - x[b0 + 2]) * t;
    } else {
      bx = this.cq[3 * c]; by = this.cq[3 * c + 1]; bz = this.cq[3 * c + 2];
    }
    return this.cn[3 * c] * (ax - bx) + this.cn[3 * c + 1] * (ay - by) + this.cn[3 * c + 2] * (az - bz) - this.crs[c];
  }

  /** pA − pB of a contact (pA alone against the rack, which does not move) */
  private contactRel(c: number): void {
    const x = this.x;
    const s = this.cs[c];
    const a0 = 3 * this.ca0[c], a1 = 3 * this.ca1[c];
    let rx = x[a0] + (x[a1] - x[a0]) * s, ry = x[a0 + 1] + (x[a1 + 1] - x[a0 + 1]) * s, rz = x[a0 + 2] + (x[a1 + 2] - x[a0 + 2]) * s;
    if (this.cb0[c] >= 0) {
      const t = this.ct[c];
      const b0 = 3 * this.cb0[c], b1 = 3 * this.cb1[c];
      rx -= x[b0] + (x[b1] - x[b0]) * t; ry -= x[b0 + 1] + (x[b1 + 1] - x[b0 + 1]) * t; rz -= x[b0 + 2] + (x[b1 + 2] - x[b0 + 2]) * t;
    }
    drift.x = rx; drift.y = ry; drift.z = rz;
  }

  /**
   * End of a substep: a contact that slid drags its anchor along (to where the
   * friction force is exactly μ·N), a contact that let go forgets it.
   */
  private updateAnchors(h: number): void {
    const ih2 = 1 / (h * h);
    for (let c = 0; c < this.nc; c++) {
      this.contactRel(c);
      const ax = this.canc[3 * c], ay = this.canc[3 * c + 1], az = this.canc[3 * c + 2];
      const f = this.ck[c] * (this.contactC(c) - this.forgive(c)) + this.clam[c];
      if (f >= 0) { this.canc[3 * c] = drift.x; this.canc[3 * c + 1] = drift.y; this.canc[3 * c + 2] = drift.z; continue; }
      const nx = this.cn[3 * c], ny = this.cn[3 * c + 1], nz = this.cn[3 * c + 2];
      let dx = drift.x - ax, dy = drift.y - ay, dz = drift.z - az;
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let m = this.mass[this.ca0[c]];
      if (this.cb0[c] >= 0) m = Math.max(m, this.mass[this.cb0[c]]);
      const kt = this.ckt[c] * ih2 * m;
      const lim = this.cmu[c] * -f;
      if (kt * dl > lim && dl > 1e-12) {
        const k = 1 - lim / (kt * dl);
        this.canc[3 * c] = ax + dx * k; this.canc[3 * c + 1] = ay + dy * k; this.canc[3 * c + 2] = az + dz * k;
      }
    }
  }

  private contactDrift(c: number): void {
    const x = this.x, x0 = this.x0;
    const s = this.cs[c];
    const a0 = 3 * this.ca0[c], a1 = 3 * this.ca1[c];
    let dx = (x[a0] - x0[a0]) * (1 - s) + (x[a1] - x0[a1]) * s;
    let dy = (x[a0 + 1] - x0[a0 + 1]) * (1 - s) + (x[a1 + 1] - x0[a1 + 1]) * s;
    let dz = (x[a0 + 2] - x0[a0 + 2]) * (1 - s) + (x[a1 + 2] - x0[a1 + 2]) * s;
    if (this.cb0[c] >= 0) {
      const t = this.ct[c];
      const b0 = 3 * this.cb0[c], b1 = 3 * this.cb1[c];
      dx -= (x[b0] - x0[b0]) * (1 - t) + (x[b1] - x0[b1]) * t;
      dy -= (x[b0 + 1] - x0[b0 + 1]) * (1 - t) + (x[b1 + 1] - x0[b1 + 1]) * t;
      dz -= (x[b0 + 2] - x0[b0 + 2]) * (1 - t) + (x[b1 + 2] - x0[b1 + 2]) * t;
    }
    drift.x = dx; drift.y = dy; drift.z = dz;
  }

  // ----------------------------------------------------------- collision

  private ensureCap(n: number): void {
    if (n <= this.cap) return;
    const cap = Math.max(n, this.cap * 2, 1024);
    const gi = (a: Int32Array, k = 1) => { const b = new Int32Array(cap * k); b.set(a); return b; };
    const gf = (a: Float64Array, k = 1) => { const b = new Float64Array(cap * k); b.set(a); return b; };
    this.ca0 = gi(this.ca0); this.ca1 = gi(this.ca1); this.cb0 = gi(this.cb0); this.cb1 = gi(this.cb1);
    this.cs = gf(this.cs); this.ct = gf(this.ct); this.cn = gf(this.cn, 3); this.cq = gf(this.cq, 3);
    this.crs = gf(this.crs); this.cc0 = gf(this.cc0); this.ck = gf(this.ck); this.clam = gf(this.clam);
    this.ckt = gf(this.ckt); this.cmu = gf(this.cmu); this.ckmax = gf(this.ckmax); this.ckey = gf(this.ckey);
    this.canc = gf(this.canc, 3);
    this.clt = gf(this.clt, 3);
    this.cap = cap;
  }

  private pushContact(
    key: number, a0: number, a1: number, s: number, b0: number, b1: number, t: number,
    nx: number, ny: number, nz: number, qx: number, qy: number, qz: number, rs: number, C: number, mu: number, h: number,
  ): void {
    const c = this.nc++;
    this.ensureCap(this.nc);
    const old = this.warm.get(key);
    this.ca0[c] = a0; this.ca1[c] = a1; this.cs[c] = s;
    this.cb0[c] = b0; this.cb1[c] = b1; this.ct[c] = t;
    this.cn[3 * c] = nx; this.cn[3 * c + 1] = ny; this.cn[3 * c + 2] = nz;
    this.cq[3 * c] = qx; this.cq[3 * c + 1] = qy; this.cq[3 * c + 2] = qz;
    this.crs[c] = rs; this.cc0[c] = C; this.cmu[c] = mu;
    let m = Math.max(this.mass[a0], this.mass[a1]);
    if (b0 >= 0) m = Math.max(m, this.mass[b0], this.mass[b1]);
    const mh2 = m / (h * h);
    const kmax = this.P.kCap * mh2;
    this.ckmax[c] = kmax;
    const kmin = this.P.kMin * mh2;
    this.ck[c] = old !== undefined ? Math.max(kmin, Math.min(kmax, this.prevK[old] * this.P.gamma)) : kmin;
    this.clam[c] = old !== undefined ? this.prevLam[old] : 0;
    this.ckt[c] = this.P.anchoredFriction ? this.P.frictionK : FRICTION_K.start;
    this.ckey[c] = key;
    if (old !== undefined) {
      this.canc[3 * c] = this.prevAnc[3 * old]; this.canc[3 * c + 1] = this.prevAnc[3 * old + 1]; this.canc[3 * c + 2] = this.prevAnc[3 * old + 2];
      this.clt[3 * c] = this.prevLt[3 * old]; this.clt[3 * c + 1] = this.prevLt[3 * old + 1]; this.clt[3 * c + 2] = this.prevLt[3 * old + 2];
      // the closest points moved along the segments since last frame: the
      // anchor follows, so that it still marks the same spots of the cords
      // (a sticking contact would otherwise be dragged by the re-detection)
      const ds = s - this.prevS[old], dt = t - this.prevT[old];
      const x = this.x, j0 = 3 * a0, j1 = 3 * a1;
      for (let d = 0; d < 3; d++) {
        let shift = (x[j1 + d] - x[j0 + d]) * ds;
        if (b0 >= 0) shift -= (x[3 * b1 + d] - x[3 * b0 + d]) * dt;
        this.canc[3 * c + d] += shift;
      }
    } else {
      this.clt[3 * c] = 0; this.clt[3 * c + 1] = 0; this.clt[3 * c + 2] = 0;
      this.contactRel(c);
      this.canc[3 * c] = drift.x; this.canc[3 * c + 1] = drift.y; this.canc[3 * c + 2] = drift.z;
    }
  }

  private collide(h: number, frame: number): void {
    const P = this.P;
    // remember the stiffness of last substep's contacts
    this.warm.clear();
    if (this.prevK.length < this.nc) {
      this.prevK = new Float64Array(this.cap); this.prevLam = new Float64Array(this.cap); this.prevAnc = new Float64Array(3 * this.cap);
      this.prevLt = new Float64Array(3 * this.cap);
      this.prevS = new Float64Array(this.cap); this.prevT = new Float64Array(this.cap);
    }
    for (let c = 0; c < this.nc; c++) {
      this.warm.set(this.ckey[c], c);
      this.prevK[c] = this.ck[c];
      this.prevLam[c] = Math.min(0, this.clam[c]);
      this.prevAnc[3 * c] = this.canc[3 * c]; this.prevAnc[3 * c + 1] = this.canc[3 * c + 1]; this.prevAnc[3 * c + 2] = this.canc[3 * c + 2];
      this.prevLt[3 * c] = this.clt[3 * c]; this.prevLt[3 * c + 1] = this.clt[3 * c + 1]; this.prevLt[3 * c + 2] = this.clt[3 * c + 2];
      this.prevS[c] = this.cs[c]; this.prevT[c] = this.ct[c];
    }
    this.nc = 0;
    const x = this.x, v = this.v;
    const N = this.n;
    let rMax = 0, lMax = 0;
    for (let i = 0; i < N; i++) {
      if (this.radius[i] > rMax) rMax = this.radius[i];
      if (this.segOK[i] && this.rest[i] > lMax) lMax = this.rest[i];
    }
    const cell = lMax + 2 * rMax + 2 * P.marginCap + 1e-4;
    const inv = 1 / cell;
    const HC = this.hashCells;
    const count = this.hashCount;
    count.fill(0);
    // bucket every segment by its midpoint
    for (let i = 0; i < N; i++) {
      if (!this.segOK[i]) continue;
      const cx = Math.floor((x[3 * i] + x[3 * i + 3]) * 0.5 * inv);
      const cy = Math.floor((x[3 * i + 1] + x[3 * i + 4]) * 0.5 * inv);
      const cz = Math.floor((x[3 * i + 2] + x[3 * i + 5]) * 0.5 * inv);
      this.segCell[3 * i] = cx; this.segCell[3 * i + 1] = cy; this.segCell[3 * i + 2] = cz;
      count[(cellKey(cx, cy, cz) & (HC - 1)) + 1]++;
    }
    for (let k = 0; k < HC; k++) count[k + 1] += count[k];
    const fillAt = this.hashCount.slice(0, HC);
    for (let i = 0; i < N; i++) {
      if (!this.segOK[i]) continue;
      const b = cellKey(this.segCell[3 * i], this.segCell[3 * i + 1], this.segCell[3 * i + 2]) & (HC - 1);
      this.hashItems[fillAt[b]++] = i;
    }
    // speed of every segment (its faster node), for the speculative margins
    if (this.segSpeed.length < N) this.segSpeed = new Float64Array(N);
    const segSpeed = this.segSpeed;
    for (let i = 0; i < N; i++) {
      const s0 = Math.sqrt(v[3 * i] ** 2 + v[3 * i + 1] ** 2 + v[3 * i + 2] ** 2);
      const s1 = i + 1 < N ? Math.sqrt(v[3 * i + 3] ** 2 + v[3 * i + 4] ** 2 + v[3 * i + 5] ** 2) : 0;
      segSpeed[i] = s0 > s1 ? s0 : s1;
    }

    // --- cable vs cable
    for (let a = 0; a < N; a++) {
      if (!this.segOK[a]) continue;
      const acx = this.segCell[3 * a], acy = this.segCell[3 * a + 1], acz = this.segCell[3 * a + 2];
      const ca = this.cableOf[a];
      const aFixed = this.fixed[a] && this.fixed[a + 1];
      const va = segSpeed[a];
      // each pair of cells once: this cell, and the 13 neighbours "after" it
      for (let ox = 0; ox <= 1; ox++)
        for (let oy = ox ? -1 : 0; oy <= 1; oy++)
          for (let oz = ox || oy ? -1 : 0; oz <= 1; oz++) {
            const home = ox === 0 && oy === 0 && oz === 0;
            const ncx = acx + ox, ncy = acy + oy, ncz = acz + oz;
            const bucket = cellKey(ncx, ncy, ncz) & (HC - 1);
            for (let e = count[bucket]; e < count[bucket + 1]; e++) {
              const b = this.hashItems[e];
              if (home ? b <= a : b === a) continue;
              if (this.segCell[3 * b] !== ncx || this.segCell[3 * b + 1] !== ncy || this.segCell[3 * b + 2] !== ncz) continue;
              const cb = this.cableOf[b];
              if (ca === cb && Math.abs(b - a) <= 2) continue;
              const bFixed = this.fixed[b] && this.fixed[b + 1];
              if (aFixed && bFixed) continue;
              // cheap rejection on the distance of the midpoints
              const mdx = (x[3 * a] + x[3 * a + 3] - x[3 * b] - x[3 * b + 3]) * 0.5;
              const mdy = (x[3 * a + 1] + x[3 * a + 4] - x[3 * b + 1] - x[3 * b + 4]) * 0.5;
              const mdz = (x[3 * a + 2] + x[3 * a + 5] - x[3 * b + 2] - x[3 * b + 5]) * 0.5;
              const reach = (this.rest[a] + this.rest[b]) * 0.5 + this.radius[a] + this.radius[b] + P.marginCap;
              if (mdx * mdx + mdy * mdy + mdz * mdz > reach * reach) continue;
              const vb = segSpeed[b];
              const rs = this.radius[a] + this.radius[b];
              const margin = Math.min(P.marginCap, P.margin + (va + vb) * frame * 1.2);
              segSeg(
                x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
                x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5],
              );
              const lim = rs + margin;
              if (closest.d2 > lim * lim) continue;
              // a sleeping cable wakes up when something moving touches it
              if (aFixed !== bFixed) {
                const mover = aFixed ? vb : va;
                const sleeper = aFixed ? ca : cb;
                if (this.cables[sleeper].asleep && (mover > P.wakeSpeed || Math.sqrt(closest.d2) < rs - 2e-3)) {
                  this.wakeCable(sleeper);
                }
              }
              // always in the same order (lower segment first): the normal and
              // the friction anchor carried to the next frame depend on it
              const lo = a < b ? a : b, hi = a < b ? b : a;
              if (lo !== a) segSeg(
                x[3 * lo], x[3 * lo + 1], x[3 * lo + 2], x[3 * lo + 3], x[3 * lo + 4], x[3 * lo + 5],
                x[3 * hi], x[3 * hi + 1], x[3 * hi + 2], x[3 * hi + 3], x[3 * hi + 4], x[3 * hi + 5],
              );
              this.pairContacts(
                lo * 16384 + hi, lo, hi,
                x[3 * hi], x[3 * hi + 1], x[3 * hi + 2], x[3 * hi + 3], x[3 * hi + 4], x[3 * hi + 5],
                rs, lim, P.muCable, h,
              );
            }
          }
    }

    this.refreshFixed();

    // --- cable vs rack
    const SC = this.SCELL;
    for (let a = 0; a < N; a++) {
      if (!this.segOK[a]) continue;
      if (this.fixed[a] && this.fixed[a + 1]) continue;
      const mx = (x[3 * a] + x[3 * a + 3]) * 0.5, my = (x[3 * a + 1] + x[3 * a + 4]) * 0.5, mz = (x[3 * a + 2] + x[3 * a + 5]) * 0.5;
      const list = this.staticGrid.get(cellKey(Math.floor(mx / SC), Math.floor(my / SC), Math.floor(mz / SC)));
      if (!list) continue;
      const r = this.radius[a];
      const va = segSpeed[a];
      const margin = Math.min(P.marginStatic, P.margin + va * frame * 1.2);
      const free = this.gateFree[a] || this.gateFree[a + 1];
      const held = !free && (this.gateHold[a] || this.gateHold[a + 1]);
      for (const sid of list) {
        const sh = this.statics[sid];
        if (sh.gate && free) continue;
        if (sh.gate && held && this.acrossGate(a, sh, r)) { this.gateAcross[a] = 1; continue; }
        const mu = sh.mu ?? P.muStatic;
        const key = 268435456 + a * 4096 + sid;
        if (sh.kind === 'capsule') {
          segSeg(
            x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
            sh.ax, sh.ay, sh.az, sh.bx, sh.by, sh.bz,
          );
          const rs = r + sh.r;
          const lim = rs + margin;
          if (closest.d2 > lim * lim) continue;
          this.pairContacts(key, a, -1, sh.ax, sh.ay, sh.az, sh.bx, sh.by, sh.bz, rs, lim, mu, h);
        } else {
          // Every node gets its own contact (the first node of each segment,
          // and the last of the cord): the closest point of a segment lying
          // nearly flat on a face lands anywhere along it, and a node at the
          // bottom of a slight V sank into the floor between two of them.
          // The segment's own closest point is kept for an edge it straddles.
          const lim = r + margin;
          const last = !this.segOK[a + 1];
          let dEnds = Infinity;
          for (let e = 0; e < 2; e++) {
            const j = 3 * (a + e);
            segBox(x[j], x[j + 1], x[j + 2], x[j], x[j + 1], x[j + 2], sh.min[0], sh.min[1], sh.min[2], sh.max[0], sh.max[1], sh.max[2]);
            if (boxHit.dist < dEnds) dEnds = boxHit.dist;
            if ((e === 1 && !last) || boxHit.dist > lim) continue;
            this.pushContact(
              key + e * 0.25, a, a + 1, e, -1, -1, 0, boxHit.nx, boxHit.ny, boxHit.nz,
              boxHit.qx, boxHit.qy, boxHit.qz, r, boxHit.dist - r, mu, h,
            );
          }
          segBox(
            x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
            sh.min[0], sh.min[1], sh.min[2], sh.max[0], sh.max[1], sh.max[2],
          );
          if (boxHit.dist > lim || boxHit.s < 0.05 || boxHit.s > 0.95 || boxHit.dist > dEnds - 5e-4) continue;
          this.pushContact(
            key + 0.5, a, a + 1, boxHit.s, -1, -1, 0, boxHit.nx, boxHit.ny, boxHit.nz,
            boxHit.qx, boxHit.qy, boxHit.qz, r, boxHit.dist - r, mu, h,
          );
        }
      }
    }
    // segments that have slipped free of every gate collide with them again
    for (let a = 0; a < N; a++) {
      if (this.gateHold[a] && !this.gateFree[a] && !this.gateAcross[a] && !(this.fixed[a] && this.fixed[a + 1])) this.gateHold[a] = 0;
    }
    this.gateAcross.fill(0);
    this.stats.contacts = this.nc;
  }

  /**
   * Contacts between segment a and segment B (another cable's segment b, or
   * the axis of a static capsule when b = −1), `closest` holding their closest
   * points. Nearly parallel segments (a cable lying along another, or along a
   * bar) get two contacts at the ends of their overlap: with the single
   * closest point, which then sits on a segment end, every other node was left
   * unsupported and the cable shimmered in a zigzag.
   */
  private pairContacts(
    key: number, a: number, b: number,
    q0x: number, q0y: number, q0z: number, q1x: number, q1y: number, q1z: number,
    rs: number, lim: number, mu: number, h: number,
  ): void {
    const x = this.x;
    const p0x = x[3 * a], p0y = x[3 * a + 1], p0z = x[3 * a + 2];
    const ux = x[3 * a + 3] - p0x, uy = x[3 * a + 4] - p0y, uz = x[3 * a + 5] - p0z;
    const wx = q1x - q0x, wy = q1y - q0y, wz = q1z - q0z;
    const uu = ux * ux + uy * uy + uz * uz, ww = wx * wx + wy * wy + wz * wz;
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    const cross = cx * cx + cy * cy + cz * cz;
    if (cross < 0.06 * uu * ww && uu > 1e-12 && ww > 1e-12) {
      const s0 = ((q0x - p0x) * ux + (q0y - p0y) * uy + (q0z - p0z) * uz) / uu;
      const s1 = ((q1x - p0x) * ux + (q1y - p0y) * uy + (q1z - p0z) * uz) / uu;
      const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(1, Math.max(s0, s1));
      // Not when they cross at a shallow angle within the overlap: the two
      // ends lie on opposite sides, and the crossing in between was left
      // unguarded (cords slipped through one another there)
      if (hi - lo > 0.05 && this.endsAgree(a, lo, hi, q0x, q0y, q0z, wx, wy, wz, ww)) {
        const dc = Math.sqrt(closest.d2);
        this.emitAt(key, a, b, lo, q0x, q0y, q0z, wx, wy, wz, ww, rs, lim, mu, h);
        this.emitAt(key + 0.5, a, b, hi, q0x, q0y, q0z, wx, wy, wz, ww, rs, lim, mu, h);
        // and the closest point, when it dips well below both ends
        if (dc > Math.min(this.endGap[0], this.endGap[1]) - 5e-4 || closest.s <= lo || closest.s >= hi) return;
        key += 0.25;
      }
    }
    const s = closest.s;
    const t = closest.t;
    const pax = p0x + ux * s, pay = p0y + uy * s, paz = p0z + uz * s;
    const qx = q0x + wx * t, qy = q0y + wy * t, qz = q0z + wz * t;
    let nx = pax - qx, ny = pay - qy, nz = paz - qz;
    let d = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (d < 1e-9) {
      // crossing exactly: separate along the common perpendicular
      const cl = Math.sqrt(cross);
      if (cl > 1e-12) { nx = cx / cl; ny = cy / cl; nz = cz / cl; } else { nx = 0; ny = 0; nz = 1; }
      d = 0;
    } else { nx /= d; ny /= d; nz /= d; }
    if (b >= 0) this.pushContact(key, a, a + 1, s, b, b + 1, t, nx, ny, nz, 0, 0, 0, rs, d - rs, mu, h);
    else this.pushContact(key, a, a + 1, s, -1, -1, 0, nx, ny, nz, qx, qy, qz, rs, d - rs, mu, h);
  }

  /** gaps between the two segments at the ends of their overlap (set by endsAgree) */
  private endGap = [0, 0];

  /** do the ends lo and hi of segment a lie on the same side of segment B? */
  private endsAgree(a: number, lo: number, hi: number, q0x: number, q0y: number, q0z: number, wx: number, wy: number, wz: number, ww: number): boolean {
    const x = this.x;
    let ox = 0, oy = 0, oz = 0, dot = 0;
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? lo : hi;
      const pax = x[3 * a] + (x[3 * a + 3] - x[3 * a]) * s;
      const pay = x[3 * a + 1] + (x[3 * a + 4] - x[3 * a + 1]) * s;
      const paz = x[3 * a + 2] + (x[3 * a + 5] - x[3 * a + 2]) * s;
      let t = ((pax - q0x) * wx + (pay - q0y) * wy + (paz - q0z) * wz) / ww;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = pax - q0x - wx * t, dy = pay - q0y - wy * t, dz = paz - q0z - wz * t;
      this.endGap[k] = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (k === 0) { ox = dx; oy = dy; oz = dz; } else dot = dx * ox + dy * oy + dz * oz;
    }
    return dot > 0;
  }

  private emitAt(
    key: number, a: number, b: number, s: number,
    q0x: number, q0y: number, q0z: number, wx: number, wy: number, wz: number, ww: number,
    rs: number, lim: number, mu: number, h: number,
  ): void {
    const x = this.x;
    const pax = x[3 * a] + (x[3 * a + 3] - x[3 * a]) * s;
    const pay = x[3 * a + 1] + (x[3 * a + 4] - x[3 * a + 1]) * s;
    const paz = x[3 * a + 2] + (x[3 * a + 5] - x[3 * a + 2]) * s;
    let t = ((pax - q0x) * wx + (pay - q0y) * wy + (paz - q0z) * wz) / ww;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = q0x + wx * t, qy = q0y + wy * t, qz = q0z + wz * t;
    let nx = pax - qx, ny = pay - qy, nz = paz - qz;
    const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (d > lim) return;
    if (d < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
    if (b >= 0) this.pushContact(key, a, a + 1, s, b, b + 1, t, nx, ny, nz, 0, 0, 0, rs, d - rs, mu, h);
    else this.pushContact(key, a, a + 1, s, -1, -1, 0, nx, ny, nz, qx, qy, qz, rs, d - rs, mu, h);
  }

  private buildAdjacency(): void {
    const N = this.n;
    const start = this.adjStart;
    start.fill(0);
    const nodes = [this.ca0, this.ca1, this.cb0, this.cb1];
    for (let c = 0; c < this.nc; c++) {
      for (let k = 0; k < 4; k++) {
        const i = nodes[k][c];
        if (i >= 0 && !this.fixed[i]) start[i + 1]++;
      }
    }
    for (let i = 0; i < N; i++) start[i + 1] += start[i];
    const total = start[N];
    if (this.adjC.length < total) {
      this.adjC = new Int32Array(total * 2);
      this.adjW = new Float64Array(total * 2);
    }
    const at = start.slice(0, N);
    for (let c = 0; c < this.nc; c++) {
      const s = this.cs[c], t = this.ct[c];
      const ws = [1 - s, s, -(1 - t), -t];
      for (let k = 0; k < 4; k++) {
        const i = nodes[k][c];
        if (i < 0 || this.fixed[i]) continue;
        const e = at[i]++;
        this.adjC[e] = c;
        this.adjW[e] = ws[k];
      }
    }
  }

  // --------------------------------------------------------------- sleep

  /**
   * A cable falls asleep when none of its nodes has moved more than
   * `sleepDist` from where it was when the window started, for `sleepTime`.
   * Measuring the displacement rather than the speed lets a dense heap settle:
   * its residual shimmer goes nowhere, and a slow creep of a few mm/s is
   * stopped as static friction would.
   */
  private updateSleep(): void {
    const P = this.P;
    const x = this.x, ref = this.sleepRef;
    let awake = 0;
    for (let ci = 0; ci < this.cables.length; ci++) {
      const c = this.cables[ci];
      if (c.asleep) continue;
      awake++;
      const held = this.grabNode >= c.start && this.grabNode < c.start + c.count;
      let moved = held;
      if (!moved) {
        const lim = P.sleepDist * P.sleepDist;
        for (let i = c.start; i < c.start + c.count; i++) {
          const dx = x[3 * i] - ref[3 * i], dy = x[3 * i + 1] - ref[3 * i + 1], dz = x[3 * i + 2] - ref[3 * i + 2];
          if (dx * dx + dy * dy + dz * dz > lim) { moved = true; break; }
        }
      }
      if (moved) {
        c.calm = 0;
        for (let i = 3 * c.start; i < 3 * (c.start + c.count); i++) ref[i] = x[i];
        continue;
      }
      c.calm += P.dt;
      if (c.calm > P.sleepTime) {
        c.asleep = true;
        for (let i = c.start; i < c.start + c.count; i++) { this.v[3 * i] = 0; this.v[3 * i + 1] = 0; this.v[3 * i + 2] = 0; }
      }
    }
    this.stats.awake = awake;
  }
}

const drift = { x: 0, y: 0, z: 0 };

function cellKey(x: number, y: number, z: number): number {
  return ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0);
}
