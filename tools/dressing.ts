// Headless check of the before/after choreography: how much of the cords goes
// through the walls of the guides on their way into them, and back out
// (straight, as it was, against the way of showcase/dressing.ts).
//   npm run dressing -- [seeds] [pairs] [why [show <tag>]]
// why: where they go through (way down/up, leg, guide, shape, point, time); show: the first ones of a tag, in full
declare const process: { argv: string[] };
import { World } from '../src/game/world';
import { SHOWCASE_SETTLE, showcaseRack } from '../src/game/levels/showcaseRack';
import { tidyLayout } from '../src/game/idealRoutes';
import { CABLE_R } from '../src/game/rack';
import type { RackShape } from '../src/game/physics/rackCableSim';
import { along, clearOfGuides, dressingPath, paces, reversed, tidyShapes, type Knot, type Pace } from '../src/showcase/dressing';

const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
const pairs = Number(process.argv[3]) || undefined;
const smooth = (p: number) => p * p * (3 - 2 * p);
const H = 1 / 60;

/** the shapes by cells of the front of the rack (x, y), each in those its box covers */
const CELL = 0.02;
function grid(shapes: RackShape[]): Map<number, RackShape[]> {
  const cells = new Map<number, RackShape[]>();
  for (const s of shapes) {
    const [x0, x1, y0, y1] = s.kind === 'capsule'
      ? [Math.min(s.ax, s.bx) - s.r, Math.max(s.ax, s.bx) + s.r, Math.min(s.ay, s.by) - s.r, Math.max(s.ay, s.by) + s.r]
      : s.kind === 'box' ? [s.min[0], s.max[0], s.min[1], s.max[1]] : [0, -1, 0, -1];
    for (let i = Math.floor((x0 - CABLE_R) / CELL); i <= Math.floor((x1 + CABLE_R) / CELL); i++) {
      for (let j = Math.floor((y0 - CABLE_R) / CELL); j <= Math.floor((y1 + CABLE_R) / CELL); j++) {
        const k = key(i, j);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k)!.push(s);
      }
    }
  }
  return cells;
}
let hit: RackShape | null = null;
const key = (i: number, j: number) => (i + 1000) * 4000 + (j + 1000);

/** how deep point (x, y, z) is in the walls of the guides, out of the rack by g (0: not in them) */
function depth(cells: Map<number, RackShape[]>, g: number, x: number, y: number, z: number): number {
  let worst = 0;
  for (const s of cells.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) {
    if (s.kind === 'capsule') {
      const ax = s.ax, ay = s.ay, az = s.az * g, bx = s.bx - ax, by = s.by - ay, bz = s.bz * g - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / Math.max(1e-12, bx * bx + by * by + bz * bz)));
      const d = Math.hypot(x - ax - bx * t, y - ay - by * t, z - az - bz * t);
      if (s.r + CABLE_R - d > worst) { worst = s.r + CABLE_R - d; hit = s; }
    } else if (s.kind === 'box') {
      const lo = [s.min[0], s.min[1], s.min[2] * g], hi = [s.max[0], s.max[1], s.max[2] * g];
      const p = [x, y, z];
      let inside = Infinity;
      for (let d = 0; d < 3; d++) inside = Math.min(inside, p[d] - lo[d] + CABLE_R, hi[d] + CABLE_R - p[d]);
      if (inside > worst) { worst = inside; hit = s; }
    }
  }
  return worst;
}

interface Leg extends Pace { path: Knot[]; order: number[]; stagger: number; dur: number; t0: number }

const e = new Float64Array(4096), bow = new Float64Array(4096);
/** where the nodes of the cords are at time t of a leg (the targets of their springs) */
function shape(m: World, leg: Leg, t: number, out: Float64Array): void {
  m.cables.forEach((cb, c) => {
    const u = Math.max(0, (t - leg.t0 - leg.order.indexOf(c) * leg.stagger) / leg.dur);
    paces(cb.count, u, leg, e, bow);
    for (let k = 0; k < cb.count; k++) {
      const i = 3 * (cb.start + k);
      for (let d = 0; d < 3; d++) out[i + d] = along(leg.path, i + d, e[k]) + (d === 2 ? bow[k] : 0);
    }
  });
}

