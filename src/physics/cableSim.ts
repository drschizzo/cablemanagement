// Cable dynamics with Augmented Vertex Block Descent (Giles, Diaz, Yuksel,
// SIGGRAPH 2025), in the spirit of the 2D engine of the AVBD course project.
//
// A cable is a chain of nodes (point masses). Every substep:
//   1. contacts are found once a frame, with a speculative margin that grows
//      with the speed of the segments (so fast cables do not tunnel), and
//      those at the closest point of two crossing segments move with the
//      cords at the start of every substep;
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
// and the other hand that holds one still, the velcro straps, the pinches,
// and the route goals that lead a cord along a drawn route (`setGoals`).
// A cord led along a route passes through the other cords (not through the
// cabinet), and becomes solid again where it is clear of them once let go.
//
// A pinch keeps the shape a few nodes had when the hand pinched them: each
// node is pulled towards where it was in that shape, the shape turned and
// moved to fit the nodes best (shape matching, Müller et al. 2005). The fit
// is the one that makes this pull weakest, so taking it as fixed during a
// substep leaves the pull an honest spring, which cannot feed energy in.
//
// Cables at rest fall asleep (their nodes are frozen and act as static
// geometry for the others) and wake when something awake touches them.
//
// One gameplay aid, outside the physics: the trough of a finger manager is a
// keeper — a cord the player has handled or laid along a route stays in it
// once in it, until the hand pulls it out or a route leads it elsewhere. It
// never draws a cord in: laying a cord in the guides is the route's job.

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

export type StaticShape = StaticCapsule | StaticBox | StaticKeeper;

/** A stretch of cord that keeps its shape (see the top of the file). */
export interface Pinch {
  /** its first node, and how many */
  a: number;
  n: number;
  /** the shape: each node's position from their centre, as they were pinched (3 per node) */
  rest: number[];
  /** how firmly it holds, 0 to 1 (of `pinchK`): the longer the hand pinched, the firmer */
  s: number;
  /** rotation of the shape that fits the nodes best, as a quaternion (x, y, z, w), kept to start the next fit from */
  q: number[];
}

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
  /**
   * The substep count the settings below were tuned at. Their stiffnesses are
   * multiples of M/h² for that reference substep h = dt / refSubsteps, which
   * makes them plain stiffnesses (N/m), and what they do "per substep" is
   * converted to the actual substep so that it does as much per second: more
   * substeps solve the same cables more accurately, rather than stiffer ones.
   */
  refSubsteps: number;
  iterations: number;
  gravity: number;
  /** stretch stiffness, in multiples of M/h² (of the hard constraints: see `R`) */
  stretch: number;
  /** contact stiffness: starting value and ceiling (× M/h²), growth (× M/h² per metre of violation) */
  kMin: number;
  kCap: number;
  /** ceiling between two cables: stiffer, so that a cord dragged through others does not pass through them */
  kCapCable: number;
  /**
   * ceiling against the rack for the cords the hand draws (`drawnCable`: in
   * hand, or being plugged): the hand pulls harder than anything else, and a
   * cord dragged across a finger sank into it (the others keep `kCap`:
   * stiffer, a cord let go on the rack shivered)
   */
  kCapHeld: number;
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
  /**
   * fraction of the sliding velocity of a pushing contact removed per substep,
   * whatever the substep: like the separating velocity, it is taken from the
   * velocity the substep has just made, not from one carried through the frame
   */
  contactDamping: number;
  /** speed (m/s) under which a node resting on a contact stops, and that it loses per substep otherwise */
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
   * Friction, a hard constraint (AVBD §3.3) with anchors kept from frame to
   * frame: a tangential multiplier holds the contact on its anchor, clamped to
   * the cone μ·λn, and the anchor only moves when the contact slides. Without
   * anchors the friction restarted every substep and a loaded cord crept
   * forever. This is the stiffness of the anchor (of the hard constraints:
   * see `R`).
   */
  frictionK: number;
  /** the most an overlap is undone per substep (m): a soft way out instead of a kick */
  maxDepen: number;
  /** nodes of the held cable on each side of the hand that keepers let go of */
  keepHand: number;
  /** nodes of a cable on each side of where the hand last took it that a keeper may take (beyond, only next to nodes it holds) */
  keepZip: number;
  /** stiffness of a keeper's pull in the solve (× M/h²) */
  keepK: number;
  /** a kept node of the held cord pulled this far out of its keeper in one substep comes out (m) */
  keepPeel: number;
  /** a cable whose nodes all stay within sleepDist (m) for sleepTime (s) falls asleep */
  sleepDist: number;
  sleepTime: number;
  wakeSpeed: number;
  /** nodes on each side of the hand that a pinch takes */
  pinchSpan: number;
  /** stiffness of a pinch held at its firmest (× M/h²) */
  pinchK: number;
  /** firmness of a pinch as it starts, and what it gains per second while the hand keeps pinching (see `firmPinch`) */
  pinchStart: number;
  pinchGrow: number;
  /** stiffness of a route goal at full weight (× M/h²), and its leash (m): see `setGoals` */
  goalK: number;
  goalLead: number;
  /** frames a node let go by its route goal may still pass through the cords it lies in (then it pushes them out) */
  ghostFrames: number;
}

export function defaultSimParams(p: Partial<SimParams> = {}): SimParams {
  return {
    dt: 1 / 60, substeps: 3, refSubsteps: 3, iterations: 6, gravity: -9.81,
    stretch: 10, kMin: 0.05, kCap: 2, kCapCable: 4, kCapHeld: 8, beta: 2000, gamma: 0.99, alpha: 0.25, alphaS: 0.3, lamWarm: 0.8, lamWarmS: 0.8, contactDamping: 0.3, restFriction: 0.012,
    muCable: 0.3, muStatic: 0.4, drag: 2.5,
    margin: 0.0015, marginCap: 0.008, marginStatic: 0.06, maxMove: 0.012,
    grabK: 0.4, grabLead: 0.06, pbdPasses: 4, maxDepen: 0.001, frictionK: 0.3,
    keepHand: 2, keepZip: 10, keepK: 16, keepPeel: 0.003,
    sleepDist: 0.006, sleepTime: 0.5, wakeSpeed: 0.1,
    pinchSpan: 3, pinchK: 6, pinchStart: 0.15, pinchGrow: 0.6,
    goalK: 6, goalLead: 0.05, ghostFrames: 90,
    ...p,
  };
}

export interface CableInfo {
  start: number;
  count: number;
  asleep: boolean;
  calm: number;
}

/**
 * a connector's stroke into its port: speed (m/s), shortest and longest (s),
 * how far out it lines up first (m), how close to their places its node and
 * the one behind must come to be pinned there (m), and how long after the
 * stroke they are pinned anyway (s); how many nodes of the cord behind it
 * may be drawn out of a keeper on its way, as near the hand
 */
