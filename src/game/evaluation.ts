// How tidy a cabinet is: for each line of the schedule, whether its cord is
// connected, routed through the management, clear of the other ports,
// labelled and relaxed; the stars; and the readability note, beyond the
// stars. Reads a World, changes nothing.

import { SERVICES } from './services';
import { insideBox, type SupportBox } from './rack';
import type { World } from './world';
import type { CableIndex } from './cables';

export interface CircuitStatus {
  cable: number; // cable serving it (−1 none)
  connected: boolean;
  routed: boolean;
  clear: boolean;
  labelled: boolean;
  /** neither pulled taut nor kinked */
  relaxed: boolean;
}

/** one criterion of readability, 0..1 (ui/messages.ts names it) */
export type ReadabilityPart =
  | { criterion: 'slack' | 'colours' | 'bundles' | 'separation'; value: number }
  | { criterion: 'crossings'; value: number; crossings: number };

/** how readable the cabinet is, beyond the stars: each part 0..1, the note 0..100 */
export interface Readability {
  note: number;
  parts: ReadabilityPart[];
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
  /** cords pulled taut or kinked, per cable (null: neither) */
  cableStrain: (Strain | null)[];
  relaxed: number;
  readability: Readability;
  /** velcro bundles (three cords or more, in the management), and how many three stars need */
  bundles: number;
  bundlesNeeded: number;
}

export type Strain = 'taut' | 'kinked';

/**
 * A cord this much shorter than the tidy route between its ports is pulled
 * taut: it cuts the corners the managers and ducts make it turn. (The route
 * is the outermost lane's; the inner lanes are up to a fifth shorter. A cord
 * straight from one port to the one right under it is no taut cord.)
 */
const TAUT_SHORT = 0.7;
/** a fibre turning this much (rad) over two segments is kinked */
const KINK = 1.9;
/** a stretch between two holds longer than this (m) hangs */
const MAX_FREE_STRETCH = 0.2;
/** nodes next to a plugged connector count as held */
const HELD_NEAR_PLUG = 6;

/** how a node of a cord is held (holdMap) */
export const HOLD = { FREE: 0, HELD: 1, HANGING: 2, LOW: 3 } as const;

export function evaluate(w: World): Evaluation {
  const supports = w.rack.supports();
  const x = w.sim.x;
  const cableRouted: boolean[] = [];
  const cableObstructs: boolean[] = [];
  const floor = floorLimit(w);
  for (let c = 0; c < w.cables.length; c++) {
    const cb = w.cables[c];
    const hold = holdMap(w, c, supports, floor);
    cableRouted.push(!hold.some((h) => h === HOLD.HANGING || h === HOLD.LOW) && !!cb.ends[0].port && !!cb.ends[1].port);
    // a cord hanging in front of somebody else's port
    let obstructs = false;
    for (const p of w.rack.ports) {
      if (obstructs) break;
      const own = cb.ends[0].port === p.id || cb.ends[1].port === p.id;
      if (own) continue;
      const pitch = w.rack.portPitch(p);
      const hx = Math.max(0.006, pitch * 0.45);
      const near = Math.ceil(0.15 / w.seg);
      for (let k = near; k < cb.count - near; k++) {
        const i = cb.start + k;
        if (Math.abs(x[3 * i] - p.x) < hx && Math.abs(x[3 * i + 1] - (p.y - 0.002)) < 0.011 && x[3 * i + 2] < 0.11) { obstructs = true; break; }
      }
    }
    cableObstructs.push(obstructs);
  }

  const cableStrain = w.cables.map((_, c) => cordStrain(w, c));
  const circuits: CircuitStatus[] = w.circuits.map((ci) => {
    const cable = w.rack.cableJoining(ci.a, ci.b);
    const connected = cable >= 0 && w.cables[cable].type === ci.type;
    const routed = connected && cableRouted[cable];
    const clear = connected && !cableObstructs[cable];
    const labelled = connected && w.cables[cable].ends.every((e) => e.label === ci.service);
    const relaxed = connected && !cableStrain[cable];
    return { cable, connected, routed, clear, labelled, relaxed };
  });
  const n = circuits.length;
  const count = (f: (s: CircuitStatus) => boolean) => circuits.filter(f).length;
  const connected = count((s) => s.connected);
  const routed = count((s) => s.routed);
  const clear = count((s) => s.clear);
  const labelled = w.level.labels ? count((s) => s.labelled) : n;
  const relaxed = count((s) => s.relaxed);
  const bundles = bundleCount(w, supports);
  const bundlesNeeded = w.level.kind === 'campaign' ? w.level.bundles ?? 0 : 0;
  let stars = 0;
  if (connected === n) {
    stars = 1;
    if (routed >= 0.7 * n && clear >= 0.85 * n) stars = 2;
    // past the downtime budget, an incident: three stars are out of reach
    if (routed === n && clear === n && labelled === n && relaxed === n && bundles >= bundlesNeeded && w.maintenance.downtime <= w.maintenance.budget) stars = 3;
  }
  return {
    circuits, connected, routed, clear, labelled, relaxed, total: n, stars, cableRouted, cableObstructs, cableStrain,
    liveDown: w.maintenance.liveDown(), downtime: w.maintenance.downtime, budget: w.maintenance.budget, bundles, bundlesNeeded,
    readability: readability(w, circuits, cableStrain, supports),
  };
}