let recording = false, shown = 0;
const why = new Map<string, number>();
const total = { old: [0, 0], now: [0, 0] };
for (const seed of seeds) {
  const m = new World(showcaseRack('mess', seed, pairs));
  Object.assign(m.sim.P, SHOWCASE_SETTLE.solver);
  for (let f = 0; f < SHOWCASE_SETTLE.frames; f++) m.sim.step();
  const fell = Float64Array.from(m.sim.x);
  const tidyLevel = showcaseRack('tidy', seed, pairs);
  const tw = new World(tidyLevel, tidyLayout(tidyLevel).starts);
  const rack = tw.rack;
  const shapes = grid(rack.items.flatMap((it) => rack.itemShapes(it)).filter((s) => s.kind !== 'keeper'));
  const tidy = tidyShapes(m, tidyLayout(tidyLevel).paths);
  const mess = clearOfGuides(rack, m.cables, fell);
  const dressing = dressingPath(rack, mess, tidy);
  const all = m.cables.map((_, c) => c);
  const up = all.slice().sort((p, q) => {
    const a = rack.port(tw.circuits[p].a), b = rack.port(tw.circuits[q].a);
    return a.unit - b.unit || a.x - b.x;
  });
  const down = all.slice().reverse();
  const inCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const tidyLeg = (path: Knot[], t0: number): Leg => ({ path, order: up, stagger: 2.8 / up.length, dur: 1.2, wave: 0.5, lag: (s) => s, ease: inCubic, lift: 0.07, t0, asOne: path.length > 2 ? { from: path[1].at } : undefined });
  const messLeg = (path: Knot[]): Leg => ({ path, order: down, stagger: 1.2 / down.length, dur: 0.9, wave: 0.35, lag: (s) => Math.abs(2 * s - 1), ease: (p) => p * p, lift: 0.03, t0: 0, asOne: path.length > 2 ? { until: path[path.length - 2].at } : undefined });
  // the points already in a wall where they come to rest are not the way's fault
  const n = m.sim.n;
  const atRest = new Uint8Array(2 * n);
  const sample = (x: Float64Array, i: number, half: boolean) => (half ? [0, 1, 2].map((d) => (x[3 * i + d] + x[3 * i + 3 + d]) / 2) : [x[3 * i], x[3 * i + 1], x[3 * i + 2]]) as [number, number, number];
  const points = (x: Float64Array, f: (j: number, p: [number, number, number]) => void) => {
    for (const cb of m.cables) for (let k = 0; k < cb.count; k++) {
      f(2 * (cb.start + k), sample(x, cb.start + k, false));
      if (k < cb.count - 1) f(2 * (cb.start + k) + 1, sample(x, cb.start + k, true));
    }
  };
  points(tidy, (j, p) => { if (depth(shapes, 1, ...p) > 0) atRest[j] = 1; });
  points(fell, (j, p) => { if (depth(shapes, 1, ...p) > 0) atRest[j] = 1; });
  points(mess, (j, p) => { if (depth(shapes, 1, ...p) > 0) atRest[j] = 1; });
  /** frames × points in a wall, and the deepest (mm), over legs played one after the other with the guides out by grow(t) */
  const play = (way: string, legs: Leg[], end: number, grow: (t: number) => number) => {
    const x = Float64Array.from(legs[0].path[0].x);
    let count = 0, deepest = 0;
    for (let t = 0; t <= end; t += H) {
      const leg = legs.filter((l) => l.t0 <= t).at(-1) ?? legs[0];
      shape(m, leg, t, x);
      const g = grow(t);
      if (g <= 0) continue;
      points(x, (j, p) => {
        if (atRest[j]) return;
        const d = depth(shapes, g, ...p);
        if (d > 0.0005) {
          count++; deepest = Math.max(deepest, d);
          const it = rack.items.find((q) => q.id === (hit as { owner?: number }).owner);
          const tag = `${way}${legs.indexOf(leg)} ${it?.kind} ${hit!.kind} ${j % 2 ? 'mid' : 'node'} t=${(Math.round(t * 5) / 5).toFixed(1)}`;
          if (recording) why.set(tag, (why.get(tag) ?? 0) + 1);
          if (recording && process.argv.includes('show') && tag.startsWith(process.argv.at(-1)!) && shown++ < 12) {
            const node = j >> 1, cb = m.cables.find((q) => node >= q.start && node < q.start + q.count)!;
            const r3 = (a: Float64Array) => [0, 1, 2].map((d) => a[3 * node + d].toFixed(3)).join(',');
            console.log(tag, `cord ${m.cables.indexOf(cb)} k ${node - cb.start}/${cb.count} p ${p.map((v) => v.toFixed(3))} d ${(d * 1000).toFixed(1)}mm hit ${JSON.stringify(hit)}`);
            console.log('   from', r3(mess), 'path', leg.path.map((k) => r3(k.x)).join(' | '));
          }
        }
      });
    }
    return [count, deepest * 1000];
  };
  const upEnd = 0.35 + 2.8 + 1.2 + 0.6, downEnd = 1.2 + 0.9 + 0.6;
  const oldUp = play('was up', [tidyLeg([{ x: fell, at: 0 }, { x: tidy, at: 1 }], 0)], upEnd, () => 1);
  const oldDown = play('was down', [messLeg([{ x: tidy, at: 0 }, { x: fell, at: 1 }])], downEnd, () => 1);
  recording = true;
  const nowUp = play('up', [tidyLeg(dressing, 0.15)], upEnd, (t) => smooth(Math.min(1, t / 0.45)));
  const nowDown = play('down', [messLeg(reversed(dressing))], downEnd + 0.45, (t) => (t < downEnd ? 1 : smooth(Math.max(0, 1 - (t - downEnd) / 0.45))));
  recording = false;
  const f = (r: number[]) => `${r[0]} pts·frames, ${r[1].toFixed(1)} mm`;
  console.log(`seed ${seed}: ${m.cables.length} cords | tidy up: was ${f(oldUp)}, now ${f(nowUp)} | mess up: was ${f(oldDown)}, now ${f(nowDown)}`);
  total.old[0] += oldUp[0] + oldDown[0];
  total.now[0] += nowUp[0] + nowDown[0];
}
if (process.argv.includes('why')) console.log([...why].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${v} ${k}`).join('\n'));
console.log(`all: was ${total.old[0]}, now ${total.now[0]} points·frames in a wall`);