const PLUG_STROKE = { speed: 0.6, least: 0.1, most: 0.35, lead: 0.03, seat: 0.005, seatBehind: 0.01, giveUp: 0.5, free: 3 };

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
  cmu = new Float64Array(0); ckmax = new Float64Array(0);
  /** M/(h·h_ref) of each contact (its heavier node), the unit of its stiffnesses (see `R`) */
  cmh = new Float64Array(0);
  ckey = new Float64Array(0);
  /**
   * Contacts at the closest point of two segments that cross (not those of
   * nearly parallel ones, whose closest point jumps from end to end, nor
   * against a box): their point and normal follow the cords at every substep
   * (see `track`). `csh` is the static capsule of one against the rack, or −1.
   */
  private ctrack = new Uint8Array(0);
  private csh = new Int32Array(0);
  /** friction anchor of each contact: pA − pB (or pA against the rack) where it last stuck */
  canc = new Float64Array(0);
  /** tangential multiplier of each contact (hard friction) */
  clt = new Float64Array(0);
  /**
   * C and pA − pB of each contact, kept up to date during the sweeps: both are
   * linear in the node positions (the normal and the weights are frozen), so
   * a node's move updates them in O(its contacts) instead of recomputing them
   * at every read. Refreshed at the start of every substep.
   */
  private cC = new Float64Array(0);
  private cRel = new Float64Array(0);
  /** forgive(c), constant over a substep */
  private cF = new Float64Array(0);
  // the previous frame's contacts, for warm starts and friction anchors
  private prevK = new Float64Array(0);
  private prevLam = new Float64Array(0);
  private prevAnc = new Float64Array(0);
  private prevLt = new Float64Array(0);
  private prevS = new Float64Array(0);
  private prevT = new Float64Array(0);
  /**
   * contact key → its index in the previous frame's arrays. Keys are whole
   * numbers (small integers hash fast in a Map, fractions do not): 4 × the
   * pair, plus which contact of the pair (0, 1, 2) — see `pairKey`, `staticKey`.
   */
  private warm = new Map<number, number>();
  /**
   * Contacts of sleeping cables, as they were when they fell asleep: two
   * sleepers (or a sleeper and the rack) have no contact between them, and a
   * cable that woke rebuilt every force from nothing — it sank into what held
   * it, fast enough to wake its neighbours, which did the same. Keyed like
   * `warm`: k, λ, friction anchor (3), tangential λ (3), s, t, and the cables
   * involved (b = −1 against the rack).
   */
  private dormant = new Map<number, Float64Array>();
  /** which cables were asleep when the contacts were last searched */
  private wasAsleep = new Uint8Array(0);

  // node → contacts adjacency (CSR)
  private adjStart = new Int32Array(0);
  private adjC = new Int32Array(0);
  private adjW = new Float64Array(0);
  /** fill cursor of each node's adjacency, reused frame to frame */
  private adjAt = new Int32Array(0);

  // broadphase
  private segCell = new Int32Array(0);
  private hashCount = new Int32Array(0);
  private hashItems = new Int32Array(0);
  private hashCells = 0;
  /** fill cursor of each bucket, reused frame to frame */
  private hashFill = new Int32Array(0);
  private segSpeed = new Float64Array(0);
  // the segments in bucket order: midpoint, cell, reach (half length + radius), both nodes fixed
  private sMid = new Float64Array(0);
  private sCell = new Int32Array(0);
  private sReach = new Float64Array(0);
  private sFixed = new Uint8Array(0);
  /** where each segment sits in bucket order */
  private slot = new Int32Array(0);
  protected statics: StaticShape[] = [];
  private keepers: StaticKeeper[] = [];
  /** the keeper holding each node, or −1 */
  keepOf = new Int32Array(0);
  /** cables the hand has taken or a route has laid: keepers only take those (not the starting mess) */
  handled = new Uint8Array(0);
  /** the node of each cable the hand last took, or −1: a keeper takes a cord from there */
  lastHand = new Int32Array(0);
  /**
   * The cords the hand is drawing, worked out at the start of every step (see
   * `markDrawn`): the one in hand, and one whose connector is on its way into
   * a port, pushed as by the hand. `drawnCable`: such a cord, all of it
   * (firmer against the rack). `drawn`: those of its nodes that the hand may
   * draw out of a keeper — all of the cord in hand, but only the connector
   * and the few nodes behind it of a cord being plugged (all of it, a cord
   * laid along a duct slipped out of it).
   */
  private drawnCable = new Uint8Array(0);
  private drawn = new Uint8Array(0);
  private staticGrid = new Map<number, number[]>();
  private readonly SCELL = 0.05;

  // hand
  grabNode = -1;
  grabTarget = [0, 0, 0];
  /** the other hand: holds a node still where it was left (−1: free) */
  holdNode = -1;
  holdTarget = [0, 0, 0];

  // pinches
  pinches: Pinch[] = [];
  /** the pinch of each node, or −1 */
  pinchOf = new Int32Array(0);
  /** where each pinched node is pulled to, this substep */
  private pinchGoal = new Float64Array(0);
  /** the pinch the hand is making: it follows the cord, and firms up, until the hand stops */
  pinchHeld: Pinch | null = null;
  private pinchChanged = false;

  // route goals: where each node is led to, and how firmly (0: not led)
  goal = new Float64Array(0);
  goalW = new Float64Array(0);
  /** connector nodes on their way into a port, pushed there as by the hand (see `pinEnd`), and where to at this frame */
  plugging = new Uint8Array(0);
  plugAt = new Float64Array(0);
  /** a node that passes through the other cords: −1 while led, then the frames left until it is solid again (0: solid) */
  ghost = new Int16Array(0);
  /** segments a ghost overlapped another cord at this frame */
  private ghostTouch = new Uint8Array(0);

  // velcro
  bundleOf = new Int32Array(0);
  bundles: { nodes: number[]; r: number; cx: number; cy: number; cz: number; alive: boolean }[] = [];

  /**
   * The cables awake for this step, in index order: the per-node passes of a
   * substep only run over them, so their cost follows what moves (a sleeping
   * cable's nodes are all fixed, and those passes skip fixed nodes anyway).
   */
  private awake = new Int32Array(0);
  /**
   * Sleepers touched by something moving, woken at the end of the step: one
   * woken during the contact search would miss its contacts with the segments
   * already searched, and drop through them for a frame.
   */
  private wakeNext: number[] = [];
  private nAwake = 0;

  /**
   * The settings of this step's substep h, converted from those of the
   * reference substep h_ref (see `refSubsteps`), r = h / h_ref:
   * - the unit of the soft stiffnesses (hand, keepers, velcro), M/h_ref² =
   *   M / h2: they are plain springs, the same whatever the substep;
   * - the unit of the hard constraints' penalties (stretch, contacts and
   *   their friction), M/(h·h_ref) = M / hk. Plain springs there make the
   *   contacts soft at many substeps (they sink), and multiples of M/h² make
   *   them stiffer as h shrinks, until the heap shakes (several thousand
   *   reversals at 6 substeps in `npm run free`). In between, k·h stays the
   *   same: a contact pushes back in proportion to the speed at which it is
   *   violated, whatever the substep;
   * - a fraction f kept per substep becomes f^r, an amount per substep r
   *   times that amount, a count of passes per substep r times as many.
   */
  private R = {
    mh: 0, hk: 0, mhk: 0, lamWarm: 0, lamWarmS: 0, gamma: 0, alpha: 0, alphaS: 0, maxDepen: 0,
    restDecel: 0, keepPeel: 0, maxMove: 0, pbdPasses: 0,
  };

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
    this.pinchOf = new Int32Array(N).fill(-1);
    this.goal = new Float64Array(3 * N);
    this.goalW = new Float64Array(N);
    this.plugging = new Uint8Array(N);
    this.plugAt = new Float64Array(3 * N);
    this.ghost = new Int16Array(N);
    this.ghostTouch = new Uint8Array(N);
    this.pinchGoal = new Float64Array(3 * N);
    this.pinches = [];
    this.pinchHeld = null;
    this.keepOf = new Int32Array(N).fill(-1);
    this.handled = new Uint8Array(defs.length);
    this.lastHand = new Int32Array(defs.length).fill(-1);
    this.drawnCable = new Uint8Array(defs.length);
    this.drawn = new Uint8Array(N);
    this.adjStart = new Int32Array(N + 1);
    this.segCell = new Int32Array(N * 3);
    this.cables = [];
    this.bundles = [];
    this.warm.clear();
    this.dormant.clear();
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
      this.cables.push({ start: at, count: cnt, asleep: false, calm: 0 });
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
    this.keepers = shapes.filter((s): s is StaticKeeper => s.kind === 'keeper');
    this.keepOf.fill(-1);
    const pad = 0.02 + this.P.marginStatic; // half a segment, a radius and the static margin
    const C = this.SCELL;
    shapes.forEach((s, id) => {
      if (s.kind === 'keeper') return; // nothing collides with it
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
      if (i < this.n) { this.lam[i] = 0; this.keepOf[i] = -1; }
    }
    if (this.holdNode >= start && this.holdNode < start + n) this.holdNode = -1;
    this.goalW.fill(0, start, Math.min(this.n, start + n));
    for (let i = start; i < Math.min(this.n, start + n); i++) if (this.ghost[i] < 0) this.ghost[i] = this.P.ghostFrames;
    // a cord put somewhere else (coiled in the crate) lets go of its pinches
    const kept = this.pinches.filter((p) => p.a + p.n <= start || p.a >= start + n);
    if (kept.length < this.pinches.length) this.setPinches(kept);
    this.nc = 0;
    this.dormant.clear();
    this.wakeAll();
  }

  /** puts every free node at the given positions, at rest (pins keep theirs) */
  teleport(pos: ArrayLike<number>): void {
    this.strokePlugs(0, true);
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      for (let d = 0; d < 3; d++) this.x[3 * i + d] = pos[3 * i + d];
    }
    this.x0.set(this.x);
    this.xt.set(this.x);
    this.sleepRef.set(this.x);
    this.v.fill(0);
    this.lam.fill(0);
    this.keepOf.fill(-1);
    this.nc = 0;
    this.dormant.clear();
    this.wakeAll();
  }

  wakeAll(): void {
    for (const c of this.cables) { c.asleep = false; c.calm = 0; }
  }

  wakeCable(ci: number): void {
    const c = this.cables[ci];
    c.asleep = false;
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
    this.plugs = this.plugs.filter((q) => {
      if (q.i0 !== i && q.i1 !== i) return true;
      this.plugging[q.i0] = 0; this.plugging[q.i1] = 0;
      return false;
    });
    this.pinned[i] = 0;
    this.wakeCable(this.cableOf[i]);
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

  /** connectors on their way into a port (see `pinEnd`) */
  protected plugs: { i0: number; i1: number; s0: number[]; s1: number[]; a: number[]; b: number[]; t: number; T: number }[] = [];

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
   * How firm the pinch the hand is making is now (0 to 1). The game sets it
   * from how long the player has held the key, in real time: the physics may
   * drop frames when it falls behind.
   */
  firmPinch(s: number): void {
    if (!this.pinchHeld) return;
    this.pinchHeld.s = Math.min(1, Math.max(0, s));
    this.pinchChanged = true;
  }

  /** lets go of the pinch that holds node i; false if none does */
  unpinch(i: number): boolean {
    const k = this.pinchOf[i];
    if (k < 0) return false;
    if (this.pinches[k] === this.pinchHeld) this.pinchHeld = null;
    this.setPinches(this.pinches.filter((_, j) => j !== k));
    return true;
  }

  /** puts the given pinches in place of the current ones (copies them) */
  setPinches(list: Pinch[]): void {
    for (const p of this.pinches) this.wakeCable(this.cableOf[p.a]);
    const held = this.pinchHeld;
    this.pinches = list.map((p) => (p === held ? p : { a: p.a, n: p.n, rest: [...p.rest], s: p.s, q: [...p.q] }));
    this.pinchOf.fill(-1);
    this.pinches.forEach((p, k) => {
      for (let i = p.a; i < p.a + p.n; i++) this.pinchOf[i] = k;
      this.wakeCable(this.cableOf[p.a]);
    });
    this.pinchChanged = true;
  }

  /** puts back pinches kept aside (undo, a rebuilt cabinet) */
  loadPinches(list: Pinch[]): void {
    this.pinchHeld = null;
    this.setPinches(list);
  }

  /** the pinches changed since the last call */
  takePinchChange(): boolean {
    const c = this.pinchChanged;
    this.pinchChanged = false;
    return c;
  }

  /** the centre of the nodes of a pinch, into `drift` */
  private centreOf(p: Pinch): void {
    const x = this.x;
    let cx = 0, cy = 0, cz = 0;
    for (let i = p.a; i < p.a + p.n; i++) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
    drift.x = cx / p.n; drift.y = cy / p.n; drift.z = cz / p.n;
  }

  /** takes the current shape of the pinched nodes as the pinch's shape */
  private shapeOf(p: Pinch): void {
    const x = this.x;
    this.centreOf(p);
    const cx = drift.x, cy = drift.y, cz = drift.z;
    for (let k = 0; k < p.n; k++) {
      const i = p.a + k;
      p.rest[3 * k] = x[3 * i] - cx; p.rest[3 * k + 1] = x[3 * i + 1] - cy; p.rest[3 * k + 2] = x[3 * i + 2] - cz;
    }
    p.q[0] = 0; p.q[1] = 0; p.q[2] = 0; p.q[3] = 1;
  }

  /**
   * Where the nodes of a pinch are pulled to: its shape, turned (R) and moved
   * (centre c) to fit them best. R is the rotation of A = Σ (x − c) restᵵ,
   * found by a few steps from the last one (Müller, Bender, Chentanez,
   * Macklin 2016, "A robust method to extract the rotational part of
   * deformations").
   */
  private pinchGoals(p: Pinch): void {
    const x = this.x, r = p.rest, out = this.pinchGoal;
    this.centreOf(p);
    const cx = drift.x, cy = drift.y, cz = drift.z;
    // A, by columns: A[:, j] = Σ (x − c) r[j]
    let a00 = 0, a10 = 0, a20 = 0, a01 = 0, a11 = 0, a21 = 0, a02 = 0, a12 = 0, a22 = 0;
    for (let k = 0; k < p.n; k++) {
      const i = p.a + k;
      const px = x[3 * i] - cx, py = x[3 * i + 1] - cy, pz = x[3 * i + 2] - cz;
      const rx = r[3 * k], ry = r[3 * k + 1], rz = r[3 * k + 2];
      a00 += px * rx; a10 += py * rx; a20 += pz * rx;
      a01 += px * ry; a11 += py * ry; a21 += pz * ry;
      a02 += px * rz; a12 += py * rz; a22 += pz * rz;
    }
    const q = p.q;
    let m00 = 1, m01 = 0, m02 = 0, m10 = 0, m11 = 1, m12 = 0, m20 = 0, m21 = 0, m22 = 1;
    for (let it = 0; it < 8; it++) {
      const [qx, qy, qz, qw] = q;
      m00 = 1 - 2 * (qy * qy + qz * qz); m01 = 2 * (qx * qy - qz * qw); m02 = 2 * (qx * qz + qy * qw);
      m10 = 2 * (qx * qy + qz * qw); m11 = 1 - 2 * (qx * qx + qz * qz); m12 = 2 * (qy * qz - qx * qw);
      m20 = 2 * (qx * qz - qy * qw); m21 = 2 * (qy * qz + qx * qw); m22 = 1 - 2 * (qx * qx + qy * qy);
      // ω = Σ_j R[:, j] × A[:, j] / |Σ_j R[:, j] · A[:, j]|
      const wx = (m10 * a20 - m20 * a10) + (m11 * a21 - m21 * a11) + (m12 * a22 - m22 * a12);
      const wy = (m20 * a00 - m00 * a20) + (m21 * a01 - m01 * a21) + (m22 * a02 - m02 * a22);
      const wz = (m00 * a10 - m10 * a00) + (m01 * a11 - m11 * a01) + (m02 * a12 - m12 * a02);
      const den = Math.abs(m00 * a00 + m10 * a10 + m20 * a20 + m01 * a01 + m11 * a11 + m21 * a21 + m02 * a02 + m12 * a12 + m22 * a22) + 1e-12;
      const ox = wx / den, oy = wy / den, oz = wz / den;
      const w = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (w < 1e-9) break;
      // q ← rotation of angle w about ω, times q
      const sh = Math.sin(w / 2) / w, ch = Math.cos(w / 2);
      const ux = ox * sh, uy = oy * sh, uz = oz * sh;
      const nx = ch * qx + ux * qw + uy * qz - uz * qy;
      const ny = ch * qy - ux * qz + uy * qw + uz * qx;
      const nz = ch * qz + ux * qy - uy * qx + uz * qw;
      const nw = ch * qw - ux * qx - uy * qy - uz * qz;
      const ql = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
      q[0] = nx / ql; q[1] = ny / ql; q[2] = nz / ql; q[3] = nw / ql;
    }
    for (let k = 0; k < p.n; k++) {
      const i = p.a + k;
      const rx = r[3 * k], ry = r[3 * k + 1], rz = r[3 * k + 2];
      out[3 * i] = cx + m00 * rx + m01 * ry + m02 * rz;
      out[3 * i + 1] = cy + m10 * rx + m11 * ry + m12 * rz;
      out[3 * i + 2] = cz + m20 * rx + m21 * ry + m22 * rz;
    }
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
      if (w[k] > 0) { this.ghost[i] = -1; this.handled[this.cableOf[i]] = 1; }
      else if (this.ghost[i] < 0) this.ghost[i] = this.P.ghostFrames;
    }
    if (n > 0) this.wakeCable(this.cableOf[start]);
  }

  // ---------------------------------------------------------------- step

  step(): void {
    const t0 = performance.now();
    const P = this.P;
    const h = P.dt / P.substeps;
    this.strokePlugs(P.dt);
    this.markDrawn();
    this.convert(h);
    this.markGateFree();
    this.markKept();
    // Contacts are found once per frame, with a speculative margin covering
    // the motion of the whole frame, then kept for all substeps.
    // (nothing falls asleep or wakes during the search: see `wakeNext`)
    this.refreshFixed();
    this.collide(P.dt);
    this.buildAdjacency();
    this.listAwake();
    // the pinch the hand is making takes the shape of the cord
    const ph = this.pinchHeld;
    if (ph) {
      if (this.grabNode < 0) this.pinchHeld = null;
      else { this.shapeOf(ph); this.pinchChanged = true; }
    }
    for (let s = 0; s < P.substeps; s++) this.substep(h);
    this.updateSleep();
    for (const ci of this.wakeNext) this.wakeCable(ci);
    this.wakeNext.length = 0;
    this.stats.ms = performance.now() - t0;
  }

  /** fills `R` for substeps of length h */
  private convert(h: number): void {
    const P = this.P, R = this.R;
    const hr = P.dt / P.refSubsteps;
    const r = h / hr;
    const kept = (f: number) => f ** r;
    R.mh = 1 / (hr * hr);
    R.hk = h * hr;
    R.mhk = 1 / R.hk;
    R.lamWarm = kept(P.lamWarm);
    R.lamWarmS = kept(P.lamWarmS);
    R.gamma = kept(P.gamma);
    R.alpha = kept(P.alpha);
    R.alphaS = kept(P.alphaS);
    R.maxDepen = P.maxDepen * r;
    R.restDecel = P.restFriction * r;
    R.keepPeel = P.keepPeel * r;
    R.maxMove = P.maxMove * r;
    R.pbdPasses = Math.max(1, Math.round(P.pbdPasses * r));
  }

  /** fills `drawnCable` and `drawn`, for this step */
  private markDrawn(): void {
    this.drawnCable.fill(0);
    this.drawn.fill(0);
    if (this.grabNode >= 0) {
      const ci = this.cableOf[this.grabNode], c = this.cables[ci];
      this.drawnCable[ci] = 1;
      this.drawn.fill(1, c.start, c.start + c.count);
    }
    for (const q of this.plugs) {
      const ci = this.cableOf[q.i0], c = this.cables[ci], f = PLUG_STROKE.free;
      this.drawnCable[ci] = 1;
      this.drawn.fill(1, Math.max(c.start, q.i0 - f), Math.min(c.start + c.count, q.i0 + f + 1));
    }
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
    if (this.grabNode < 0) return;
    const c = this.cables[this.cableOf[this.grabNode]];
    this.gateFree.fill(1, c.start, c.start + c.count);
    this.gateHold.fill(1, c.start, c.start + c.count);
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
    const tol = 0.002;
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
      const r = this.radius[i] - tol;
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
   * End of a substep: the kept nodes are put back within the height and
   * depth of their keeper. One of the held cord pulled out
   * further than `keepPeel` in a substep — the hand drawing it out, not its
   * own weight — comes free.
   */
  private keep(): void {
    const x = this.x, R = this.R;
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
        if (this.drawn[i] && d > R.keepPeel) { this.keepOf[i] = -1; continue; }
        x[3 * i + 1] = cy; x[3 * i + 2] = cz;
      }
    }
  }

  private substep(h: number): void {
    const P = this.P, R = this.R;
    const cables = this.cables, awake = this.awake, nAwake = this.nAwake;
    const x = this.x, x0 = this.x0, xt = this.xt, v = this.v;
    this.track();
    // contacts: separation at the start of the substep (α stabilisation), λ rebuilt
    for (let c = 0; c < this.nc; c++) { this.cc0[c] = this.contactC(c); this.clam[c] *= R.lamWarm; }
    for (let k = 0; k < 3 * this.nc; k++) this.clt[k] *= R.lamWarm;
    // bundles hold on to the centre of their nodes at the start of the substep
    for (const b of this.bundles) {
      if (!b.alive || b.nodes.length === 0) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const i of b.nodes) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
      b.cx = cx / b.nodes.length; b.cy = cy / b.nodes.length; b.cz = cz / b.nodes.length;
    }
    // pinches: where their nodes are pulled to, from where they start the substep
    for (const p of this.pinches) if (p !== this.pinchHeld && !cables[this.cableOf[p.a]].asleep) this.pinchGoals(p);
    // inertial prediction
    const gy = P.gravity * h * h;
    for (let q = 0; q < nAwake; q++) {
      const cb = cables[awake[q]];
      for (let i = cb.start; i < cb.start + cb.count; i++) {
        const j = 3 * i;
        x0[j] = x[j]; x0[j + 1] = x[j + 1]; x0[j + 2] = x[j + 2];
        if (this.fixed[i]) { xt[j] = x[j]; xt[j + 1] = x[j + 1]; xt[j + 2] = x[j + 2]; continue; }
        xt[j] = x[j] + h * v[j];
        xt[j + 1] = x[j + 1] + h * v[j + 1] + gy;
        xt[j + 2] = x[j + 2] + h * v[j + 2];
        x[j] = xt[j]; x[j + 1] = xt[j + 1]; x[j + 2] = xt[j + 2];
      }
    }
    for (let c = 0; c < this.nc; c++) {
      this.cF[c] = this.forgive(c);
      this.cC[c] = this.contactC(c);
      this.contactRel(c);
      this.cRel[3 * c] = drift.x; this.cRel[3 * c + 1] = drift.y; this.cRel[3 * c + 2] = drift.z;
    }
    // warm start of the stretch constraints (AVBD: λ ← αγλ, k ← γk) and
    // their error at the start of the substep, for the stabilisation
    // (not those of a sleeping cord: it wakes with the tension it fell asleep
    // with, rather than sagging while it rebuilds it)
    for (let s = 0; s < this.n; s++) {
      if (!this.segOK[s] || cables[this.cableOf[s]].asleep) continue;
      const m = Math.max(this.mass[s], this.mass[s + 1]) * R.mhk;
      this.lam[s] *= R.lamWarmS * R.gamma;
      this.segK[s] = Math.min(P.stretch * m, Math.max(P.kMin * m, this.segK[s] * R.gamma));
      const dx = x0[3 * s] - x0[3 * s + 3], dy = x0[3 * s + 1] - x0[3 * s + 4], dz = x0[3 * s + 2] - x0[3 * s + 5];
      this.segC0[s] = Math.sqrt(dx * dx + dy * dy + dz * dz) - this.rest[s];
    }
    for (let it = 0; it < P.iterations; it++) {
      this.flip = !this.flip;
      if (this.flip) {
        for (let q = 0; q < nAwake; q++) {
          const cb = cables[awake[q]];
          for (let i = cb.start; i < cb.start + cb.count; i++) if (!this.fixed[i]) this.solveNode(i, h);
        }
      } else {
        for (let q = nAwake - 1; q >= 0; q--) {
          const cb = cables[awake[q]];
          for (let i = cb.start + cb.count - 1; i >= cb.start; i--) if (!this.fixed[i]) this.solveNode(i, h);
        }
      }
      this.dualUpdate();
    }
    // kept nodes go back in first, and stay put in the length passes: those
    // take the slack from the free part of the cord rather than stretch it
    if (this.keepers.length) this.keep();
    for (let k = 0; k < R.pbdPasses; k++) this.inextensible(k % 2 === 0);
    if (this.keepers.length) this.keep();
    const damp = 1 / (1 + P.drag * h);
    const ih = 1 / h;
    for (let q = 0; q < nAwake; q++) {
      const cb = cables[awake[q]];
      for (let i = cb.start; i < cb.start + cb.count; i++) {
        const j = 3 * i;
        if (this.fixed[i]) { v[j] = 0; v[j + 1] = 0; v[j + 2] = 0; continue; }
        v[j] = (x[j] - x0[j]) * ih * damp;
        v[j + 1] = (x[j + 1] - x0[j + 1]) * ih * damp;
        v[j + 2] = (x[j + 2] - x0[j + 2]) * ih * damp;
      }
    }
    this.contactVelocities();
    // rest friction: a node pressed against something and barely moving stops
    // (the static friction a few sweeps cannot resolve), anything faster only
    // loses some speed — as much per second whatever the substep
    if (P.restFriction > 0) {
      const vs = P.restFriction, dv = R.restDecel;
      for (let q = 0; q < nAwake; q++) {
        const cb = cables[awake[q]];
        for (let i = cb.start; i < cb.start + cb.count; i++) {
          if (this.fixed[i] || this.adjStart[i + 1] === this.adjStart[i]) continue;
          let pressed = false;
          for (let e = this.adjStart[i]; e < this.adjStart[i + 1]; e++) if (this.clam[this.adjC[e]] < 0) { pressed = true; break; }
          if (!pressed) continue;
          const j = 3 * i;
          const sp = Math.sqrt(v[j] * v[j] + v[j + 1] * v[j + 1] + v[j + 2] * v[j + 2]);
          const f = sp > vs ? 1 - dv / sp : 0;
          v[j] *= f; v[j + 1] *= f; v[j + 2] *= f;
        }
      }
    }
  }

  /**
   * Start of a substep: the closest-point contacts move to where the two
   * segments are now closest. Found once a frame, a contact kept its point and
   * normal for every substep, and a cord the hand slid along a finger was held
   * off it at a spot it had left — the part now on the finger sank into it.
   * The normal does not turn over: a cord pushed past a finger's axis is still
   * pushed back out the side it came from, not through. The friction anchor
   * shifts with the point, as when a contact is found again (`pushContact`).
   */
  private track(): void {
    const x = this.x;
    for (let c = 0; c < this.nc; c++) {
      if (!this.ctrack[c]) continue;
      const a0 = this.ca0[c], b0 = this.cb0[c];
      const sid = this.csh[c];
      const pa = 3 * a0, pb = 3 * this.ca1[c];
      let q0x: number, q0y: number, q0z: number, q1x: number, q1y: number, q1z: number;
      if (b0 >= 0) {
        const qa = 3 * b0, qb = 3 * this.cb1[c];
        q0x = x[qa]; q0y = x[qa + 1]; q0z = x[qa + 2]; q1x = x[qb]; q1y = x[qb + 1]; q1z = x[qb + 2];
      } else {
        const sh = this.statics[sid] as StaticCapsule;
        q0x = sh.ax; q0y = sh.ay; q0z = sh.az; q1x = sh.bx; q1y = sh.by; q1z = sh.bz;
      }
      segSeg(x[pa], x[pa + 1], x[pa + 2], x[pb], x[pb + 1], x[pb + 2], q0x, q0y, q0z, q1x, q1y, q1z);
      const s = closest.s, t = closest.t;
      const ds = s - this.cs[c], dt = b0 >= 0 ? t - this.ct[c] : 0;
      const pax = x[pa] + (x[pb] - x[pa]) * s, pay = x[pa + 1] + (x[pb + 1] - x[pa + 1]) * s, paz = x[pa + 2] + (x[pb + 2] - x[pa + 2]) * s;
      const qx = q0x + (q1x - q0x) * t, qy = q0y + (q1y - q0y) * t, qz = q0z + (q1z - q0z) * t;
      let nx = pax - qx, ny = pay - qy, nz = paz - qz;
      const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const j = 3 * c;
      if (d > 1e-9 && nx * this.cn[j] + ny * this.cn[j + 1] + nz * this.cn[j + 2] > 0) {
        nx /= d; ny /= d; nz /= d;
        this.cn[j] = nx; this.cn[j + 1] = ny; this.cn[j + 2] = nz;
      }
      this.cs[c] = s; this.ct[c] = t;
      if (b0 < 0) { this.cq[j] = qx; this.cq[j + 1] = qy; this.cq[j + 2] = qz; }
      this.shiftAnchor(c, ds, dt);
    }
  }

  /**
   * The friction anchor of contact c follows its points, which moved by ds
   * along its segment and dt along the other's: it still marks the same spots
   * of the cords, rather than being dragged by the move.
   */
  private shiftAnchor(c: number, ds: number, dt: number): void {
    const x = this.x, a0 = 3 * this.ca0[c], a1 = 3 * this.ca1[c], b0 = this.cb0[c];
    for (let k = 0; k < 3; k++) {
      let shift = (x[a1 + k] - x[a0 + k]) * ds;
      if (b0 >= 0) shift -= (x[3 * this.cb1[c] + k] - x[3 * b0 + k]) * dt;
      this.canc[3 * c + k] += shift;
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
        let denom = 0;
        for (let k = 0; k < 4; k++) {
          const i = k === 0 ? a0 : k === 1 ? a1 : k === 2 ? b0 : b1;
          if (i < 0 || this.fixed[i]) continue;
          const w = k === 0 ? ws0 : k === 1 ? ws1 : k === 2 ? wt0 : wt1;
          denom += w * w / this.mass[i];
        }
        if (denom <= 0) continue;
        // relative velocity of the two contact points (fixed nodes are at rest)
        this.contactRel(c, v);
        const rx = drift.x, ry = drift.y, rz = drift.z;
        const vn = rx * nx + ry * ny + rz * nz;
        const imp = vn > 0 ? -vn / denom : 0;
        // and a share of the sliding velocity, as kinetic friction would
        const tx = rx - vn * nx, ty = ry - vn * ny, tz = rz - vn * nz;
        const td = P.contactDamping / denom;
        if (!(vn > 0 || td > 0)) continue;
        for (let k = 0; k < 4; k++) {
          const i = k === 0 ? a0 : k === 1 ? a1 : k === 2 ? b0 : b1;
          if (i < 0 || this.fixed[i]) continue;
          const w = k === 0 ? ws0 : k === 1 ? ws1 : k === 2 ? wt0 : wt1;
          const f = (w * imp) / this.mass[i];
          const g = (w * td) / this.mass[i];
          v[3 * i] += f * nx - g * tx; v[3 * i + 1] += f * ny - g * ty; v[3 * i + 2] += f * nz - g * tz;
        }
      }
    }
  }

  private listAwake(): void {
    if (this.awake.length < this.cables.length) this.awake = new Int32Array(this.cables.length);
    let n = 0;
    for (let ci = 0; ci < this.cables.length; ci++) if (!this.cables[ci].asleep) this.awake[n++] = ci;
    this.nAwake = n;
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
    const P = this.P, R = this.R;
    const x = this.x;
    const j = 3 * i;
    const xi = x[j], yi = x[j + 1], zi = x[j + 2];
    const m = this.mass[i];
    const a = m / (h * h);
    // the unit of the soft stiffnesses, M/h² of the reference substep
    const mh = m * R.mh;
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
      const C = len - this.rest[s] - R.alphaS * this.segC0[s];
      const f = k * C + this.lam[s];
      gx += f * ux; gy += f * uy; gz += f * uz;
      // Gauss-Newton term + |f|/len (I − uuᵀ): the geometric stiffness kept
      // positive, which steadies a taut cable bent around a hook
      const geo = Math.abs(f) / len;
      const kk = k - geo;
      h00 += kk * ux * ux + geo; h11 += kk * uy * uy + geo; h22 += kk * uz * uz + geo;
      h01 += kk * ux * uy; h02 += kk * ux * uz; h12 += kk * uy * uz;
    }

    // --- bending: E = kb/2 |x[c−1] − 2x[c] + x[c+1]|² for the three stencils around i
    for (let c = i - 1; c <= i + 1; c++) {
      if (c - 1 < 0 || c + 1 >= this.n) continue;
      if (!this.segOK[c - 1] || !this.segOK[c]) continue;
      const kb = this.bendK[c];
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
      const C = this.cC[c] - this.cF[c];
      const k = this.ck[c];
      const f = k * C + this.clam[c];
      if (f >= 0) continue;
      gx += f * w * nx; gy += f * w * ny; gz += f * w * nz;
      const kw = k * w * w;
      h00 += kw * nx * nx; h11 += kw * ny * ny; h22 += kw * nz * nz;
      h01 += kw * nx * ny; h02 += kw * nx * nz; h12 += kw * ny * nz;
      // friction, clamped to the cone (its stiffness rescaled for the Hessian)
      const mu = this.cmu[c];
      if (mu <= 0) continue;
      const ke = this.friction(c, mu * -f) ? fric.k * fric.s : fric.k;
      gx += fric.x * w; gy += fric.y * w; gz += fric.z * w;
      const kt2 = ke * w * w;
      h00 += kt2 * (1 - nx * nx); h11 += kt2 * (1 - ny * ny); h22 += kt2 * (1 - nz * nz);
      h01 -= kt2 * nx * ny; h02 -= kt2 * nx * nz; h12 -= kt2 * ny * nz;
    }

    // --- springs on a leash, each pulling from at most its lead away: the
    // hands (the one that drags, the other that holds), a connector pushed
    // into its port as by the hand, a route goal
    const gw = this.goalW[i];
    for (let s = 0; s < 3; s++) {
      let t: ArrayLike<number>, o = j, k = P.grabK * mh * 4, lead = P.grabLead;
      if (s === 0) {
        if (i !== this.grabNode && i !== this.holdNode) continue;
        t = i === this.grabNode ? this.grabTarget : this.holdTarget; o = 0;
      } else if (s === 1) {
        if (!this.plugging[i]) continue;
        t = this.plugAt;
      } else {
        if (gw <= 0) continue;
        t = this.goal; k = P.goalK * gw * mh; lead = P.goalLead;
      }
      leash(xi, yi, zi, t, o, lead);
      gx += k * pull.x; gy += k * pull.y; gz += k * pull.z;
      h00 += k; h11 += k; h22 += k;
    }

    // --- pinch: towards the node's place in the shape (not while the hand is still making it)
    const pk = this.pinchOf[i];
    if (pk >= 0 && this.pinches[pk] !== this.pinchHeld) {
      const kp = P.pinchK * this.pinches[pk].s * mh;
      const g = this.pinchGoal;
      gx += kp * (xi - g[j]); gy += kp * (yi - g[j + 1]); gz += kp * (zi - g[j + 2]);
      h00 += kp; h11 += kp; h22 += kp;
    }

    // --- keeper, so that the solve itself carries the cord hanging from the
    // kept part (rather than `keep` putting the nodes back after it, against
    // the solve: the cord stretched, and sprang back when let go)
    const ki = this.keepOf[i];
    if (ki >= 0) {
      const b = this.keepers[ki], r = this.radius[i];
      const kk = P.keepK * mh;
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
      if (ey !== 0) { gy += kk * ey; h11 += kk; }
      if (ez !== 0) { gz += kk * ez; h22 += kk; }
    }

    // --- velcro
    const bi = this.bundleOf[i];
    if (bi >= 0) {
      const b = this.bundles[bi];
      const dx = xi - b.cx, dy = yi - b.cy, dz = zi - b.cz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const C = len - b.r;
      if (C > 0 && len > 1e-9) {
        const kb = 0.3 * mh;
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
    if (L > R.maxMove) { const f = R.maxMove / L; dx *= f; dy *= f; dz *= f; }
    x[j] = xi + dx; x[j + 1] = yi + dy; x[j + 2] = zi + dz;
    for (let e = this.adjStart[i]; e < this.adjStart[i + 1]; e++) {
      const c = this.adjC[e], w = this.adjW[e];
      this.cC[c] += w * (this.cn[3 * c] * dx + this.cn[3 * c + 1] * dy + this.cn[3 * c + 2] * dz);
      this.cRel[3 * c] += w * dx; this.cRel[3 * c + 1] += w * dy; this.cRel[3 * c + 2] += w * dz;
    }
  }

  /** node i is moved as by a hand: one of the two hands, or a connector on its way into a port */
  private byHand(i: number): boolean {
    return i === this.grabNode || i === this.holdNode || this.plugging[i] === 1;
  }

  /**
   * Position projection of the segment lengths (PBD), one sweep along every
   * cord: what the block descent leaves of a stretch under load (a heap, the
   * hand) is taken out here. Pins and sleeping nodes do not move; the nodes
   * of the hands are heavy, so the cord follows them rather than the opposite.
   */
  private inextensible(forward: boolean): void {
    const x = this.x;
    // the hands' nodes are heavy; a node a keeper holds does not move for its
    // free neighbour (between two kept nodes, both do)
    const w = (i: number) => (this.fixed[i] ? 0 : this.byHand(i) ? 0.1 / this.mass[i] : 1 / this.mass[i]);
    const kept = this.keepOf;
    for (let q = 0; q < this.nAwake; q++) {
      const cb = this.cables[this.awake[forward ? q : this.nAwake - 1 - q]];
      for (let k = 0; k < cb.count - 1; k++) {
        const s = forward ? cb.start + k : cb.start + cb.count - 2 - k;
        if (!this.segOK[s]) continue;
        const ka = kept[s] >= 0, kb = kept[s + 1] >= 0;
        const wa = ka && !kb ? 0 : w(s), wb = kb && !ka ? 0 : w(s + 1);
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
  }

  private dualUpdate(): void {
    const P = this.P, R = this.R;
    const x = this.x;
    for (let q = 0; q < this.nAwake; q++) {
      const cb = this.cables[this.awake[q]];
      for (let s = cb.start; s < cb.start + cb.count - 1; s++) {
        if (!this.segOK[s]) continue;
        if (this.fixed[s] && this.fixed[s + 1]) continue;
        const dx = x[3 * s] - x[3 * s + 3], dy = x[3 * s + 1] - x[3 * s + 4], dz = x[3 * s + 2] - x[3 * s + 5];
        const C = Math.sqrt(dx * dx + dy * dy + dz * dz) - this.rest[s] - R.alphaS * this.segC0[s];
        this.lam[s] += this.segK[s] * C;
        const kmax = P.stretch * Math.max(this.mass[s], this.mass[s + 1]) * R.mhk;
        this.segK[s] = Math.min(kmax, this.segK[s] + P.beta * Math.abs(C) * kmax / P.stretch);
      }
    }
    for (let c = 0; c < this.nc; c++) {
      const C = this.cC[c] - this.cF[c];
      if (Math.abs(C) < 1e-7) continue;
      const lam = Math.min(0, this.clam[c] + this.ck[c] * C);
      this.clam[c] = lam;
      if (lam < 0) this.ck[c] = Math.min(this.ckmax[c], this.ck[c] + P.beta * Math.abs(C) * this.cmh[c]);
    }
    this.frictionDual();
  }

  /**
   * Dual update of the friction (AVBD §3.3): the tangential multiplier takes
   * over the force of the anchor spring; past the cone μ·λn it is clamped and
   * the contact slides — its anchor follows it. A contact that does not press
   * lets go of both.
   */
  private frictionDual(): void {
    for (let c = 0; c < this.nc; c++) {
      const lam = this.clam[c], mu = this.cmu[c];
      let slides = true;
      if (lam < 0 && mu > 0) {
        slides = this.friction(c, mu * -lam);
        this.clt[3 * c] = fric.x; this.clt[3 * c + 1] = fric.y; this.clt[3 * c + 2] = fric.z;
      } else {
        this.clt[3 * c] = 0; this.clt[3 * c + 1] = 0; this.clt[3 * c + 2] = 0;
      }
      if (slides) { this.canc[3 * c] = this.cRel[3 * c]; this.canc[3 * c + 1] = this.cRel[3 * c + 1]; this.canc[3 * c + 2] = this.cRel[3 * c + 2]; }
    }
  }

  /**
   * The friction force of contact c, λt + kt·d, d its tangential drift from
   * its anchor, clamped to the cone of radius `lim` (μ·N), into `fric` (kt
   * into `fric.k`, and the factor it was clamped by into `fric.s`). Returns
   * whether it was clamped: the contact slides.
   */
  private friction(c: number, lim: number): boolean {
    const nx = this.cn[3 * c], ny = this.cn[3 * c + 1], nz = this.cn[3 * c + 2];
    let dx = this.cRel[3 * c] - this.canc[3 * c], dy = this.cRel[3 * c + 1] - this.canc[3 * c + 1], dz = this.cRel[3 * c + 2] - this.canc[3 * c + 2];
    const dn = dx * nx + dy * ny + dz * nz;
    dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
    const kt = this.P.frictionK * this.cmh[c];
    const lx = this.clt[3 * c], ly = this.clt[3 * c + 1], lz = this.clt[3 * c + 2];
    const ln = lx * nx + ly * ny + lz * nz;
    let Fx = kt * dx + lx - ln * nx, Fy = kt * dy + ly - ln * ny, Fz = kt * dz + lz - ln * nz;
    const F = Math.sqrt(Fx * Fx + Fy * Fy + Fz * Fz);
    const slides = F > lim;
    if (slides) { const sc = lim / F; Fx *= sc; Fy *= sc; Fz *= sc; fric.s = sc; }
    fric.x = Fx; fric.y = Fy; fric.z = Fz; fric.k = kt;
    return slides;
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
    const R = this.R;
    return Math.min(R.alpha * c0, c0 + R.maxDepen);
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
    this.contactRel(c);
    let rx = drift.x, ry = drift.y, rz = drift.z;
    if (this.cb0[c] < 0) { rx -= this.cq[3 * c]; ry -= this.cq[3 * c + 1]; rz -= this.cq[3 * c + 2]; }
    return this.cn[3 * c] * rx + this.cn[3 * c + 1] * ry + this.cn[3 * c + 2] * rz - this.crs[c];
  }

  /**
   * The one place where a contact's geometry is read: pA − pB of a field of
   * the nodes (the positions by default, or their velocities…) at the contact
   * points, into `drift` — pA alone against the rack, which does not move. C,
   * the friction drift and the relative velocity all come from it.
   */
  private contactRel(c: number, f: Float64Array = this.x): void {
    const s = this.cs[c];
    const a0 = 3 * this.ca0[c], a1 = 3 * this.ca1[c];
    let rx = f[a0] + (f[a1] - f[a0]) * s, ry = f[a0 + 1] + (f[a1 + 1] - f[a0 + 1]) * s, rz = f[a0 + 2] + (f[a1 + 2] - f[a0 + 2]) * s;
    if (this.cb0[c] >= 0) {
      const t = this.ct[c];
      const b0 = 3 * this.cb0[c], b1 = 3 * this.cb1[c];
      rx -= f[b0] + (f[b1] - f[b0]) * t; ry -= f[b0 + 1] + (f[b1 + 1] - f[b0 + 1]) * t; rz -= f[b0 + 2] + (f[b1 + 2] - f[b0 + 2]) * t;
    }
    drift.x = rx; drift.y = ry; drift.z = rz;
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
    this.cmu = gf(this.cmu); this.ckmax = gf(this.ckmax); this.cmh = gf(this.cmh); this.ckey = gf(this.ckey);
    this.canc = gf(this.canc, 3);
    this.clt = gf(this.clt, 3);
    this.cC = gf(this.cC); this.cRel = gf(this.cRel, 3); this.cF = gf(this.cF);
    const t8 = new Uint8Array(cap); t8.set(this.ctrack); this.ctrack = t8;
    this.csh = gi(this.csh);
    this.cap = cap;
  }

  private pushContact(
    key: number, a0: number, a1: number, s: number, b0: number, b1: number, t: number,
    nx: number, ny: number, nz: number, qx: number, qy: number, qz: number, rs: number, C: number, mu: number,
  ): void {
    const c = this.nc++;
    this.ensureCap(this.nc);
    const old = this.warm.get(key);
    this.ca0[c] = a0; this.ca1[c] = a1; this.cs[c] = s;
    this.cb0[c] = b0; this.cb1[c] = b1; this.ct[c] = t;
    this.cn[3 * c] = nx; this.cn[3 * c + 1] = ny; this.cn[3 * c + 2] = nz;
    this.cq[3 * c] = qx; this.cq[3 * c + 1] = qy; this.cq[3 * c + 2] = qz;
    this.crs[c] = rs; this.cc0[c] = C; this.cmu[c] = mu;
    this.ctrack[c] = 0; this.csh[c] = -1;
    let m = Math.max(this.mass[a0], this.mass[a1]);
    if (b0 >= 0) m = Math.max(m, this.mass[b0], this.mass[b1]);
    const mh2 = m / this.R.hk;
    const kmax = (b0 >= 0 ? this.P.kCapCable : this.drawnCable[this.cableOf[a0]] ? this.P.kCapHeld : this.P.kCap) * mh2;
    this.ckmax[c] = kmax;
    this.cmh[c] = mh2;
    const kmin = this.P.kMin * mh2;
    this.ck[c] = old !== undefined ? Math.max(kmin, Math.min(kmax, this.prevK[old] * this.P.gamma)) : kmin;
    this.clam[c] = old !== undefined ? this.prevLam[old] : 0;
    this.ckey[c] = key;
    if (old !== undefined) {
      this.canc[3 * c] = this.prevAnc[3 * old]; this.canc[3 * c + 1] = this.prevAnc[3 * old + 1]; this.canc[3 * c + 2] = this.prevAnc[3 * old + 2];
      this.clt[3 * c] = this.prevLt[3 * old]; this.clt[3 * c + 1] = this.prevLt[3 * old + 1]; this.clt[3 * c + 2] = this.prevLt[3 * old + 2];
      // the closest points moved along the segments since last frame (a
      // sticking contact would otherwise be dragged by the re-detection)
      this.shiftAnchor(c, s - this.prevS[old], t - this.prevT[old]);
    } else {
      this.clt[3 * c] = 0; this.clt[3 * c + 1] = 0; this.clt[3 * c + 2] = 0;
      this.contactRel(c);
      this.canc[3 * c] = drift.x; this.canc[3 * c + 1] = drift.y; this.canc[3 * c + 2] = drift.z;
    }
  }

  /** key of the contacts between segments lo < hi */
  private pairKey(lo: number, hi: number): number {
    return 4 * (lo * this.n + hi);
  }

  /** key of the contacts between segment a and static shape sid, after every pair key */
  private staticKey(a: number, sid: number): number {
    return 4 * (this.n * this.n + a * this.statics.length + sid);
  }

  private collide(frame: number): void {
    const P = this.P;
    // remember the stiffness of last substep's contacts, and those of the
    // sleeping cables (see `dormant`)
    this.warm.clear();
    const nCab = this.cables.length;
    if (this.wasAsleep.length < nCab) this.wasAsleep = new Uint8Array(nCab);
    for (let ci = 0; ci < nCab; ci++) this.wasAsleep[ci] = this.cables[ci].asleep ? 1 : 0;
    const total = this.nc + this.dormant.size;
    if (this.prevK.length < total) {
      const cap = Math.max(this.cap, total);
      this.prevK = new Float64Array(cap); this.prevLam = new Float64Array(cap); this.prevAnc = new Float64Array(3 * cap);
      this.prevLt = new Float64Array(3 * cap);
      this.prevS = new Float64Array(cap); this.prevT = new Float64Array(cap);
    }
    for (let c = 0; c < this.nc; c++) {
      this.warm.set(this.ckey[c], c);
      this.prevK[c] = this.ck[c];
      this.prevLam[c] = this.clam[c]; // never positive
      this.prevAnc[3 * c] = this.canc[3 * c]; this.prevAnc[3 * c + 1] = this.canc[3 * c + 1]; this.prevAnc[3 * c + 2] = this.canc[3 * c + 2];
      this.prevLt[3 * c] = this.clt[3 * c]; this.prevLt[3 * c + 1] = this.clt[3 * c + 1]; this.prevLt[3 * c + 2] = this.clt[3 * c + 2];
      this.prevS[c] = this.cs[c]; this.prevT[c] = this.ct[c];
    }
    let at = this.nc;
    for (const [key, d] of this.dormant) {
      if (this.warm.has(key)) continue;
      this.warm.set(key, at);
      this.prevK[at] = d[0]; this.prevLam[at] = d[1];
      this.prevAnc[3 * at] = d[2]; this.prevAnc[3 * at + 1] = d[3]; this.prevAnc[3 * at + 2] = d[4];
      this.prevLt[3 * at] = d[5]; this.prevLt[3 * at + 1] = d[6]; this.prevLt[3 * at + 2] = d[7];
      this.prevS[at] = d[8]; this.prevT[at] = d[9];
      at++;
    }
    // last frame's contacts whose cables have all fallen asleep will not be
    // found again: they wait for them to wake
    for (let c = 0; c < this.nc; c++) {
      const ca = this.cableOf[this.ca0[c]], cb = this.cb0[c] >= 0 ? this.cableOf[this.cb0[c]] : -1;
      if (!this.wasAsleep[ca] || (cb >= 0 && !this.wasAsleep[cb])) continue;
      this.dormant.set(this.ckey[c], Float64Array.of(
        this.prevK[c], this.prevLam[c],
        this.canc[3 * c], this.canc[3 * c + 1], this.canc[3 * c + 2],
        this.clt[3 * c], this.clt[3 * c + 1], this.clt[3 * c + 2],
        this.cs[c], this.ct[c], ca, cb,
      ));
    }
    this.nc = 0;
    const x = this.x, v = this.v;
    const N = this.n;
    let rMax = 0, lMax = 0;
    for (let i = 0; i < N; i++) {
      if (this.radius[i] > rMax) rMax = this.radius[i];
      if (this.segOK[i] && this.rest[i] > lMax) lMax = this.rest[i];
    }
    // two segments can touch only if their midpoints are within `reach` (see
    // below), at most one cell apart
    const cell = lMax + 2 * rMax + P.marginCap + 1e-4;
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
    if (this.hashFill.length < HC) this.hashFill = new Int32Array(HC);
    const fillAt = this.hashFill;
    fillAt.set(count.subarray(0, HC));
    // what the pair test reads of each segment, copied in bucket order: the
    // inner loop then walks memory in sequence instead of jumping around x
    if (this.sMid.length < 3 * N) {
      this.sMid = new Float64Array(3 * N); this.sCell = new Int32Array(3 * N);
      this.sReach = new Float64Array(N); this.sFixed = new Uint8Array(N); this.slot = new Int32Array(N);
    }
    const sMid = this.sMid, sCell = this.sCell, sReach = this.sReach, sFixed = this.sFixed, items = this.hashItems;
    for (let i = 0; i < N; i++) {
      if (!this.segOK[i]) continue;
      const b = cellKey(this.segCell[3 * i], this.segCell[3 * i + 1], this.segCell[3 * i + 2]) & (HC - 1);
      const e = fillAt[b]++;
      items[e] = i;
      this.slot[i] = e;
      sMid[3 * e] = (x[3 * i] + x[3 * i + 3]) * 0.5;
      sMid[3 * e + 1] = (x[3 * i + 1] + x[3 * i + 4]) * 0.5;
      sMid[3 * e + 2] = (x[3 * i + 2] + x[3 * i + 5]) * 0.5;
      sCell[3 * e] = this.segCell[3 * i]; sCell[3 * e + 1] = this.segCell[3 * i + 1]; sCell[3 * e + 2] = this.segCell[3 * i + 2];
      sReach[e] = this.rest[i] * 0.5 + this.radius[i];
      sFixed[e] = this.fixed[i] & this.fixed[i + 1];
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
      const ea = this.slot[a];
      const aFixed = sFixed[ea] === 1;
      const va = segSpeed[a];
      const amx = sMid[3 * ea], amy = sMid[3 * ea + 1], amz = sMid[3 * ea + 2];
      const aReach = sReach[ea] + P.marginCap;
      // each pair of cells once: this cell, and the 13 neighbours "after" it
      for (let ox = 0; ox <= 1; ox++)
        for (let oy = ox ? -1 : 0; oy <= 1; oy++)
          for (let oz = ox || oy ? -1 : 0; oz <= 1; oz++) {
            const home = ox === 0 && oy === 0 && oz === 0;
            const ncx = acx + ox, ncy = acy + oy, ncz = acz + oz;
            const bucket = cellKey(ncx, ncy, ncz) & (HC - 1);
            for (let e = count[bucket]; e < count[bucket + 1]; e++) {
              if (home ? e <= ea : e === ea) continue;
              const bFixed = sFixed[e] === 1;
              if (aFixed && bFixed) continue;
              // cheap rejection on the distance of the midpoints
              const mdx = amx - sMid[3 * e], mdy = amy - sMid[3 * e + 1], mdz = amz - sMid[3 * e + 2];
              const reach = aReach + sReach[e];
              if (mdx * mdx + mdy * mdy + mdz * mdz > reach * reach) continue;
              // a segment of another cell sharing the bucket
              if (sCell[3 * e] !== ncx || sCell[3 * e + 1] !== ncy || sCell[3 * e + 2] !== ncz) continue;
              const b = items[e];
              const cb = this.cableOf[b];
              if (ca === cb && Math.abs(b - a) <= 2) continue;
              const vb = segSpeed[b];
              const rs = this.radius[a] + this.radius[b];
              const margin = Math.min(P.marginCap, P.margin + (va + vb) * frame * 1.2);
              segSeg(
                x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
                x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5],
              );
              const lim = rs + margin;
              if (closest.d2 > lim * lim) continue;
              // a cord being laid along a route passes through the others
              if (ca !== cb && (this.ghost[a] || this.ghost[a + 1] || this.ghost[b] || this.ghost[b + 1])) {
                if (closest.d2 < rs * rs) { this.ghostTouch[a] = 1; this.ghostTouch[b] = 1; }
                continue;
              }
              // a sleeping cable wakes up when something moving touches it, or
              // sinks into it (not for an overlap at rest: two cords wedged
              // into one another would wake each other in turn for ever)
              if (aFixed !== bFixed) {
                const mover = aFixed ? vb : va;
                const sleeper = aFixed ? ca : cb;
                if (this.cables[sleeper].asleep && (mover > P.wakeSpeed || (mover > 0.2 * P.wakeSpeed && Math.sqrt(closest.d2) < rs - 2e-3))) {
                  this.wakeNext.push(sleeper);
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
                this.pairKey(lo, hi), lo, hi,
                x[3 * hi], x[3 * hi + 1], x[3 * hi + 2], x[3 * hi + 3], x[3 * hi + 4], x[3 * hi + 5],
                rs, lim, P.muCable,
              );
            }
          }
    }

    this.clearGhosts();

    // --- cable vs rack
    const SC = this.SCELL;
    for (let a = 0; a < N; a++) {
      if (!this.segOK[a]) continue;
      if (this.fixed[a] && this.fixed[a + 1]) continue;
      // a connector going into its port passes the fingers of the guides on its way, as when it was pinned
      if (this.plugging[a] && this.plugging[a + 1]) continue;
      const mx = (x[3 * a] + x[3 * a + 3]) * 0.5, my = (x[3 * a + 1] + x[3 * a + 4]) * 0.5, mz = (x[3 * a + 2] + x[3 * a + 5]) * 0.5;
      const list = this.staticGrid.get(cellKey(Math.floor(mx / SC), Math.floor(my / SC), Math.floor(mz / SC)));
      if (!list) continue;
      const r = this.radius[a];
      const va = segSpeed[a];
      const margin = Math.min(P.marginStatic, P.margin + va * frame * 1.2);
      const free = this.gateFree[a] || this.gateFree[a + 1];
      const held = !free && (this.gateHold[a] || this.gateHold[a + 1]);
      for (const sid of list) {
        const sh = this.statics[sid] as StaticCapsule | StaticBox; // keepers are not in the grid
        if (sh.gate && free) continue;
        if (sh.gate && held && this.acrossGate(a, sh, r)) { this.gateAcross[a] = 1; continue; }
        const mu = sh.mu ?? P.muStatic;
        const key = this.staticKey(a, sid);
        if (sh.kind === 'capsule') {
          segSeg(
            x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
            sh.ax, sh.ay, sh.az, sh.bx, sh.by, sh.bz,
          );
          const rs = r + sh.r;
          const lim = rs + margin;
          if (closest.d2 > lim * lim) continue;
          this.pairContacts(key, a, -1, sh.ax, sh.ay, sh.az, sh.bx, sh.by, sh.bz, rs, lim, mu, sid);
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
              key + e, a, a + 1, e, -1, -1, 0, boxHit.nx, boxHit.ny, boxHit.nz,
              boxHit.qx, boxHit.qy, boxHit.qz, r, boxHit.dist - r, mu,
            );
          }
          segBox(
            x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
            sh.min[0], sh.min[1], sh.min[2], sh.max[0], sh.max[1], sh.max[2],
          );
          if (boxHit.dist > lim || boxHit.s < 0.05 || boxHit.s > 0.95 || boxHit.dist > dEnds - 5e-4) continue;
          this.pushContact(
            key + 2, a, a + 1, boxHit.s, -1, -1, 0, boxHit.nx, boxHit.ny, boxHit.nz,
            boxHit.qx, boxHit.qy, boxHit.qz, r, boxHit.dist - r, mu,
          );
        }
      }
    }
    // segments that have slipped free of every gate collide with them again
    for (let a = 0; a < N; a++) {
      if (this.gateHold[a] && !this.gateFree[a] && !this.gateAcross[a] && !(this.fixed[a] && this.fixed[a + 1])) this.gateHold[a] = 0;
    }
    this.gateAcross.fill(0);
    // a dormant contact of a cable that was awake for this search has been
    // found again (and carries on), or is gone
    for (const [key, d] of this.dormant) {
      if (!this.wasAsleep[d[10]] || (d[11] >= 0 && !this.wasAsleep[d[11]])) this.dormant.delete(key);
    }
    this.stats.contacts = this.nc;
  }

  /** ghosts let go become solid where they overlap no other cord, or once their time is up */
  private clearGhosts(): void {
    const g = this.ghost, t = this.ghostTouch;
    for (let i = 0; i < this.n; i++) {
      if (g[i] <= 0) continue;
      const touch = (i > 0 && this.cableOf[i - 1] === this.cableOf[i] && t[i - 1]) || t[i];
      g[i] = touch ? g[i] - 1 : 0;
    }
    t.fill(0);
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
    rs: number, lim: number, mu: number, sid = -1,
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
        this.emitAt(key, a, b, lo, q0x, q0y, q0z, wx, wy, wz, ww, rs, lim, mu);
        this.emitAt(key + 2, a, b, hi, q0x, q0y, q0z, wx, wy, wz, ww, rs, lim, mu);
        // and the closest point, when it dips well below both ends
        if (dc > Math.min(this.endGap[0], this.endGap[1]) - 5e-4 || closest.s <= lo || closest.s >= hi) return;
        key += 1;
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
    this.pushPair(key, a, b, s, t, nx, ny, nz, qx, qy, qz, rs, d, mu);
    this.ctrack[this.nc - 1] = cross >= 0.06 * uu * ww ? 1 : 0;
    this.csh[this.nc - 1] = sid;
  }

  /** a contact between segment a and segment b of a cable, or a static capsule (b = −1, its point q), d apart */
  private pushPair(
    key: number, a: number, b: number, s: number, t: number,
    nx: number, ny: number, nz: number, qx: number, qy: number, qz: number, rs: number, d: number, mu: number,
  ): void {
    if (b >= 0) this.pushContact(key, a, a + 1, s, b, b + 1, t, nx, ny, nz, 0, 0, 0, rs, d - rs, mu);
    else this.pushContact(key, a, a + 1, s, -1, -1, 0, nx, ny, nz, qx, qy, qz, rs, d - rs, mu);
  }

  /** gaps between the two segments at the ends of their overlap (set by endsAgree) */
  private endGap = [0, 0];

  /** the point at s along segment a, and the t of the point of segment B = q0 + t·w closest to it, into `proj` */
  private pointOn(a: number, s: number, q0x: number, q0y: number, q0z: number, wx: number, wy: number, wz: number, ww: number): void {
    const x = this.x;
    const px = x[3 * a] + (x[3 * a + 3] - x[3 * a]) * s;
    const py = x[3 * a + 1] + (x[3 * a + 4] - x[3 * a + 1]) * s;
    const pz = x[3 * a + 2] + (x[3 * a + 5] - x[3 * a + 2]) * s;
    const t = ((px - q0x) * wx + (py - q0y) * wy + (pz - q0z) * wz) / ww;
    proj.x = px; proj.y = py; proj.z = pz; proj.t = t < 0 ? 0 : t > 1 ? 1 : t;
  }

  /** do the ends lo and hi of segment a lie on the same side of segment B? */
  private endsAgree(a: number, lo: number, hi: number, q0x: number, q0y: number, q0z: number, wx: number, wy: number, wz: number, ww: number): boolean {
    let ox = 0, oy = 0, oz = 0, dot = 0;
    for (let k = 0; k < 2; k++) {
      this.pointOn(a, k === 0 ? lo : hi, q0x, q0y, q0z, wx, wy, wz, ww);
      const pax = proj.x, pay = proj.y, paz = proj.z, t = proj.t;
      const dx = pax - q0x - wx * t, dy = pay - q0y - wy * t, dz = paz - q0z - wz * t;
      this.endGap[k] = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (k === 0) { ox = dx; oy = dy; oz = dz; } else dot = dx * ox + dy * oy + dz * oz;
    }
    return dot > 0;
  }

  private emitAt(
    key: number, a: number, b: number, s: number,
    q0x: number, q0y: number, q0z: number, wx: number, wy: number, wz: number, ww: number,
    rs: number, lim: number, mu: number,
  ): void {
    this.pointOn(a, s, q0x, q0y, q0z, wx, wy, wz, ww);
    const pax = proj.x, pay = proj.y, paz = proj.z, t = proj.t;
    const qx = q0x + wx * t, qy = q0y + wy * t, qz = q0z + wz * t;
    let nx = pax - qx, ny = pay - qy, nz = paz - qz;
    const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (d > lim) return;
    if (d < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
    this.pushPair(key, a, b, s, t, nx, ny, nz, qx, qy, qz, rs, d, mu);
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
    if (this.adjAt.length < N) this.adjAt = new Int32Array(N);
    const at = this.adjAt;
    at.set(start.subarray(0, N));
    for (let c = 0; c < this.nc; c++) {
      const s = this.cs[c], t = this.ct[c];
      for (let k = 0; k < 4; k++) {
        const i = nodes[k][c];
        if (i < 0 || this.fixed[i]) continue;
        const e = at[i]++;
        this.adjC[e] = c;
        this.adjW[e] = k === 0 ? 1 - s : k === 1 ? s : k === 2 ? -(1 - t) : -t;
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
      let moved = this.drawnCable[ci] === 1 || (this.holdNode >= c.start && this.holdNode < c.start + c.count);
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
        // the substeps skip it from now on: leave it as they would find it
        // (at rest where it lies)
        for (let d = 3 * c.start; d < 3 * (c.start + c.count); d++) { this.v[d] = 0; this.x0[d] = x[d]; this.xt[d] = x[d]; }
      }
    }
    this.stats.awake = awake;
  }
}

const drift = { x: 0, y: 0, z: 0 };
/** a contact's friction force and stiffness (see `friction`) */
const fric = { x: 0, y: 0, z: 0, k: 0, s: 1 };
/** a point of a segment and the closest point's parameter on another (see `pointOn`) */
const proj = { x: 0, y: 0, z: 0, t: 0 };

/** where a leash spring pulls from (see `leash`) */
const pull = { x: 0, y: 0, z: 0 };

/**
 * A spring on a leash, from the node at (x, y, z) to t[o..o+2]: it pulls
 * from at most `lead` away, so that a cord caught on something is never
 * stretched like an elastic. Writes that offset into `pull`; the force is
 * k · pull, the Hessian k·I.
 */
function leash(x: number, y: number, z: number, t: ArrayLike<number>, o: number, lead: number): void {
  let ex = x - t[o], ey = y - t[o + 1], ez = z - t[o + 2];
  const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (el > lead) { const f = lead / el; ex *= f; ey *= f; ez *= f; }
  pull.x = ex; pull.y = ey; pull.z = ez;
}

function cellKey(x: number, y: number, z: number): number {
  return ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0);
}
