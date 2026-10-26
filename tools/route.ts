// Laying cords along a drawn route, headless (src/game/route.ts): a cord
// plugged in its panel port, its other end hanging, routed through the
// manager below the panel, two rings (or a duct) down the side channel and
// the manager above the switch, into its switch port. Then: whether it got
// there and plugged in, how much of it lies in its guides once let go and
// settled, how calm it is, and the worst it went into a part of the cabinet
// (a cord must never pass through anything).
//   SEEDS=1,2 SLACK=0.5 ROWS=1 VIA=duct PARAMS='{"goalK":2}' npm run route
declare const process: { env: Record<string, string | undefined> };
import { World } from '../src/game/world';
import { type LevelDef } from '../src/game/levels';
import { planRoute, RouteRun } from '../src/game/route';
import type { Guide } from '../src/game/rack';
import type { StaticCapsule } from '../src/physics/cableSim';

const params = JSON.parse(process.env.PARAMS ?? '{}');
const seeds = (process.env.SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
/** extra length of the cords over their ideal route (m) */
const slack = Number(process.env.SLACK ?? 0.3);
const via = process.env.VIA ?? 'rings';
const B = { kind: 'blank' as const };
const bench = (seed: number): LevelDef => ({
  id: 'route', title: '', brief: '',
  units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
  cables: 4, wrong: 0, loose: 0, slack: [slack, slack + 0.1], mess: 1,
  labels: false, services: 1, types: ['CU'], colorByService: true,
  inventory: {},
  preinstalled: via === 'duct'
    ? [{ kind: 'hmgr', unit: 2, side: 0 }, { kind: 'hmgr', unit: 7, side: 0 }, { kind: 'duct', unit: 4, side: 1 }]
    : [{ kind: 'hmgr', unit: 2, side: 0 }, { kind: 'hmgr', unit: 7, side: 0 }, { kind: 'vring', unit: 3, side: 1 }, { kind: 'vring', unit: 5, side: 1 }],
  seed, seg: 0.025,
});

function inside(b: Guide['room'], x: ArrayLike<number>, i: number): boolean {
  for (let d = 0; d < 3; d++) if (x[3 * i + d] < b.min[d] - 0.003 || x[3 * i + d] > b.max[d] + 0.003) return false;
  return true;
}

let where = '', deepest = 0;
/** the deepest a node of cable c is into a part of the cabinet (m) */
function worstPen(w: World, c: number): number {
  const S = w.rack.statics().filter((s): s is StaticCapsule => s.kind === 'capsule');
  const cb = w.cables[c], x = w.sim.x;
  let worst = 0;
  for (let i = cb.start; i < cb.start + cb.count; i++) {
    const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2];
    for (const s of S) {
      const ax = s.bx - s.ax, ay = s.by - s.ay, az = s.bz - s.az;
      const L2 = ax * ax + ay * ay + az * az;
      let t = L2 > 0 ? ((px - s.ax) * ax + (py - s.ay) * ay + (pz - s.az) * az) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(px - s.ax - ax * t, py - s.ay - ay * t, pz - s.az - az * t);
      const o = s.r + w.radius - d;
      if (o > worst) worst = o;
      if (o > deepest) { deepest = o; where = `node ${i - cb.start} at (${[px, py, pz].map((v) => v.toFixed(3)).join(',')}) capsule (${[s.ax, s.ay, s.az].map((v) => v.toFixed(3)).join(',')})→(${[s.bx, s.by, s.bz].map((v) => v.toFixed(3)).join(',')})`; }
    }
  }
  return worst;
}

