// Routes: the way the player draws for a cord, through guides in order, and
// the animation that dresses the cord along it.
//
// The difficulty of the game is the plan (which guides, which length, which
// order), not the hand: the player draws the way, and the cord is laid along
// it as a technician would lay it. Nothing is teleported and nothing passes
// through anything: every node is led by a soft spring on a leash (`setGoals`)
// along its own way — out of where it is to the front of the cabinet, across,
// and in through the opening of the guide it belongs in (over the tips of a
// manager, through the slit of a duct, the open corner of a ring). The
// contacts stay hard: a cord that meets something stops there.

import {
  CONNECTOR, COLUMN_X, WALL_X, DUCT_FRONT, DUCT_PITCH, DUCT_SLIT_X, FINGER_R, MANAGER_TIP, RING_FRONT, RING_GAP, SIDE_IN, SIDE_OUT,
  managerFingers, type Guide, type Port,
} from './rack';
import type { World } from './world';
import { dist, lerp, polyLength, type V3 } from './vec3';
import type { CableIndex, EndIndex } from './cables';
import { assertNever } from './exhaustive';

/** the plane in front of every guide where a cord is carried across (z) */
export const FRONT = 0.12;
/** how far apart the passes of a cord laid in a serpentine are (m) */
const LANE = 0.007;
/** extra length left free by the far end rather than laid in the guides (m) */
const PLAY = 0.06;
/** how far a node may be carried away from a plugged end, per metre of cord between them */
const NEAR_PORT = 0.8;

export interface RoutePlan {
  cable: CableIndex;
  /** the end the route starts from (it stays where it is) */
  a: EndIndex;
  /** the port the other end plugs into once there, or null */
  portB: string | null;
  /** each node's way (null: not led) */
  ways: (NodeWay | null)[];
  /** extra length of the cord over its route (m, the belly it makes) */
  slack: number;
}

/**
 * The way of a node: out of where it is to the front of the cabinet (`out`,
 * from where it is), then from the front in to its place (`inn`, ending
 * there). Every node goes out, across and in at the same time, so that the
 * cord keeps a shape: as it is, then the route's seen from the front, then the route.
 */
export interface NodeWay { out: V3[]; inn: V3[] }

