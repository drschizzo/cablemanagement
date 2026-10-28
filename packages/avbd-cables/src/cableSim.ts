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
// Soft energies: bending (second difference), the targets (a node led towards
// a point by a spring on a leash: `setTarget`), the velcro straps and the
// pinches. A node may pass through the other cords (`ghost`: never through the
// static shapes), and becomes solid again where it is clear of them.
//
// A pinch keeps the shape a few nodes had when it was made: each
// node is pulled towards where it was in that shape, the shape turned and
// moved to fit the nodes best (shape matching, Müller et al. 2005). The fit
// is the one that makes this pull weakest, so taking it as fixed during a
// substep leaves the pull an honest spring, which cannot feed energy in.
//
// Cables at rest fall asleep (their nodes are frozen and act as static
// geometry for the others) and wake when something awake touches them.
//
// What drives the cords (hands, ports, the channels of a cabinet) is not here:
// a subclass sets the targets and flags at the start of every step, and may
// add its own pull on the nodes it holds (`prepare`, `nodeTerm`, `keepHeld`).

import { boxHit, closest, segBox, segSeg, solveSym3, sol } from './geom';

export interface StaticCapsule {
  kind: 'capsule';
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r: number;
  owner?: number;
  mu?: number;
}

export interface StaticBox {
  kind: 'box';
  min: [number, number, number];
  max: [number, number, number];
  owner?: number;
  mu?: number;
}

export type StaticShape = StaticCapsule | StaticBox;

/**
 * The 3×3 system of one node in the block solve, as `nodeTerm` adds to it: the
 * gradient g of the node's energy and its Hessian H (symmetric, upper half).
 */
export interface NodeSystem {
  gx: number; gy: number; gz: number;
  h00: number; h01: number; h02: number; h11: number; h12: number; h22: number;
}

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
  /** mass of one node (kg, 0.001 if not given); the two nodes at each end get `endMass` (a connector: as heavy as the others if not given) */
  mass?: number;
  endMass?: number;
  /** bending stiffness (1 if not given) */
  bend?: number;
  /** the ends are a connector's boot: their bending stiffness × 3 over 2 nodes, then × 1.8 over 2 more */
  boot?: boolean;
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
   * ceiling against the static shapes for the `firm` cords (those a hand
   * draws: in hand, or being plugged): the hand pulls harder than anything else, and a
   * cord dragged across a finger sank into it (the others keep `kCap`:
   * stiffer, a cord let go on the rack shivered)
   */
  kCapHeld: number;
  /** growth of the penalties where a constraint is violated (AVBD β) */
  beta: number;
  /**
   * what the penalties and the stretch multipliers keep from one substep to
   * the next (AVBD γ). At 0.99 a slack cord lying on a sleeping heap could
   * keep a wave running along it for ever (about 9 Hz), and kept its
   * neighbours awake: 9 heaps of 48 cords in 96 never came to rest
   * (`npm run free`). At 0.9, none, and they settle sooner.
   */
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
  /** speculative contact margin (m), plus a speed-dependent part: the frame's travel × marginLead, up to marginCap */
  margin: number;
  marginLead: number;
  marginCap: number;
  /** same ceiling against the rack, whose contacts are few and cheap */
  marginStatic: number;
  /** clamp of one block solve's displacement (m) */
  maxMove: number;
  /**
   * weight of a node led by a heavy target (a hand) in the length passes,
   * against 1 for the others: heavy, so that the cord follows the hand rather
   * than the opposite
   */
  handWeight: number;
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
  /** a cable whose nodes all stay within sleepDist (m) for sleepTime (s) falls asleep */
  sleepDist: number;
  sleepTime: number;
  /**
   * a sleeping cable wakes when something touches it faster than wakeSpeed
   * (m/s), or faster than wakeCreep × wakeSpeed while sinking more than
   * wakeSink (m) into it — not for an overlap at rest: two cords wedged into
   * one another would wake each other in turn for ever
   */
  wakeSpeed: number;
  wakeCreep: number;
  wakeSink: number;
  /** stiffness of a velcro strap (× M/h²) */
  strapK: number;
  /** stiffness of a pinch held at its firmest (× M/h²) */
  pinchK: number;
  /** frames a node that stops passing through the other cords (`ghost`) may still do so where it lies in them (then it pushes them out) */
  ghostFrames: number;
}