/** how tidy the cabinet is overall (0..1): the four criteria, plugging counting double */
export function cleanliness(ev: Evaluation): number {
  const n = Math.max(1, ev.total);
  const bundles = ev.bundlesNeeded ? [n * Math.min(1, ev.bundles / ev.bundlesNeeded)] : [];
  const parts = [ev.connected * 2, ev.routed, ev.clear, ev.relaxed, ...bundles];
  return parts.reduce((a, b) => a + b, 0) / (n * (parts.length + 1));
}

/** ports of the lines connected as planned (their LEDs are green); without an evaluation, from the plugs alone */
export function okPorts(w: World, ev?: Evaluation): Set<string> {
  const ok = new Set<string>();
  w.circuits.forEach((ci, i) => { if (ev ? ev.circuits[i].connected : w.circuitUp(i)) ok.add(ci.a).add(ci.b); });
  return ok;
}

/** height below which a cord lies on the floor of the cabinet rather than in it */
function floorLimit(w: World): number {
  const lowest = w.rack.units.reduce((m, u, k) => (u.kind === 'switch' || u.kind === 'panel' ? Math.max(m, k) : m), 0);
  return w.rack.unitBottom(lowest) - 0.12;
}

/**
 * How each node of a cord is held: HELD by the management or next to a
 * plugged connector, FREE on a short stretch (20 cm at most) between two
 * holds, HANGING on a longer one, LOW under the equipment (on the floor).
 * The cord is routed when it has neither of the last two.
 */
export function holdMap(w: World, c: CableIndex, supports = w.rack.supports(), floor = floorLimit(w)): Uint8Array {
  const cb = w.cables[c];
  const x = w.sim.x;
  const out = new Uint8Array(cb.count);
  let run = 0;
  const close = (k: number) => {
    // the stretch that ends before node k
    if (run > MAX_FREE_STRETCH) for (let j = k - Math.round(run / w.seg); j < k; j++) if (out[j] === HOLD.FREE) out[j] = HOLD.HANGING;
    run = 0;
  };
  for (let k = 0; k < cb.count; k++) {
    const i = cb.start + k;
    const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2];
    const nearPlug = (k < HELD_NEAR_PLUG && cb.ends[0].port) || (k >= cb.count - HELD_NEAR_PLUG && cb.ends[1].port);
    let held = !!nearPlug;
    if (!held) {
      for (const s of supports) {
        if (insideBox(s, px, py, pz)) { held = true; break; }
      }
    }
    if (held) { close(k); out[k] = HOLD.HELD; } else { run += w.seg; out[k] = HOLD.FREE; }
    if (py < floor) out[k] = HOLD.LOW;
  }
  close(cb.count);
  return out;
}

/**
 * A cord plugged at both ends pulled taut (much shorter than its tidy
 * route), or a fibre kinked away from its connectors; null when neither.
 */
export function cordStrain(w: World, c: CableIndex): Strain | null {
  const cb = w.cables[c];
  if (!cb.ends[0].port || !cb.ends[1].port) return null;
  if (w.cableLength(c) < TAUT_SHORT * w.routeLength(c)!) return 'taut';
  const x = w.sim.x;
  if (cb.type === 'CU') return null;
  // away from the boots (where the cord turns sharply on purpose), over two segments either side
  const near = Math.ceil(0.15 / w.seg);
  for (let k = near; k < cb.count - near; k++) {
    const i = cb.start + k;
    const ux = x[3 * i] - x[3 * i - 6], uy = x[3 * i + 1] - x[3 * i - 5], uz = x[3 * i + 2] - x[3 * i - 4];
    const vx = x[3 * i + 6] - x[3 * i], vy = x[3 * i + 7] - x[3 * i + 1], vz = x[3 * i + 8] - x[3 * i + 2];
    const cos = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) || 1);
    if (Math.acos(Math.max(-1, Math.min(1, cos))) > KINK) return 'kinked';
  }
  return null;
}

/** straps round three cords or more, lying in a manager or a duct */
export function bundleCount(w: World, supports = w.rack.supports()): number {
  return w.straps.filter((st) => {
    if (st.nodes.length < 3) return false;
    const [x, y, z] = w.strapCentre(st);
    return supports.some((s) => insideBox(s, x, y, z));
  }).length;
}

/**
 * What a technician coming after you would think of the cabinet, beyond
 * the stars: cords with just the slack they need, of their service's
 * colour, bundles of one service, fibre and copper apart, no cords crossing
 * in front of the cabinet.
 */