export type RouteResult = { plan: RoutePlan } | { error: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const centre = (g: Guide): V3 => [0, 1, 2].map((d) => (g.room.min[d] + g.room.max[d]) / 2) as V3;
const inBox = (b: Guide['reach'], p: V3) => p.every((v, d) => v >= b.min[d] && v <= b.max[d]);

/** the middle of the slot between two fingers of a manager row nearest x */
function slotX(x: number): number {
  const xs = managerFingers();
  let best = x, bd = Infinity;
  for (let i = 0; i < xs.length - 1; i++) {
    const m = (xs[i] + xs[i + 1]) / 2;
    if (Math.abs(m - x) < bd) { bd = Math.abs(m - x); best = m; }
  }
  return best;
}

/**
 * The way for cable c through `guides` in that order, and into `portB` when
 * given. The route starts from the end that stays (plugged, nearest the first
 * guide) and ends at the other one's port; a free end with no port to go to
 * stays free after the last guide. `legs` are the points of the line drawn
 * outside the guides, one leg before each guide and one after the last: the
 * cord passes there, and goes into each guide from the side the line came
 * from (by an end of a manager rather than between its fingers, say).
 *
 * In five steps: which end stays; the route as points; the route fitted to
 * the cord's length; where each node of the cord goes on it; and the way each
 * node takes to get there.
 */
export function planRoute(w: World, c: CableIndex, guides: Guide[], portB: Port | null, legs: V3[][] = []): RouteResult {
  if (!guides.length && !portB) return { error: 'Tracez le chemin par-dessus les guides (ou jusqu\'à un port).' };
  const cb = w.cables[c];
  const ports = cb.ends.map((e) => (e.port ? w.rack.port(e.port) : null));
  const a = stayingEnd(w, c, ports, guides, portB);
  const b = 1 - a;
  const pa = ports[a];
  // where the other end goes: the port the stroke ends on, else its own
  let pb = portB ?? ports[b];
  if (portB && portB.plug >= 0 && portB.plug !== c * 2 + b) return { error: `Le port ${portB.id} est déjà occupé.` };
  if (pb && pb === pa) pb = null;

  const drawn = drawnLegs(w, guides, legs, pa, pb);
  const { route: drawnRoute, runs } = routeThrough(w, c, guides, drawn, pa, pb);
  const arcs = nodeArcs(w, c, a);
  const length = arcs[cb.count - 1];
  let path = drawnRoute, slack = 0;
  if (pb) {
    const route = cutCorners(drawnRoute, new Set(drawn.flat()), length);
    const needed = polyLength(route);
    if (needed > length + 0.01) return { error: `Ce cordon est trop court pour ce chemin : il manque ${Math.ceil((needed - length) * 100)} cm (un cordon plus long se prend au Stock).` };
    slack = length - needed;
    path = layExtraLength(route, runs, guides, slack);
  }
  const place = nodePlaces(arcs, path, pb !== null);
  const ways = nodeWays(w, c, a, arcs, place, pa !== null, pb !== null);
  return { plan: { cable: c, a, portB: pb && pb !== ports[b] ? pb.id : null, ways, slack } };
}

/** the end that stays where it is: the plugged one (the nearer the first guide if both are) */
function stayingEnd(w: World, c: CableIndex, ports: (Port | null)[], guides: Guide[], portB: Port | null): EndIndex {
  const first: V3 = guides.length ? centre(guides[0]) : [portB!.x, portB!.y, 0];
  // both plugged, and a port to go to: the end plugged nearest it moves there
  if (ports[0] && ports[1] && portB) return dist(portAt(ports[0]), portAt(portB)) <= dist(portAt(ports[1]), portAt(portB)) ? 1 : 0;
  if (ports[0] && ports[1]) return dist(portAt(ports[0]), first) <= dist(portAt(ports[1]), first) ? 0 : 1;
  if (ports[0] || ports[1]) return ports[0] ? 0 : 1;
  const x = w.sim.x;
  const tip = (e: EndIndex): V3 => { const [n0] = w.endNodes(c, e); return [x[3 * n0], x[3 * n0 + 1], x[3 * n0 + 2]]; };
  return dist(tip(0), first) <= dist(tip(1), first) ? 0 : 1;
}

const portAt = (p: Port): V3 => [p.x, p.y, 0];

/**
 * The line drawn between the guides, cleaned up: none by a port (the cord
 * comes out of it and goes into it straight), none along the guide it comes
 * out of or goes into (the line ran beside it: it was in it). One leg before
 * each guide, one after the last.
 */
function drawnLegs(w: World, guides: Guide[], legs: V3[][], pa: Port | null, pb: Port | null): V3[][] {
  const floor = w.rack.floorY + w.radius + 0.004, wall = WALL_X - w.radius - 0.004;
  return [...guides.map((_, k) => legs[k] ?? []), legs[guides.length] ?? []].map((leg, k) => {
    const pts = leg.filter((p) => ![pa, pb].some((q) => q && Math.hypot(p[0] - q.x, p[1] - q.y) < 0.04));
    let i = 0, j = pts.length;
    if (k > 0) while (i < j && nearGuide(guides[k - 1], pts[i])) i++;
    if (k < guides.length) while (j > i && nearGuide(guides[k], pts[j - 1])) j--;
    return wayPoints(pts.slice(i, j), floor, wall);
  });
}

/** the route as points: out of port a, along the line drawn and through each guide, into port b */
function routeThrough(w: World, c: CableIndex, guides: Guide[], drawn: V3[][], pa: Port | null, pb: Port | null): { route: V3[]; runs: Run[] } {
  const pts: V3[] = [];
  // the stretches along a guide, where the extra length can be laid
  const runs: Run[] = [];
  const exit = (p: Port, dir: number): V3[] => [
    [p.x, p.y, CONNECTOR],
    [p.x, p.y, CONNECTOR + w.seg],
    [p.x, p.y + dir * 0.006, CONNECTOR + w.seg + 0.012],
  ];
  // what is next after guide k − 1: the line drawn, else the guide or the port
  const next = (k: number): V3 | null => {
    if (k >= 0 && drawn[k].length) return drawn[k][0];
    return k < 0 ? (pa ? portAt(pa) : null) : k < guides.length ? centre(guides[k]) : pb ? portAt(pb) : null;
  };
  if (pa) pts.push(...exit(pa, next(0)![1] < pa.y ? -1 : 1));
  guides.forEach((g, k) => {
    pts.push(...drawn[k]);
    const prev = pts.length ? pts[pts.length - 1] : null;
    const lane = cordsLyingIn(w, c, g);
    const pass = throughGuide(g, lane, prev, next(k + 1), w.radius);
    pts.push(...pass.points);
    if (pass.run) runs.push(pass.run);
  });
  pts.push(...drawn[guides.length]);
  if (pb) pts.push(...exit(pb, pts.length && pts[pts.length - 1][1] < pb.y ? -1 : 1).reverse());
  // no repeated points
  return { route: pts.filter((p, k) => k === 0 || dist(p, pts[k - 1]) > 1e-4), runs };
}

function throughGuide(g: Guide, lane: number, prev: V3 | null, next: V3 | null, r: number): GuidePass {
  switch (g.kind) {
    case 'fingerManager': return throughManager(g, lane, prev, next, r);
    case 'ring': return throughRing(g, lane, r);
    case 'duct': return throughDuct(g, lane, prev, next, r);
    default: return assertNever(g.kind);
  }
}

/** the cords other than c already lying in a guide: each takes a lane of its own */
function cordsLyingIn(w: World, c: CableIndex, g: Guide): number {
  const x = w.sim.x;
  let n = 0;
  w.cables.forEach((other, oc) => {
    if (oc === c) return;
    let k = 0;
    for (let i = other.start; i < other.start + other.count && k < 2; i++) if (inBox(g.room, [x[3 * i], x[3 * i + 1], x[3 * i + 2]])) k++;
    if (k >= 2) n++;
  });
  return n;
}

interface GuidePass {
  points: V3[];
  /** the stretch along the guide where extra length may be laid */
  run?: Run;
}

/** through a finger manager: in down (or up) between two fingers from a port, or in at an end from a side channel */
function throughManager(g: Guide, lane: number, prev: V3 | null, next: V3 | null, r: number): GuidePass {
  const y = g.room.min[1] + r + 0.001 + Math.floor(lane / 6) * (2 * r + 0.0008);
  const z = clamp(0.058 - (lane % 6) * 0.009, g.room.min[2] + r, g.room.max[2] - r);
  const rowAbove = g.room.max[1] + FINGER_R, rowBelow = g.room.min[1] - FINGER_R;
  const into = (q: V3 | null): V3[] => {
    if (!q) return [];
    if (Math.abs(q[0]) > COLUMN_X) return [[Math.sign(q[0]) * 0.235, y, z]];
    const sx = slotX(q[0]);
    const row = q[1] > y ? rowAbove + 0.008 : rowBelow - 0.008;
    return [[sx, row, z], [sx, y, z]];
  };
  const pin = into(prev), pout = into(next).reverse();
  if (!pin.length && !pout.length) pin.push([-0.1, y, z]);
  if (!pin.length) pin.push([clamp(pout[0][0] - Math.sign(pout[0][0] || 1) * 0.1, -0.2, 0.2), y, z]);
  if (!pout.length) pout.push([clamp(pin[pin.length - 1][0] - Math.sign(pin[pin.length - 1][0] || 1) * 0.1, -0.2, 0.2), y, z]);
  // its lanes towards the deeper side of the trough, if there is more room there
  const run = { g, p: pin[pin.length - 1], q: pout[0], lane: [0, 0, z - g.room.min[2] > g.room.max[2] - z ? -LANE : LANE] as V3 };
  return { points: [...pin, ...pout], run };
}

/** through a ring: one point inside it, the lanes side by side then in rows */
function throughRing(g: Guide, lane: number, r: number): GuidePass {
  const s = Math.sign(g.room.min[0] + g.room.max[0]);
  const xIn = s > 0 ? g.room.min[0] : g.room.max[0];
  const x = xIn + s * (r + 0.004 + (lane % 4) * 0.02);
  const z = clamp(0.045 - Math.floor(lane / 4) * 0.02, g.room.min[2] + r, g.room.max[2] - r);
  return { points: [[x, (g.room.min[1] + g.room.max[1]) / 2, z]] };
}

/** through a duct: in and out through a slot of the inner wall from the column, else by an end */
function throughDuct(g: Guide, lane: number, prev: V3 | null, next: V3 | null, r: number): GuidePass {
  const s = Math.sign(g.room.min[0] + g.room.max[0]);
  const cols = 6;
  const dx = s * (SIDE_OUT - 0.012 - (lane % cols) * ((SIDE_OUT - SIDE_IN - 0.024) / (cols - 1)));
  const dz = clamp(0.055 - Math.floor(lane / cols) * 0.016, g.room.min[2] + r, g.room.max[2] - r);
  const yb = g.room.min[1] + 0.006, yt = g.room.max[1] - 0.006;
  const slotY = (y: number) => { const k = Math.round((y - g.room.min[1]) / DUCT_PITCH - 0.5); return clamp(g.room.min[1] + (k + 0.5) * DUCT_PITCH, yb, yt); };
  const side = (q: V3 | null, out: boolean): V3[] => {
    if (!q) return [];
    if (Math.abs(q[0]) < SIDE_IN && q[1] > g.room.min[1] && q[1] < g.room.max[1]) {
      const y = slotY(q[1]);
      const p: V3[] = [[s * (SIDE_IN - 0.012), y, dz], [s * (SIDE_IN + 0.012), y, dz], [dx, y, dz]];
      return out ? p.reverse() : p;
    }
    return [[dx, clamp(q[1], yb, yt), dz]];
  };
  const ins = side(prev, false), outs = side(next, true);
  const run = ins.length && outs.length ? { g, p: ins[ins.length - 1], q: outs[0], lane: [0, 0, -LANE] as V3 } : undefined;
  return { points: [...ins, ...outs], run };
}

/** the arc length of each node of cord c, counted from end a */
function nodeArcs(w: World, c: CableIndex, a: EndIndex): number[] {
  const cb = w.cables[c];
  const node = (k: number) => (a === 0 ? cb.start + k : cb.start + cb.count - 1 - k);
  const arcs: number[] = [0];
  for (let k = 1; k < cb.count; k++) arcs.push(arcs[k - 1] + w.sim.rest[Math.min(node(k), node(k - 1))]);
  return arcs;
}

/**
 * The line drawn outside the guides is where the cord is laid, not where it
 * must pass: nothing holds it there. A cord too short for all of it cuts the
 * corners the line made (`free` points), the one that saves the most first,
 * as a cord pulled taut does; only the guides and the side each one is
 * entered by make a cord too short.
 */
function cutCorners(route: V3[], free: Set<V3>, length: number): V3[] {
  while (polyLength(route) > length) {
    let best = -1, saves = 0;
    for (let k = 1; k < route.length - 1; k++) {
      if (!free.has(route[k])) continue;
      const s = dist(route[k - 1], route[k]) + dist(route[k], route[k + 1]) - dist(route[k - 1], route[k + 1]);
      if (s > saves) { saves = s; best = k; }
    }
    if (best < 0) break;
    route = route.filter((_, k) => k !== best);
  }
  return route;
}

/**
 * The extra length laid in the guides (hanging in a duct first), what is
 * left past a little play as a belly; the play stays free, by the far end.
 */
function layExtraLength(route: V3[], runs: Run[], guides: Guide[], slack: number): V3[] {
  const lay = slack - PLAY;
  if (lay <= 0.01) return route;
  const folded = withFolds(route, runs, lay);
  return folded.extra > 0.05 ? withBelly(folded.route, folded.extra, guides) : folded.route;
}

/**
 * The place of each node along the path: from end a, and the last few from
 * the far end (its connector to its port, when it goes to one), the play
 * between them free (null).
 */
function nodePlaces(arcs: number[], path: V3[], toPort: boolean): (V3 | null)[] {
  const length = arcs[arcs.length - 1];
  const pathLength = polyLength(path);
  const tail = toPort ? polyLength(path.slice(-4)) : 0;
  return arcs.map((s) => {
    if (s <= pathLength - tail + 1e-6) return along(path, s);
    if (toPort && length - s <= tail + 1e-6) return along(path, pathLength - (length - s));
    return null;
  });
}

/** the way of each node: out to the front of the cabinet, across, and in through its guide's opening */
function nodeWays(w: World, c: CableIndex, a: EndIndex, arcs: number[], place: (V3 | null)[], fromPort: boolean, toPort: boolean): (NodeWay | null)[] {
  const cb = w.cables[c], x = w.sim.x;
  const length = arcs[cb.count - 1];
  const all = w.rack.guides();
  const node = (k: number) => (a === 0 ? cb.start + k : cb.start + cb.count - 1 - k);
  const fromEnd = (k: number) => Math.min(fromPort ? arcs[k] : Infinity, toPort ? length - arcs[k] : Infinity);
  // how far out a node may go: not far from a plugged end
  const front = (z: number, k: number) => Math.min(FRONT, z + fromEnd(k) * NEAR_PORT);
  // the way in through each guide's opening, as an offset from the place
  // (spread over the neighbouring nodes: the cord goes in in one piece)
  const ins = place.map((T) => (T ? entry(all, T) : null));
  const off = ins.map((_, k) => {
    let best: Entry | null = null, bn = 0;
    for (let j = Math.max(0, k - 3); j <= Math.min(cb.count - 1, k + 3); j++) {
      const e = ins[j], f = SPREAD[Math.abs(j - k)];
      if (!e) continue;
      const n = Math.hypot(e.dx, e.dy) * f;
      if (n > bn) { bn = n; best = { dx: e.dx * f, dy: e.dy * f, z: e.z }; }
    }
    return best;
  });
  const ways: (NodeWay | null)[] = [];
  for (let k = 0; k < cb.count; k++) {
    const i = node(k);
    const T = place[k];
    if (!T || (fromPort && k <= 1)) { ways.push(null); continue; }
    const C: V3 = [x[3 * i], x[3 * i + 1], x[3 * i + 2]];
    const e = entry(all, C);
    const out: V3[] = [C];
    if (e) out.push([C[0] + e.dx, C[1] + e.dy, e.z]);
    const o = out[out.length - 1];
    out.push([o[0], o[1], Math.max(o[2], front(C[2], k))]);
    const d = off[k], own = ins[k];
    const inn: V3[] = [];
    if (d) {
      inn.push([T[0] + d.dx, T[1] + d.dy, Math.max(T[2], front(T[2], k))]);
      inn.push([T[0] + d.dx, T[1] + d.dy, own ? own.z : T[2]]);
    } else inn.push([T[0], T[1], Math.max(T[2], front(T[2], k))]);
    inn.push(T);
    ways.push({ out, inn });
  }
  return ways;
}

/** how near a guide (seen from the front) a line drawn may pass and still be taken as passing in it (m) */
const BESIDE = 0.02;
const nearGuide = (g: Guide, p: V3) => Math.hypot(Math.max(g.reach.min[0] - p[0], 0, p[0] - g.reach.max[0]), Math.max(g.reach.min[1] - p[1], 0, p[1] - g.reach.max[1])) < BESIDE;

/**
 * The points of a leg of the line drawn the cord can be laid along: in the
 * cabinet (above its floor, between its walls), and only where the line
 * turns (the hand's tremor smoothed out).
 */
function wayPoints(leg: V3[], floor: number, side: number): V3[] {
  const pts = leg.map((p): V3 => [clamp(p[0], -side, side), Math.max(p[1], floor), p[2]]);
  const keep = new Uint8Array(pts.length);
  const simplify = (i: number, j: number) => {
    let best = -1, bd = 0.015;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(pts[k], pts[i], pts[j]);
      if (d > bd) { bd = d; best = k; }
    }
    if (best < 0) return;
    keep[best] = 1;
    simplify(i, best);
    simplify(best, j);
  };
  if (pts.length) { keep[0] = keep[pts.length - 1] = 1; simplify(0, pts.length - 1); }
  return pts.filter((_, k) => keep[k]);
}

