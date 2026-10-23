// The tidy cabinet: the route a careful technician would give every cord.
// Out of its panel port, down into the finger manager just below, along it to
// the side duct of its half of the cabinet, down the duct, into the manager
// above the switch, along it, and up into the switch port.
//
// Every cord gets its own lane (depth and layer in the managers, column in the
// duct) so that the bundle does not cross itself: in a manager, the cord with
// the shortest run to the side rides in front, the others pass behind the
// points where it drops in.

import { CONNECTOR, DUCT_SPAN, Rack, SEG, SIDE_BACK, SIDE_IN, SIDE_OUT, type Port } from './rack';
import type { Circuit } from './tangle';
import type { LevelDef } from './levels';

export type V3 = [number, number, number];

const FINGER_R = 0.003;
const LANES_Z = 6;

export function tidyRoutes(rack: Rack, circuits: Circuit[], radius: number, seg = SEG): V3[][] {
  const mgrs = rack.items.filter((it) => it.kind === 'hmgr').map((it) => it.unit);
  const plan = circuits.map((c) => {
    const a = rack.port(c.a), b = rack.port(c.b);
    const upper = nearestManager(mgrs, a.unit, +1);
    // arrive from the manager right above the device, else right below it, else the nearest above
    const lower = mgrs.includes(b.unit - 1) ? b.unit - 1 : mgrs.includes(b.unit + 1) ? b.unit + 1 : nearestManager(mgrs, b.unit, -1);
    const side = a.x + b.x * 0.3 < 0 ? -1 : 1;
    return { a, b, upper, lower, side, li: 0, lo: 0, duct: 0 };
  });
  // lanes, per side and per manager (a manager may serve cords leaving a panel
  // and cords arriving at a switch: they share its lanes); duct columns per side
  const ductCount = { [-1]: 0, [1]: 0 } as Record<number, number>;
  for (const side of [-1, 1]) {
    const mine = plan.filter((p) => p.side === side);
    const toSide = (x: number) => Math.abs(side * 0.25 - x);
    for (const m of new Set(mine.flatMap((p) => [p.upper, p.lower]))) {
      const uses: { p: (typeof plan)[number]; lower: boolean; x: number }[] = [];
      for (const p of mine) {
        if (p.upper === m) uses.push({ p, lower: false, x: p.a.x });
        if (p.lower === m && p.upper !== m) uses.push({ p, lower: true, x: p.b.x });
      }
      uses.sort((u, v) => toSide(u.x) - toSide(v.x)).forEach((u, i) => { if (u.lower) u.p.lo = i; else u.p.li = i; });
    }
    // in the duct, the cords of the upper managers ride outermost
    [...mine].sort((p, q) => p.upper - q.upper || p.li - q.li).forEach((p, i) => { p.duct = i; });
    ductCount[side] = mine.length;
  }
  const d = 2 * radius + 0.0008;
  const laneY = (unit: number, i: number) => rack.unitBottom(unit) + 0.004 + FINGER_R + radius + Math.floor(i / LANES_Z) * d;
  const laneZ = (i: number) => 0.058 - (i % LANES_Z) * 0.009;
  return plan.map((p) => {
    const s = p.side;
    // a panel right above its switch: a short cord curling down from one port to the other
    if (p.b.unit === p.a.unit + 1 && Math.abs(p.a.x - p.b.x) < 0.012) {
      // as tight as the bend radius allows, so that it cannot sag onto the unit below
      const zc = CONNECTOR + seg + 0.014;
      return smooth([
        [p.a.x, p.a.y, CONNECTOR],
        [p.a.x, p.a.y, CONNECTOR + seg],
        [p.a.x, p.a.y - 0.004, zc],
        [p.b.x, p.b.y + 0.004, zc],
        [p.b.x, p.b.y, CONNECTOR + seg],
        [p.b.x, p.b.y, CONNECTOR],
      ], 2, 2);
    }
    // both ends served by the same manager: along it, no trip to the duct
    if (p.upper === p.lower) {
      const yU = laneY(p.upper, p.li), zU = laneZ(p.li);
      return smooth([
        ...portExit(p.a, -1, seg),
        [p.a.x, yU, zU],
        [p.b.x, yU, zU],
        ...portExit(p.b, +1, seg).reverse(),
      ], 2, 2);
    }
    const yU = laneY(p.upper, p.li), zU = laneZ(p.li);
    const yL = laneY(p.lower, p.lo), zL = laneZ(p.lo);
    // duct column: across the width, then in depth (more of both for a full duct)
    const cols = ductCount[s] > 24 ? 8 : 6, rows = Math.max(4, Math.ceil(ductCount[s] / cols));
    const dx = s * (SIDE_OUT - 0.012 - (p.duct % cols) * ((SIDE_OUT - SIDE_IN - 0.024) / (cols - 1)));
    const dz = 0.058 - (Math.floor(p.duct / cols) % rows) * ((0.058 - SIDE_BACK - 0.012) / (rows - 1));
    const pts: V3[] = [
      ...portExit(p.a, -1, seg),
      [p.a.x, yU, zU],
      [s * 0.24, yU, zU],
      [dx, yU - 0.03, dz],
      [dx, yL + 0.03, dz],
      [s * 0.24, yL, zL],
      [p.b.x, yL, zL],
      ...portExit(p.b, yL > p.b.y ? +1 : -1, seg).reverse(),
    ];
    return smooth(pts, 2, 2);
  });
}