const tot = { penRest: 0, through: 0, guides: 0, runs: 0, planned: 0, plugged: 0, inGuides: 0, pen: 0, penMax: 0, calm: 0, ms: 0 };
for (const seed of seeds) for (const c of [0, 1, 2, 3]) {
  const w = new World(bench(seed));
  Object.assign(w.sim.P, params);
  w.preroll(60);
  const sim = w.sim, rack = w.rack, guides = rack.guides();
  const cb = w.cables[c];
  const pa = rack.port(w.circuits[c].a), pb = rack.port(w.circuits[c].b);
  // plugged in its panel port, the other end hanging
  w.unplug(c, 1);
  if (cb.ends[0].port !== pa.id) { w.unplug(c, 0); w.plug(c, 0, pa.id); }
  settleFor(w, 60);
  const mgrs = guides.filter((g) => g.kind === 'hmgr');
  const side = guides.filter((g) => g.kind !== 'hmgr').sort((p, q) => q.room.max[1] - p.room.max[1]);
  const order = [mgrs[0], ...side, mgrs[1]];
  const res = planRoute(w, c, order, pb);
  tot.runs++;
  if ('error' in res) {
    if (process.env.ROWS) console.log(`seed ${seed} cable ${c}: ${res.error}`);
    continue;
  }
  tot.planned++;
  const run = new RouteRun(w, res.plan);
  let pen = 0, ms = 0;
  where = ''; deepest = 0;
  let lagged = '';
  for (let f = 0; f < 600 && !run.step(1 / 60); f++) {
    sim.step(); ms += sim.stats.ms; pen = Math.max(pen, worstPen(w, c));
    if (process.env.LAG && run.t >= run.duration && !lagged) {
      const errs: string[] = [];
      for (let k = 0; k < cb.count; k++) { const i = cb.start + k; if (sim.goalW[i] <= 0) continue; const e = Math.hypot(sim.x[3 * i] - sim.goal[3 * i], sim.x[3 * i + 1] - sim.goal[3 * i + 1], sim.x[3 * i + 2] - sim.goal[3 * i + 2]); if (e > 0.02) errs.push(`${k}:${(e * 100).toFixed(0)}cm@(${[0, 1, 2].map((d) => sim.goal[3 * i + d].toFixed(3)).join(',')})`); }
      lagged = errs.join(' ') || 'none';
      console.log('   lag at the end:', lagged, '| in guides', nodesIn(w, c, order).join(' '));
    }
  }
  for (let f = 0; f < 180; f++) { sim.step(); pen = Math.max(pen, worstPen(w, c)); }
  const penRest = worstPen(w, c);
  tot.penRest = Math.max(tot.penRest, penRest);
  const plugged = cb.ends[1].port === pb.id;
  if (process.env.LAG && !plugged) { const [n0] = w.endNodes(c, 1); console.log('   connector', [0, 1, 2].map((d) => sim.x[3 * n0 + d].toFixed(3)).join(','), 'port', pb.x.toFixed(3), pb.y.toFixed(3), 'plug', pb.plug, 'run.plugged', run.plugged, 'goalW', sim.goalW[n0]); }
  let inG = 0;
  for (let i = cb.start; i < cb.start + cb.count; i++) if (order.some((g) => inside(g.room, sim.x, i))) inG++;
  let peak = 0;
  for (let f = 0; f < 30; f++) {
    sim.step();
    for (let i = cb.start; i < cb.start + cb.count; i++) peak = Math.max(peak, Math.hypot(sim.v[3 * i], sim.v[3 * i + 1], sim.v[3 * i + 2]));
  }
  const kept = nodesIn(w, c, order);
  const through = kept.filter((k) => k > 0).length;
  if (process.env.WHERE) console.log('   deepest:', where);
  if (process.env.ROWS) console.log(`seed ${seed} cable ${c}: ${plugged ? 'plugged' : 'NOT PLUGGED'}, slack ${(res.plan.slack * 100).toFixed(0)} cm, through ${through}/${order.length} guides (nodes ${kept.join(' ')}), worst into a part ${(pen * 1000).toFixed(1)} mm, peak at rest ${peak.toFixed(3)} m/s, ${run.duration.toFixed(1)} s`);
  tot.plugged += plugged ? 1 : 0; tot.through += through; tot.guides += order.length; tot.inGuides += inG / cb.count; tot.pen += pen; tot.penMax = Math.max(tot.penMax, pen); tot.calm += peak; tot.ms += ms;
}
const n = tot.planned || 1;
console.log(`${tot.runs} routes (${via}), ${tot.planned} planned: plugged ${tot.plugged}/${tot.planned}, through ${tot.through}/${tot.guides} guides, cord in them ${(100 * tot.inGuides / n).toFixed(0)} %, into a part mean ${(tot.pen / n * 1000).toFixed(1)} mm worst ${(tot.penMax * 1000).toFixed(1)} mm (at rest ${(tot.penRest * 1000).toFixed(1)} mm), peak at rest ${(tot.calm / n).toFixed(3)} m/s`);

function settleFor(w: World, f: number): void { for (let k = 0; k < f; k++) w.sim.step(); }

/** nodes of cable c in each guide (a ring: where the cord passes through it inside, between two nodes) */
function nodesIn(w: World, c: number, order: Guide[]): number[] {
  const sim = w.sim, cb = w.cables[c];
  return order.map((g) => {
    let n = 0;
    for (let i = cb.start; i < cb.start + cb.count; i++) if (inside(g.room, sim.x, i)) n++;
    if (g.kind === 'vring') {
      const y = (g.room.min[1] + g.room.max[1]) / 2, x = sim.x;
      for (let i = cb.start; i < cb.start + cb.count - 1; i++) {
        const y0 = x[3 * i + 1], y1 = x[3 * i + 4];
        if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
        const t = (y - y0) / (y1 - y0);
        const px = x[3 * i] + t * (x[3 * i + 3] - x[3 * i]), pz = x[3 * i + 2] + t * (x[3 * i + 5] - x[3 * i + 2]);
        if (px >= g.room.min[0] - 0.003 && px <= g.room.max[0] + 0.003 && pz >= g.room.min[2] - 0.003 && pz <= g.room.max[2] + 0.003) n++;
      }
    }
    return n;
  });
}