function distToSegment(p: V3, a: V3, b: V3): number {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = L2 > 0 ? clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2, 0, 1) : 0;
  return dist(p, lerp(a, b, t));
}

interface Entry { dx: number; dy: number; z: number }
/** how much of an opening's offset a node passes on to its neighbours, by how far along the cord */
const SPREAD = [1, 1, 0.6, 0.25];

/**
 * How point p is reached from the front of the cabinet: through the opening
 * of the guide it lies in, as an offset from p and the depth where it is
 * crossed (null: straight in).
 */
function entry(guides: Guide[], p: V3): Entry | null {
  let g: Guide | null = null;
  for (const q of guides) if (inBox(q.reach, p)) { g = q; break; }
  if (g?.kind === 'fingerManager' && p[1] <= g.room.max[1] && p[1] >= g.room.min[1] - 0.004) {
    // over the tips, under the top row, then down onto the fingers
    const gap = (g.room.min[1] + MANAGER_TIP + g.room.max[1]) / 2;
    return { dx: 0, dy: gap - p[1], z: p[2] };
  }
  if (g?.kind === 'ring') {
    // by the open corner
    const s = Math.sign(g.room.min[0] + g.room.max[0]);
    return { dx: s * (SIDE_OUT - 0.004 - RING_GAP / 2) - p[0], dy: 0, z: RING_FRONT - RING_GAP / 2 };
  }
  if (g?.kind === 'duct' && Math.abs(p[0]) > SIDE_IN) {
    // through the slit, then across behind the lips
    return { dx: Math.sign(p[0]) * DUCT_SLIT_X - p[0], dy: 0, z: DUCT_FRONT - 0.012 };
  }
  return null;
}

