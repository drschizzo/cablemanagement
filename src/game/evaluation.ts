// How tidy a cabinet is: for each line of the schedule, whether its cord is
// connected, and whether it is tidy (routed through the management, clear of
// the other ports, relaxed); the ducts mixing fibre, copper and power; the
// stars, and what each of them asks. The player sees three things: plugged,
// tidy, within the downtime budget. Reads a World, changes
// nothing.

import { CORD_KINDS } from './cordTypes';
import { insideBox, type SupportBox } from './rack';
import type { World } from './world';
import type { CableIndex } from './cables';

export interface CircuitStatus {
  cable: number; // cable serving it (−1 none)
  connected: boolean;
  routed: boolean;
  clear: boolean;
  /** neither pulled taut nor kinked */
  relaxed: boolean;
  /** connected, routed, clear and relaxed: nothing left to do on its cord */
  tidy: boolean;
}

export interface Evaluation {
  circuits: CircuitStatus[];
  connected: number;
  routed: number;
  clear: number;
  /** links whose cord is tidy */
  tidy: number;
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
  /** m the tautest cord lacks to be slack enough (0: none taut) */
  tautShort: number;
  /** ducts holding cords of more than one family (fibre, copper, power) */
  mixedSupports: number;
  /** families of cords in the cabinet (fibre, copper, power): with more than one, each runs down its own ducts */
  families: number;
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
  const circuits: CircuitStatus[] = w.circuits.map((ci, i) => {
    const cable = w.rack.cableJoining(ci.a, ci.b);
    // a cord broken inside does not connect: the link stays down
    const connected = w.circuitUp(i);
    const routed = connected && cableRouted[cable];
    const clear = connected && !cableObstructs[cable];
    const relaxed = connected && !cableStrain[cable];
    return { cable, connected, routed, clear, relaxed, tidy: routed && clear && relaxed };
  });
  const n = circuits.length;
  const count = (f: (s: CircuitStatus) => boolean) => circuits.filter(f).length;
  const connected = count((s) => s.connected);
  const routed = count((s) => s.routed);
  const clear = count((s) => s.clear);
  const relaxed = count((s) => s.relaxed);
  const tidy = count((s) => s.tidy);
  const tautShort = w.cables.reduce((most, _, c) => cableStrain[c] === 'taut' ? Math.max(most, TAUT_SHORT * w.routeLength(c)! - w.cableLength(c)) : most, 0);
  const mixedSupports = mixedSupportCount(w, supports);
  const families = new Set(w.cables.map((cb) => CORD_KINDS[cb.type].family)).size;
  const stars = starsOf({ total: n, connected, routed, clear, relaxed, tidy, tautShort, mixedSupports, families, downtime: w.maintenance.downtime, budget: w.maintenance.budget });
  return {
    circuits, connected, routed, clear, relaxed, tidy, tautShort, total: n, stars, cableRouted, cableObstructs, cableStrain,
    liveDown: w.maintenance.liveDown(), downtime: w.maintenance.downtime, budget: w.maintenance.budget, mixedSupports, families,
  };
}

/** the counts the stars are read from */
export type StarCounts = Pick<Evaluation, 'total' | 'connected' | 'routed' | 'clear' | 'relaxed' | 'tidy' | 'tautShort' | 'mixedSupports' | 'families' | 'downtime' | 'budget'>;

/**
 * What a star asks, and how far the cabinet is from it. One star: every
 * link plugged. Two: every cord tidy (for those not yet, how many hang, cross
 * a port, are strained, a cord may do several, and how much the tautest
 * lacks, m). Three: what the level asks besides, if anything: the downtime
 * within its budget, each family of cords down its own ducts.
 */
export type StarGoal =
  | { stars: 1; kind: 'connect'; done: number; total: number }
  | { stars: 2; kind: 'tidy'; done: number; total: number; hanging: number; front: number; strained: number; short: number }
  | { stars: 3; kind: 'budget'; spent: number; budget: number }
  | { stars: 3; kind: 'separate'; mixed: number };

/** every goal of the three stars, in order (three stars ask nothing more than two when the level has neither budget nor families to keep apart) */
export function starGoals(c: StarCounts): StarGoal[] {
  const n = c.total;
  const goals: StarGoal[] = [
    { stars: 1, kind: 'connect', done: c.connected, total: n },
    { stars: 2, kind: 'tidy', done: c.tidy, total: n, hanging: n - c.routed, front: n - c.clear, strained: n - c.relaxed, short: c.tautShort },
  ];
  if (Number.isFinite(c.budget)) goals.push({ stars: 3, kind: 'budget', spent: c.downtime, budget: c.budget });
  if (c.families > 1) goals.push({ stars: 3, kind: 'separate', mixed: c.mixedSupports });
  return goals;
}

/** a goal reached (the budget: not overrun so far) */
export function isGoalMet(g: StarGoal): boolean {
  switch (g.kind) {
    case 'connect': case 'tidy': return g.done === g.total;
    case 'budget': return g.spent <= g.budget;
    case 'separate': return g.mixed === 0;
  }
}

/** the stars: each one needs its goals and those of the stars before it */
export function starsOf(c: StarCounts): number {
  const goals = starGoals(c);
  let stars = 0;
  for (const s of [1, 2, 3]) {
    if (!goals.filter((g) => g.stars === s).every(isGoalMet)) break;
    stars = s;
  }
  return stars;
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
  if (!CORD_KINDS[cb.type].kinks) return null;
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

/**
 * Ducts holding cords of more than one family: fibre, copper and
 * power each run down their own. (A manager next to a switch with fibre and
 * copper ports cannot help serving both.)
 */
function mixedSupportCount(w: World, supports: SupportBox[]): number {
  const x = w.sim.x;
  const managers = new Set(w.rack.items.filter((it) => it.kind === 'fingerManager').map((it) => it.id));
  let mixed = 0;
  for (const sp of supports) {
    if (managers.has(sp.item)) continue;
    const kinds = new Set<string>();
    w.cables.forEach((cb) => {
      for (let k = 4; k < cb.count - 4; k += 2) {
        const i = cb.start + k;
        if (insideBox(sp, x[3 * i], x[3 * i + 1], x[3 * i + 2])) { kinds.add(CORD_KINDS[cb.type].family); break; }
      }
    });
    if (kinds.size > 1) mixed++;
  }
  return mixed;
}