export function defaultSimParams(p: Partial<SimParams> = {}): SimParams {
  return {
    dt: 1 / 60, substeps: 3, refSubsteps: 3, iterations: 6, gravity: -9.81,
    stretch: 10, kMin: 0.05, kCap: 2, kCapCable: 4, kCapHeld: 8, beta: 2000, gamma: 0.9, alpha: 0.25, alphaS: 0.3, lamWarm: 0.8, lamWarmS: 0.8, contactDamping: 0.3, restFriction: 0.012,
    muCable: 0.3, muStatic: 0.4, drag: 2.5,
    margin: 0.0015, marginLead: 1.2, marginCap: 0.008, marginStatic: 0.06, maxMove: 0.012,
    handWeight: 0.1, pbdPasses: 4, maxDepen: 0.001, frictionK: 0.3,
    sleepDist: 0.006, sleepTime: 0.5, wakeSpeed: 0.1, wakeCreep: 0.2, wakeSink: 0.002, strapK: 0.3,
    pinchK: 6, ghostFrames: 90,
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
 * Thresholds of the contact geometry:
 * - `parallel`: two segments are nearly parallel when |u × w|² < parallel·|u|²|w|²
 *   (sin² of their angle, about 14°), and then touch at both ends of their
 *   overlap (see `pairContacts`), if it is longer than `overlap` (of a segment);
 * - `dip`: the closest point of a segment also gets its own contact where it
 *   comes this much closer (m) than the ends (lying along another, or on a
 *   box's face);
 * - `edge`: a segment's own closest point to a box is kept between these
 *   fractions of it (beyond, the contacts of its nodes see to it).
 */
const CONTACT = { parallel: 0.06, overlap: 0.05, dip: 5e-4, edge: 0.05 };
/** a connector and the next node are heavier than the cord, and its boot (2 nodes, then 2 more) stiffer: × bend */
const BOOT = { stiff: 3, firm: 1.8 };

/**
 * What a worker needs to carry on from where a simulation is (see
 * `snapshot`); a subclass adds what it keeps of its own.
 */
export interface SimSnapshot {
  params: SimParams;
  defs: CableInit[];
  x: Float64Array; v: Float64Array; rest: Float64Array;
  pins: number[];
  statics: unknown[];
  heldBy: Int32Array;
  target: Float64Array; targetK: Float64Array; targetLead: Float64Array; targetHeavy: Uint8Array;
  pinches: Pinch[];
  bundles: { nodes: number[]; r: number; alive: boolean }[];
}

export class CableSim {
  /**
   * The methods that change the simulation, called in the page and repeated
   * in the worker in the same order (see `threaded`). A subclass lists its own
   * after these. `restarts`: those after which the positions the worker
   * computed before are out of date.
   */
  static mirrored: readonly string[] = [
    'setStatics', 'moveNodes', 'teleport', 'pin', 'unpin', 'setTarget', 'clearTarget',
    'firmPinch', 'unpinch', 'setPinches', 'loadPinches', 'addBundle', 'removeBundle',
  ];
  static restarts: readonly string[] = ['moveNodes', 'teleport'];

  P: SimParams;
  /** the cables as built */
  defs: CableInit[] = [];
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
  /** segments of each bucket that move (not both nodes fixed): a still segment only looks in buckets that have some */
  private hashMoving = new Int32Array(0);
  private segSpeed = new Float64Array(0);
  // the segments in bucket order: midpoint, cell, reach (half rest length + radius), both nodes fixed
  private sMid = new Float64Array(0);
  private sCell = new Int32Array(0);
  private sReach = new Float64Array(0);
  /** the same from the segment's length as it is (stretched, it is longer than at rest) */
  private sNear = new Float64Array(0);
  private sFixed = new Uint8Array(0);
  /** where each segment sits in bucket order */
  private slot = new Int32Array(0);
  protected statics: StaticShape[] = [];
  /**
   * The holder of each node (a channel of a subclass's), or −1: it adds its
   * pull on the node in the solve (`nodeTerm`), and in the length passes the
   * node stays put against a free neighbour, which takes the slack.
   */
  heldBy = new Int32Array(0);
  /** a segment whose two nodes are flagged passes through the static shapes (a connector going into its port) */
  noStatics = new Uint8Array(0);
  /** cables firmer against the static shapes (drawn by a hand: see `kCapHeld`) */
  firm = new Uint8Array(0);
  /** cables with a heavy target this step: they do not fall asleep */
  private led = new Uint8Array(0);
  private staticGrid = new Map<number, number[]>();
  /** bounds of each static shape, min then max (6 per shape), for a cheap rejection before the exact test */
  private staticBounds = new Float64Array(0);
  private readonly SCELL = 0.05;

  /**
   * Targets: a node led towards a point by a spring on a leash (see
   * `setTarget`), one per node. `targetK`: its stiffness (× M/h² of the
   * reference substep; 0: none), `targetLead`: its leash (m), `targetHeavy`:
   * the cord follows it rather than the opposite, as a hand.
   */
  target = new Float64Array(0);
  targetK = new Float64Array(0);
  targetLead = new Float64Array(0);
  targetHeavy = new Uint8Array(0);
  /** where each target pulls this step: the target, brought within reach of the cord (see `reach`) */
  private targetAt = new Float64Array(0);
  /** the nearest pinned node before each target, and the length of cord to it (scratch of `reach`) */
  private reachPin = new Int32Array(0);
  private reachLen = new Float64Array(0);

  // pinches
  pinches: Pinch[] = [];
  /** the pinch of each node, or −1 */
  pinchOf = new Int32Array(0);
  /** where each pinched node is pulled to, this substep */
  private pinchGoal = new Float64Array(0);
  /** the pinch being made: it takes the shape of the cord rather than pulling on it, until it is done */
  pinchHeld: Pinch | null = null;
  protected pinchChanged = false;

  /** a node that passes through the other cords: −1 while it does, then the frames left until it is solid again (0: solid) */
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
  protected awake = new Int32Array(0);
  /**
   * Sleepers touched by something moving, woken at the end of the step: one
   * woken during the contact search would miss its contacts with the segments
   * already searched, and drop through them for a frame.
   */
  private wakeNext: number[] = [];
  protected nAwake = 0;

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
    restDecel: 0, maxMove: 0, pbdPasses: 0,
  };

  stats = { contacts: 0, awake: 0, ms: 0 };
  private flip = false;

  constructor(params: Partial<SimParams> = {}) {
    this.P = defaultSimParams(params);
  }

  // ------------------------------------------------------------ building

  build(defs: CableInit[]): number[] {
    this.defs = defs;
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
    this.bundleOf = new Int32Array(N).fill(-1);
    this.pinchOf = new Int32Array(N).fill(-1);
    this.target = new Float64Array(3 * N);
    this.targetK = new Float64Array(N);
    this.targetLead = new Float64Array(N);
    this.targetHeavy = new Uint8Array(N);
    this.targetAt = new Float64Array(3 * N);
    this.reachPin = new Int32Array(N);
    this.reachLen = new Float64Array(N);
    this.noStatics = new Uint8Array(N);
    this.ghost = new Int16Array(N);
    this.ghostTouch = new Uint8Array(N);
    this.pinchGoal = new Float64Array(3 * N);
    this.pinches = [];
    this.pinchHeld = null;
    this.heldBy = new Int32Array(N).fill(-1);
    this.firm = new Uint8Array(defs.length);
    this.led = new Uint8Array(defs.length);
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
        const m = d.mass ?? 0.001;
        this.mass[i] = end ? d.endMass ?? m : m;
        this.cableOf[i] = ci;
        this.radius[i] = d.radius;
        // the boot of the connector is much stiffer than the cord
        const edge = Math.min(k, cnt - 1 - k);
        const b = d.bend ?? 1;
        this.bendK[i] = !d.boot ? b : edge <= 2 ? b * BOOT.stiff : edge <= 4 ? b * BOOT.firm : b;
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
    // half a segment, a radius and the static margin (2 cm at least for the first two)
    let reach = 0.02;
    for (let i = 0; i < this.n; i++) if (this.segOK[i]) reach = Math.max(reach, 0.5 * this.rest[i] + this.radius[i]);
    const pad = reach + this.P.marginStatic;
    const C = this.SCELL;
    this.staticBounds = new Float64Array(6 * shapes.length);
    shapes.forEach((s, id) => {
      let x0: number, y0: number, z0: number, x1: number, y1: number, z1: number;
      if (s.kind === 'capsule') {
        x0 = Math.min(s.ax, s.bx) - s.r; x1 = Math.max(s.ax, s.bx) + s.r;
        y0 = Math.min(s.ay, s.by) - s.r; y1 = Math.max(s.ay, s.by) + s.r;
        z0 = Math.min(s.az, s.bz) - s.r; z1 = Math.max(s.az, s.bz) + s.r;
      } else {
        [x0, y0, z0] = s.min; [x1, y1, z1] = s.max;
      }
      this.staticBounds.set([x0, y0, z0, x1, y1, z1], 6 * id);
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
      if (i < this.n) { this.lam[i] = 0; this.heldBy[i] = -1; }
    }
    this.targetK.fill(0, start, Math.min(this.n, start + n));
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
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      for (let d = 0; d < 3; d++) this.x[3 * i + d] = pos[3 * i + d];
    }
    this.x0.set(this.x);
    this.xt.set(this.x);
    this.sleepRef.set(this.x);
    this.v.fill(0);
    this.lam.fill(0);
    this.heldBy.fill(-1);
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
    this.pinned[i] = 0;
    this.wakeCable(this.cableOf[i]);
  }

  /**
   * Leads node i towards (x, y, z): a spring of stiffness k (× M/h² of the
   * reference substep) that pulls from at most `lead` away, so that a cord
   * caught on something is held back rather than stretched like an elastic
   * (nor snaps back when let go). `heavy`: the cord follows the node rather
   * than the opposite, as it follows a hand. One target per node: this one
   * replaces any other.
   */
  setTarget(i: number, x: number, y: number, z: number, k: number, lead: number, heavy = false): void {
    this.target[3 * i] = x; this.target[3 * i + 1] = y; this.target[3 * i + 2] = z;
    this.targetK[i] = k;
    this.targetLead[i] = lead;
    this.targetHeavy[i] = heavy ? 1 : 0;
    this.wakeCable(this.cableOf[i]);
  }

  clearTarget(i: number): void {
    this.targetK[i] = 0;
    this.targetHeavy[i] = 0;
    this.wakeCable(this.cableOf[i]);
  }

  /**
   * How firm the pinch being made is now (0 to 1), as it firms up: set from
   * outside, in real time (the physics may drop frames when it falls behind).
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

  /** takes the pinches of the worker as they are (nothing to wake or forward); `held`: the one being made, or −1 */
  adoptPinches(list: Pinch[], held: number): void {
    this.pinches = list;
    this.pinchHeld = held >= 0 ? list[held] : null;
    this.pinchOf.fill(-1);
    list.forEach((p, k) => { for (let i = p.a; i < p.a + p.n; i++) this.pinchOf[i] = k; });
  }

  /** the centre of the nodes of a pinch, into `drift` */
  private centreOf(p: Pinch): void {
    const x = this.x;
    let cx = 0, cy = 0, cz = 0;
    for (let i = p.a; i < p.a + p.n; i++) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
    drift.x = cx / p.n; drift.y = cy / p.n; drift.z = cz / p.n;
  }

  /** takes the current shape of the pinched nodes as the pinch's shape */
  protected shapeOf(p: Pinch): void {
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
   * Start of a step: where each target pulls, within reach of the cord. A
   * node cannot go further from a pinned node of its cord than the length of
   * cord between them: a target beyond is brought back onto that sphere (onto
   * where the spheres of the pins on either side meet, if both are pinned).
   * Out of reach, the spring pulled the cord taut against the pin with all
   * its strength, a heavy node at one end and a fixed one at the other: the
   * length passes could not take the stretch out of the light nodes between,
   * and the cord whipped about like a stretched elastic.
   */
  private reach(): void {
    const x = this.x, t = this.target, at = this.targetAt, K = this.targetK, rest = this.rest, pinned = this.pinned;
    for (let ci = 0; ci < this.cables.length; ci++) {
      const cb = this.cables[ci], end = cb.start + cb.count;
      let any = false, heavy = 0;
      for (let i = cb.start; i < end; i++) if (K[i] > 0) { any = true; heavy |= this.targetHeavy[i]; }
      this.led[ci] = heavy;
      if (!any) continue;
      // the nearest pinned node before each node, and the length of cord to it (−1: none)
      let pin = -1, arc = 0;
      for (let i = cb.start; i < end; i++) {
        if (i > cb.start) arc += rest[i - 1];
        if (pinned[i]) { pin = i; arc = 0; }
        if (K[i] <= 0) continue;
        at[3 * i] = t[3 * i]; at[3 * i + 1] = t[3 * i + 1]; at[3 * i + 2] = t[3 * i + 2];
        this.reachPin[i] = pinned[i] ? -1 : pin;
        this.reachLen[i] = arc;
      }
      // then after it, and the target onto the spheres of both
      pin = -1; arc = 0;
      for (let i = end - 1; i >= cb.start; i--) {
        if (i < end - 1) arc += rest[i];
        if (pinned[i]) { pin = i; arc = 0; }
        if (K[i] <= 0 || pinned[i]) continue;
        const a = this.reachPin[i], ra = this.reachLen[i];
        for (let it = 0; it < (a >= 0 && pin >= 0 ? 4 : 1); it++) {
          if (a >= 0) within(at, 3 * i, x, 3 * a, ra);
          if (pin >= 0) within(at, 3 * i, x, 3 * pin, arc);
        }
      }
    }
  }

  // ---------------------------------------------------------- worker

  /** the state a worker starts from (see `restore`) */
  snapshot(): SimSnapshot {
    const pins: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.pinned[i]) pins.push(i);
    return {
      params: this.P, defs: this.defs, x: this.x, v: this.v, rest: this.rest, pins, statics: this.statics, heldBy: this.heldBy,
      target: this.target, targetK: this.targetK, targetLead: this.targetLead, targetHeavy: this.targetHeavy,
      pinches: this.pinches, bundles: this.bundles.map((b) => ({ nodes: b.nodes, r: b.r, alive: b.alive })),
    };
  }

  /** carries on from a snapshot, in a new simulation built with its parameters */
  restore(s: SimSnapshot): void {
    this.build(s.defs);
    this.x.set(s.x);
    this.x0.set(s.x);
    this.v.set(s.v);
    for (const i of s.pins) this.pin(i, s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]);
    this.setStatics(s.statics as StaticShape[]);
    this.rest.set(s.rest);
    this.heldBy.set(s.heldBy);
    this.target.set(s.target);
    this.targetK.set(s.targetK);
    this.targetLead.set(s.targetLead);
    this.targetHeavy.set(s.targetHeavy);
    this.loadPinches(s.pinches);
    this.takePinchChange();
    // the straps that were let go too, so that their ids stay the same
    for (const b of s.bundles) {
      const id = this.addBundle(b.nodes, b.r);
      if (!b.alive) this.removeBundle(id);
    }
  }

  /**
   * What changes every frame without a call (a hand following the pointer),
   * sent with every step to the worker and set there before each frame.
   */
  stepInput(): unknown {
    return undefined;
  }

  setStepInput(input: unknown): void {}

  // ---------------------------------------------------------------- step

  step(): void {
    const t0 = performance.now();
    const P = this.P;
    const h = P.dt / P.substeps;
    this.prepare(P.dt);
    this.reach();
    this.convert(h);
    // Contacts are found once per frame, with a speculative margin covering
    // the motion of the whole frame, then kept for all substeps.
    // (nothing falls asleep or wakes during the search: see `wakeNext`)
    this.refreshFixed();
    this.collide(P.dt);
    this.buildAdjacency();
    this.listAwake();
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
    R.maxMove = P.maxMove * r;
    R.pbdPasses = Math.max(1, Math.round(P.pbdPasses * r));
  }

  /**
   * Start of a step, before the targets are brought within reach and the
   * contacts searched: a subclass sets its targets and flags (`firm`,
   * `noStatics`, `heldBy`) from where what drives the cords is now.
   */
  protected prepare(dt: number): void {}

  /**
   * The pull of node i's holder on it (`heldBy`), added to its system in the
   * block solve; `mh` is the unit of the soft stiffnesses for the node, its
   * mass × 1/h² of the reference substep.
   */
  protected nodeTerm(i: number, holder: number, mh: number, s: NodeSystem): void {}

  /** before the length passes of a substep (h), and after them: a subclass puts its held nodes back where they belong */
  protected keepHeld(h: number): void {}

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
    // held nodes go back in first, and stay put in the length passes: those
    // take the slack from the free part of the cord rather than stretch it
    this.keepHeld(h);
    for (let k = 0; k < R.pbdPasses; k++) this.inextensible(k % 2 === 0);
    this.keepHeld(h);
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

    // --- target: a spring on a leash, pulling from at most its lead away
    const tk = this.targetK[i];
    if (tk > 0) {
      const k = tk * mh;
      leash(xi, yi, zi, this.targetAt, j, this.targetLead[i]);
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

    // --- the holder of the node, if any (a subclass's)
    const hb = this.heldBy[i];
    if (hb >= 0) {
      const s = sys;
      s.gx = gx; s.gy = gy; s.gz = gz; s.h00 = h00; s.h01 = h01; s.h02 = h02; s.h11 = h11; s.h12 = h12; s.h22 = h22;
      this.nodeTerm(i, hb, mh, s);
      gx = s.gx; gy = s.gy; gz = s.gz; h00 = s.h00; h01 = s.h01; h02 = s.h02; h11 = s.h11; h12 = s.h12; h22 = s.h22;
    }

    // --- velcro
    const bi = this.bundleOf[i];
    if (bi >= 0) {
      const b = this.bundles[bi];
      const dx = xi - b.cx, dy = yi - b.cy, dz = zi - b.cz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const C = len - b.r;
      if (C > 0 && len > 1e-9) {
        const kb = P.strapK * mh;
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

  /**
   * Position projection of the segment lengths (PBD), one sweep along every
   * cord: what the block descent leaves of a stretch under load (a heap, the
   * hand) is taken out here. Pins and sleeping nodes do not move; the nodes
   * of heavy targets (the hands) weigh more, so the cord follows them rather
   * than the opposite.
   */
  private inextensible(forward: boolean): void {
    const x = this.x;
    // a node led by a heavy target weighs more; a held node does not move for its
    // free neighbour (between two held nodes, both do)
    const w = (i: number) => (this.fixed[i] ? 0 : this.targetHeavy[i] ? this.P.handWeight / this.mass[i] : 1 / this.mass[i]);
    const kept = this.heldBy;
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
    const kmax = (b0 >= 0 ? this.P.kCapCable : this.firm[this.cableOf[a0]] ? this.P.kCapHeld : this.P.kCap) * mh2;
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
    if (this.hashFill.length < HC) { this.hashFill = new Int32Array(HC); this.hashMoving = new Int32Array(HC); }
    const fillAt = this.hashFill, moving = this.hashMoving;
    moving.fill(0);
    fillAt.set(count.subarray(0, HC));
    // what the pair test reads of each segment, copied in bucket order: the
    // inner loop then walks memory in sequence instead of jumping around x
    if (this.sMid.length < 3 * N) {
      this.sMid = new Float64Array(3 * N); this.sCell = new Int32Array(3 * N);
      this.sReach = new Float64Array(N); this.sNear = new Float64Array(N); this.sFixed = new Uint8Array(N); this.slot = new Int32Array(N);
    }
    const sMid = this.sMid, sCell = this.sCell, sReach = this.sReach, sNear = this.sNear, sFixed = this.sFixed, items = this.hashItems;
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
      sNear[e] = Math.hypot(x[3 * i + 3] - x[3 * i], x[3 * i + 4] - x[3 * i + 1], x[3 * i + 5] - x[3 * i + 2]) * 0.5 + this.radius[i];
      sFixed[e] = this.fixed[i] & this.fixed[i + 1];
      if (!sFixed[e]) moving[b]++;
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
            if (aFixed && moving[bucket] === 0) continue;
            for (let e = count[bucket]; e < count[bucket + 1]; e++) {
              if (home ? e <= ea : e === ea) continue;
              const bFixed = sFixed[e] === 1;
              if (aFixed && bFixed) continue;
              // cheap rejection on the distance of the midpoints
              const mdx = amx - sMid[3 * e], mdy = amy - sMid[3 * e + 1], mdz = amz - sMid[3 * e + 2];
              const md2 = mdx * mdx + mdy * mdy + mdz * mdz;
              const reach = aReach + sReach[e];
              if (md2 > reach * reach) continue;
              // a segment of another cell sharing the bucket
              if (sCell[3 * e] !== ncx || sCell[3 * e + 1] !== ncy || sCell[3 * e + 2] !== ncz) continue;
              const b = items[e];
              const cb = this.cableOf[b];
              if (ca === cb && Math.abs(b - a) <= 2) continue;
              const vb = segSpeed[b];
              const rs = this.radius[a] + this.radius[b];
              const margin = Math.min(P.marginCap, P.margin + (va + vb) * frame * P.marginLead);
              // the same with this pair's own margin: two segments are never
              // closer than their midpoints less their half lengths
              const near = sNear[ea] + sNear[e] + margin;
              if (md2 > near * near) continue;
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
              // sinks into it (see `wakeSpeed`)
              if (aFixed !== bFixed) {
                const mover = aFixed ? vb : va;
                const sleeper = aFixed ? ca : cb;
                if (this.cables[sleeper].asleep && (mover > P.wakeSpeed || (mover > P.wakeCreep * P.wakeSpeed && Math.sqrt(closest.d2) < rs - P.wakeSink))) {
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
      if (this.noStatics[a] && this.noStatics[a + 1]) continue;
      const mx = (x[3 * a] + x[3 * a + 3]) * 0.5, my = (x[3 * a + 1] + x[3 * a + 4]) * 0.5, mz = (x[3 * a + 2] + x[3 * a + 5]) * 0.5;
      const list = this.staticGrid.get(cellKey(Math.floor(mx / SC), Math.floor(my / SC), Math.floor(mz / SC)));
      if (!list) continue;
      const r = this.radius[a];
      const va = segSpeed[a];
      const margin = Math.min(P.marginStatic, P.margin + va * frame * P.marginLead);
      // the bounds of the segment, grown by what it may touch from
      const g = r + margin, SB = this.staticBounds;
      const lx = Math.min(x[3 * a], x[3 * a + 3]) - g, hx = Math.max(x[3 * a], x[3 * a + 3]) + g;
      const ly = Math.min(x[3 * a + 1], x[3 * a + 4]) - g, hy = Math.max(x[3 * a + 1], x[3 * a + 4]) + g;
      const lz = Math.min(x[3 * a + 2], x[3 * a + 5]) - g, hz = Math.max(x[3 * a + 2], x[3 * a + 5]) + g;
      for (const sid of list) {
        const sh = this.statics[sid];
        const o = 6 * sid;
        if (lx > SB[o + 3] || hx < SB[o] || ly > SB[o + 4] || hy < SB[o + 1] || lz > SB[o + 5] || hz < SB[o + 2]) continue;
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
          if (boxHit.dist > lim || boxHit.s < CONTACT.edge || boxHit.s > 1 - CONTACT.edge || boxHit.dist > dEnds - CONTACT.dip) continue;
          this.pushContact(
            key + 2, a, a + 1, boxHit.s, -1, -1, 0, boxHit.nx, boxHit.ny, boxHit.nz,
            boxHit.qx, boxHit.qy, boxHit.qz, r, boxHit.dist - r, mu,
          );
        }
      }
    }
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
    if (cross < CONTACT.parallel * uu * ww && uu > 1e-12 && ww > 1e-12) {
      const s0 = ((q0x - p0x) * ux + (q0y - p0y) * uy + (q0z - p0z) * uz) / uu;
      const s1 = ((q1x - p0x) * ux + (q1y - p0y) * uy + (q1z - p0z) * uz) / uu;
      const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(1, Math.max(s0, s1));
      // Not when they cross at a shallow angle within the overlap: the two
      // ends lie on opposite sides, and the crossing in between was left
      // unguarded (cords slipped through one another there)
      if (hi - lo > CONTACT.overlap && this.endsAgree(a, lo, hi, q0x, q0y, q0z, wx, wy, wz, ww)) {
        const dc = Math.sqrt(closest.d2);
        this.emitAt(key, a, b, lo, q0x, q0y, q0z, wx, wy, wz, ww, rs, lim, mu);
        this.emitAt(key + 2, a, b, hi, q0x, q0y, q0z, wx, wy, wz, ww, rs, lim, mu);
        // and the closest point, when it dips well below both ends
        if (dc > Math.min(this.endGap[0], this.endGap[1]) - CONTACT.dip || closest.s <= lo || closest.s >= hi) return;
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
    this.ctrack[this.nc - 1] = cross >= CONTACT.parallel * uu * ww ? 1 : 0;
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
      let moved = this.firm[ci] === 1 || this.led[ci] === 1;
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
/** the system of the node being solved, handed to `nodeTerm` */
const sys: NodeSystem = { gx: 0, gy: 0, gz: 0, h00: 0, h01: 0, h02: 0, h11: 0, h12: 0, h22: 0 };
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

/** brings p[o..o+2] within r of c[oc..oc+2] */
function within(p: Float64Array, o: number, c: ArrayLike<number>, oc: number, r: number): void {
  const dx = p[o] - c[oc], dy = p[o + 1] - c[oc + 1], dz = p[o + 2] - c[oc + 2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= r) return;
  const f = r / d;
  p[o] = c[oc] + dx * f; p[o + 1] = c[oc + 1] + dy * f; p[o + 2] = c[oc + 2] + dz * f;
}

function cellKey(x: number, y: number, z: number): number {
  return ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0);
}