/** the point at arc length s along a polyline */
function along(pts: V3[], s: number): V3 {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= s && d > 0) return lerp(pts[i - 1], pts[i], (s - acc) / d);
    acc += d;
  }
  return pts[pts.length - 1];
}

interface Run { g: Guide; p: V3; q: V3; lane: V3 }

/**
 * The route with (some of) its extra length laid in the guides, as a
 * technician lays a cord too long: its stretch along a guide made into a
 * serpentine, from one end of the guide to the other and back, a lane further
 * each time (ducts first, where it hangs). Returns what is left over.
 */
function withFolds(route: V3[], runs: Run[], extra: number): { route: V3[]; extra: number } {
  let out = route;
  const order = [...runs].sort((a, b) => Number(b.g.kind === 'duct') - Number(a.g.kind === 'duct'));
  for (const run of order) {
    if (extra <= 0.01) break;
    const ip = out.indexOf(run.p), iq = out.indexOf(run.q);
    if (ip < 0 || iq !== ip + 1) continue;
    const s = serpentine(run, extra);
    if (!s) continue;
    const before = polyLength(out);
    out = [...out.slice(0, ip), ...s, ...out.slice(iq + 1)];
    extra -= polyLength(out) - before;
  }
  return { route: out, extra: Math.max(0, extra) };
}