/**
 * A level as a careful technician would finish it: a finger manager in every
 * empty unit between the equipment, ducts all down both sides, and every cord
 * cut to its tidy route and plugged as planned. Its score says whether the
 * level can reach three stars (tools/solvable.ts, tests/levels.test.ts).
 */
export function tidyKit(level: LevelDef): LevelDef {
  const pre = [...level.preinstalled];
  const last = level.units.reduce((m, u, k) => (u.kind !== 'blank' ? k : m), 0);
  level.units.forEach((u, k) => {
    if (u.kind === 'blank' && k > 0 && k < last && !pre.some((p) => p.kind === 'hmgr' && p.unit === k)) pre.push({ kind: 'hmgr', unit: k, side: 0 });
  });
  for (const side of [-1, 1]) {
    for (let u = 1; u + DUCT_SPAN <= level.units.length + 1; u += DUCT_SPAN) pre.push({ kind: 'duct', unit: Math.min(u + 1, level.units.length - 1), side });
  }
  return { ...level, preinstalled: pre, showcase: 'tidy', wrong: 0, loose: 0 };
}

/** the two pinned connector nodes, then the cord leaving the boot towards the manager */
function portExit(p: Port, dir: number, seg: number): V3[] {
  return [
    [p.x, p.y, CONNECTOR],
    [p.x, p.y, CONNECTOR + seg],
    [p.x, p.y + dir * 0.006, CONNECTOR + seg + 0.012],
  ];
}

function nearestManager(mgrs: number[], unit: number, dir: number): number {
  let best = -1;
  for (const m of mgrs) {
    if ((m - unit) * dir <= 0) continue;
    if (best < 0 || Math.abs(m - unit) < Math.abs(best - unit)) best = m;
  }
  return best >= 0 ? best : unit + dir;
}

/** Chaikin corner cutting, keeping `keepA` / `keepB` points fixed at each end */
function smooth(pts: V3[], keepA: number, keepB: number): V3[] {
  let mid = pts.slice(keepA - 1, pts.length - keepB + 1);
  for (let it = 0; it < 3; it++) {
    const out: V3[] = [mid[0]];
    for (let i = 0; i < mid.length - 1; i++) {
      const p = mid[i], q = mid[i + 1];
      out.push(lerp(p, q, 0.25), lerp(p, q, 0.75));
    }
    out.push(mid[mid.length - 1]);
    mid = out;
  }
  return [...pts.slice(0, keepA - 1), ...mid, ...pts.slice(pts.length - keepB + 1)];
}

function lerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function polyLength(p: V3[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
  return L;
}

/** positions along a polyline at the given arc lengths (scaled to its length) */
export function resample(p: V3[], arcs: number[], out: Float64Array, at: number): void {
  const total = arcs[arcs.length - 1];
  const L = polyLength(p);
  let j = 1, acc = 0;
  for (let k = 0; k < arcs.length; k++) {
    const s = (arcs[k] / total) * L;
    while (j < p.length - 1 && acc + seg(p, j) < s) { acc += seg(p, j); j++; }
    const t = Math.min(1, Math.max(0, (s - acc) / Math.max(1e-12, seg(p, j))));
    const a = p[j - 1], b = p[j];
    out[3 * (at + k)] = a[0] + (b[0] - a[0]) * t;
    out[3 * (at + k) + 1] = a[1] + (b[1] - a[1]) * t;
    out[3 * (at + k) + 2] = a[2] + (b[2] - a[2]) * t;
  }
}

function seg(p: V3[], j: number): number {
  return Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1], p[j][2] - p[j - 1][2]);
}


/**
 * Nodes of a cord laid exactly along a route: the pinned connector node, the
 * route between the two boots in segments of about `seg`, the other pin. Its
 * rest length is the route's, so it keeps that shape once the physics runs.
 */
export function pathToNodes(path: V3[], seg: number): number[] {
  const inner = path.slice(1, path.length - 1);
  const L = polyLength(inner);
  const n = Math.max(1, Math.round(L / seg));
  const arcs = Array.from({ length: n + 1 }, (_, k) => (L * k) / n);
  const buf = new Float64Array(3 * (n + 1));
  resample(inner, arcs, buf, 0);
  return [...path[0], ...buf, ...path[path.length - 1]];
}