function readability(w: World, circuits: CircuitStatus[], strain: (Strain | null)[], supports: SupportBox[]): Readability {
  const parts: Readability['parts'] = [];
  const made = circuits.map((s, i) => ({ s, i })).filter(({ s }) => s.connected);
  // the slack: none pulled taut or kinked, and no more than half a metre beyond the route
  if (made.length) {
    let sum = 0;
    for (const { s } of made) {
      if (strain[s.cable]) continue;
      const extra = w.cableLength(s.cable) - w.routeLength(s.cable)!;
      sum += Math.max(0, Math.min(1, 1 - (extra - 0.5)));
    }
    parts.push({ criterion: 'slack', value: sum / made.length });
  }
  // copper cords of the colour of their service
  if (w.level.colorByService) {
    const cu = made.filter(({ s }) => w.cables[s.cable].type === 'CU');
    if (cu.length) {
      const ok = cu.filter(({ s, i }) => w.cables[s.cable].color === SERVICES[w.circuits[i].service].color).length;
      parts.push({ criterion: 'colours', value: ok / cu.length });
    }
  }
  // bundles of one service
  const serviceOf = new Map<number, number>();
  circuits.forEach((s, i) => { if (s.connected) serviceOf.set(s.cable, w.circuits[i].service); });
  const straps = w.straps.filter((st) => st.nodes.length >= 2);
  if (straps.length) {
    const pure = straps.filter((st) => new Set(st.nodes.map((i) => serviceOf.get(w.sim.cableOf[i]) ?? -1)).size === 1).length;
    parts.push({ criterion: 'bundles', value: pure / straps.length });
  }
  // fibre and copper in separate ducts and managers
  const x = w.sim.x;
  if (new Set(w.cables.map((cb) => cb.type === 'CU')).size > 1) {
    let used = 0, mixed = 0;
    for (const sp of supports) {
      const kinds = new Set<boolean>();
      w.cables.forEach((cb) => {
        for (let k = 4; k < cb.count - 4; k += 2) {
          const i = cb.start + k;
          if (insideBox(sp, x[3 * i], x[3 * i + 1], x[3 * i + 2])) { kinds.add(cb.type === 'CU'); break; }
        }
      });
      if (kinds.size) used++;
      if (kinds.size > 1) mixed++;
    }
    if (used) parts.push({ criterion: 'separation', value: 1 - mixed / used });
  }
  // cords crossing each other in front of the cabinet, out of every support
  const crossings = frontCrossings(w, supports);
  parts.push({ criterion: 'crossings', value: Math.max(0, 1 - crossings / Math.max(4, w.cables.length)), crossings });
  const note = Math.round((100 * parts.reduce((a, p) => a + p.value, 0)) / parts.length);
  return { note, parts };
}

interface FrontSegment {
  cable: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** pairs of cords whose segments cross seen from the front, where neither is in a support */
function frontCrossings(w: World, supports: SupportBox[]): number {
  const x = w.sim.x;
  const segs: FrontSegment[] = [];
  w.cables.forEach((cb, c) => {
    if (!cb.ends[0].port && !cb.ends[1].port) return;
    for (let k = 0; k < cb.count - 1; k++) {
      const i = cb.start + k;
      if (x[3 * i + 2] > 0.3) continue;
      if (supports.some((s) => insideBox(s, x[3 * i], x[3 * i + 1], x[3 * i + 2]))) continue;
      segs.push({ cable: c, ax: x[3 * i], ay: x[3 * i + 1], bx: x[3 * i + 3], by: x[3 * i + 4] });
    }
  });
  // a grid of 5 cm cells, each segment in every cell its box covers; a pair of cords counted once
  const cell = 0.05, cols = 64, grid = new Map<number, number[]>();
  segs.forEach((s, j) => {
    const x0 = Math.floor(Math.min(s.ax, s.bx) / cell), x1 = Math.floor(Math.max(s.ax, s.bx) / cell);
    const y0 = Math.floor(Math.min(s.ay, s.by) / cell), y1 = Math.floor(Math.max(s.ay, s.by) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = (gy + cols) * 4 * cols + gx + cols;
        const list = grid.get(key);
        if (list) list.push(j); else grid.set(key, [j]);
      }
    }
  });
  const n = w.cables.length, seen = new Uint8Array(n * n);
  let pairs = 0;
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      const p = segs[list[a]];
      for (let b = a + 1; b < list.length; b++) {
        const q = segs[list[b]];
        if (p.cable === q.cable || seen[p.cable * n + q.cable]) continue;
        if (segmentsCross(p, q)) { seen[p.cable * n + q.cable] = seen[q.cable * n + p.cable] = 1; pairs++; }
      }
    }
  }
  return pairs;
}

/** do two segments of the front view cross? */
function segmentsCross(p: FrontSegment, q: FrontSegment): boolean {
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  return o(p.ax, p.ay, p.bx, p.by, q.ax, q.ay) * o(p.ax, p.ay, p.bx, p.by, q.bx, q.by) < 0
    && o(q.ax, q.ay, q.bx, q.by, p.ax, p.ay) * o(q.ax, q.ay, q.bx, q.by, p.bx, p.by) < 0;
}