/**
 * The stretch p → q of a run made longer by about `extra`: turns past both
 * ends in turn, each pass in the next lane, the last back to q. Null when the
 * guide has no room for it.
 */
function serpentine(run: Run, extra: number): V3[] | null {
  const { p, q, lane, g } = run;
  const L = polyLength([p, q]);
  // the axis the cord runs along: x in a manager, y in a duct
  const ax = g.kind === 'duct' ? 1 : 0;
  const lo = g.room.min[ax] + 0.012, hi = g.room.max[ax] - 0.012;
  const ap = clamp(p[ax], lo, hi), aq = clamp(q[ax], lo, hi);
  const dir = aq >= ap ? 1 : -1;
  // the ends of the guide, past p (turned at first) and past q
  const endP = dir > 0 ? lo : hi, endQ = dir > 0 ? hi : lo;
  // lanes the guide has room for
  let lanes = 0;
  for (let k = 1; k <= 10; k++) {
    const ok = [p, q].every((e) => [0, 1, 2].every((d) => { if (d === ax) return true; const v = e[d] + lane[d] * k; return v >= g.room.min[d] + 0.003 && v <= g.room.max[d] - 0.003; }));
    if (!ok) break;
    lanes = k;
  }
  if (lanes < 1 || extra < 0.02) return null;
  // m turns, past p, past q, past p…, as deep as u, each pass in the next
  // lane; the last pass to q's place in its lane, then across to q
  const build = (m: number, u: number): V3[] => {
    const at = (e: V3, a: number, k: number): V3 => { const v: V3 = [e[0] + lane[0] * k, e[1] + lane[1] * k, e[2] + lane[2] * k]; v[ax] = a; return v; };
    const tp = ap + (endP - ap) * u, tq = aq + (endQ - aq) * u;
    const pts: V3[] = [p];
    for (let k = 0; k < m; k++) {
      const a = k % 2 === 0 ? tp : tq;
      pts.push(at(p, a, k), at(p, a, k + 1));
    }
    pts.push(at(q, q[ax], m), q);
    return pts;
  };
  // the fewest turns that take it all, as shallow as they can be; never
  // longer than asked (turning costs a little even at no depth)
  const want = L + extra;
  for (let m = 1; m <= lanes; m++) {
    if (polyLength(build(m, 1)) < want && m < lanes) continue;
    if (polyLength(build(m, 1)) <= want) return build(m, 1);
    if (polyLength(build(m, 0)) > want) return m > 1 ? build(m - 1, 1) : null;
    let ulo = 0, uhi = 1;
    for (let it = 0; it < 30; it++) { const u = (ulo + uhi) / 2; if (polyLength(build(m, u)) < want) ulo = u; else uhi = u; }
    return build(m, ulo);
  }
  return null;
}

/**
 * The route with its extra length as a belly, in its longest stretch outside
 * the guides: downwards (and a little forwards) in a level stretch, forwards
 * in an upright one, as a cord too long hangs.
 */
function withBelly(route: V3[], extra: number, guides: Guide[]): V3[] {
  let best = -1, bl = 0;
  for (let i = 3; i < route.length - 3; i++) {
    const a = route[i - 1], b = route[i];
    const mid = lerp(a, b, 0.5);
    if (guides.some((g) => inBox(g.room, mid))) continue;
    const d = dist(a, b);
    if (d > bl) { bl = d; best = i; }
  }
  if (best < 0) {
    // no stretch outside a guide: the longest one
    for (let i = 3; i < route.length - 3; i++) { const d = dist(route[i - 1], route[i]); if (d > bl) { bl = d; best = i; } }
  }
  if (best < 0) return route;
  const a = route[best - 1], b = route[best];
  const level = Math.abs(b[1] - a[1]) < dist(a, b) * 0.7;
  const dir: V3 = level ? [0, -0.9, 0.44] : [0, 0, 1];
  const bow = (h: number): V3[] => {
    const out: V3[] = [];
    for (let k = 1; k < 16; k++) {
      const f = k / 16, q = lerp(a, b, f), s = h * Math.sin(Math.PI * f);
      out.push([q[0] + dir[0] * s, q[1] + dir[1] * s, q[2] + dir[2] * s]);
    }
    return [...route.slice(0, best), ...out, ...route.slice(best)];
  };
  const want = polyLength(route) + extra;
  let lo = 0, hi = 0.05;
  while (polyLength(bow(hi)) < want && hi < 5) hi *= 2;
  for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (polyLength(bow(m)) < want) lo = m; else hi = m; }
  return bow((lo + hi) / 2);
}

/**
 * A route being laid: every node is led out to the front of the cabinet,
 * across to the front of its place, and in, all at the same pace. Then the
 * cord is held there a moment and let go; the other end plugs into its port
 * if it got there.
 */
export class RouteRun {
  t = 0;
  readonly duration: number;
  private hold = 0.8;
  private pos: Float64Array;
  private wt: Float64Array;
  /** each node's whole way (out, across, in), the arc lengths where its phases end, and how far along it its goal is */
  private paths: (V3[] | null)[];
  private ends: number[][];
  private prog: Float64Array;
  /** when the cord got there, −1 before */
  private arrived = -1;
  done = false;
  /** the other end plugged in at the end (null: not yet, or none asked) */
  plugged: boolean | null = null;

  constructor(private w: World, readonly plan: RoutePlan) {
    const cb = w.cables[plan.cable];
    this.pos = new Float64Array(3 * cb.count);
    this.wt = new Float64Array(cb.count);
    this.prog = new Float64Array(cb.count);
    this.paths = plan.ways.map((way) => (way ? [...way.out, ...way.inn] : null));
    this.ends = plan.ways.map((way) => (way ? [polyLength(way.out), polyLength(way.out) + dist(way.out[way.out.length - 1], way.inn[0]), polyLength(way.out) + dist(way.out[way.out.length - 1], way.inn[0]) + polyLength(way.inn)] : []));
    let across = 0.1;
    for (const way of plan.ways) if (way) across = Math.max(across, dist(way.out[way.out.length - 1], way.inn[0]));
    this.duration = clamp(1.1 + across * 1.2, 1.4, 3);
    // the end that moves to another port comes out of its own first
    const b = 1 - plan.a;
    if (plan.portB && cb.ends[b].port) w.unplug(plan.cable, b);
  }

  /** advances by dt seconds; true once finished */
  step(dt: number): boolean {
    if (this.done) return true;
    this.t += dt;
    const { plan, w } = this;
    const cb = w.cables[plan.cable], x = w.sim.x;
    const u = Math.min(1, this.t / this.duration);
    // out (0 – 0.25), across (0.25 – 0.6), in (0.6 – 1), each eased, every
    // node at the same pace (the cord keeps a shape)
    const ease = (v: number) => { const q = clamp(v, 0, 1); return q * q * (3 - 2 * q); };
    let behind = false;
    for (let k = 0; k < cb.count; k++) {
      const path = this.paths[k], e = this.ends[k];
      const i = plan.a === 0 ? k : cb.count - 1 - k;
      if (!path) { this.wt[i] = 0; continue; }
      const want = u < 0.25 ? e[0] * ease(u / 0.25) : u < 0.6 ? e[0] + (e[1] - e[0]) * ease((u - 0.25) / 0.35) : e[1] + (e[2] - e[1]) * ease((u - 0.6) / 0.4);
      this.prog[k] = want;
      if (want < e[2] - 1e-4) behind = true;
      const p = along(path, this.prog[k]);
      this.pos[3 * i] = p[0]; this.pos[3 * i + 1] = p[1]; this.pos[3 * i + 2] = p[2];
    }
    if (this.arrived < 0 && !behind) this.arrived = this.t;
    // held there a moment, then let go gently
    const weight = this.arrived < 0 ? 1 : Math.max(0, 1 - (this.t - this.arrived) / this.hold);
    for (let k = 0; k < cb.count; k++) if (this.paths[k]) this.wt[plan.a === 0 ? k : cb.count - 1 - k] = weight;
    // the other end, there: plugged in (while the cord is held there)
    if (this.arrived >= 0 && plan.portB && !this.plugged) {
      const b = 1 - plan.a;
      const [n0] = w.endNodes(plan.cable, b), port = w.rack.port(plan.portB);
      this.plugged = Math.hypot(x[3 * n0] - port.x, x[3 * n0 + 1] - port.y, x[3 * n0 + 2] - CONNECTOR) < 0.03 && port.plug < 0 && w.plug(plan.cable, b, plan.portB);
    }
    w.sim.setGoals(cb.start, this.pos, this.wt);
    if (weight <= 0) this.done = true;
    return this.done;
  }

  /** stops leading the cord where it is */
  cancel(): void {
    if (this.done) return;
    const cb = this.w.cables[this.plan.cable];
    this.w.sim.setGoals(cb.start, new Float64Array(3 * cb.count), new Float64Array(cb.count));
    this.done = true;
  }
}
