// Plugging a cord laid through its guides, headless: the cord is plugged in
// its panel port and laid (route) through the manager below the panel, a
// duct and the manager above the switch, its other end left free. The hand
// takes that connector, brings it in front of its switch port (a little off,
// as the pointer is) and lets go there: it plugs in. Then: how many of the
// cord's nodes left the guides it was in, and how fast the cord moved.
//   SEEDS=1,2 SLACK=0.1 ROWS=1 PARAMS='{"kCap":2}' npm run plug (MODE=freeze: pinned where let go, not plugged)
import { World } from '../src/game/world';
import type { LevelDef } from '../src/game/levels/levelDef';
import { planRoute, RouteRun } from '../src/game/routeLaying';
import { CONNECTOR, type Guide } from '../src/game/rack';
import { env, envNumber, envParams, envSeeds } from './env';

const params = envParams();
const seeds = envSeeds('1,2,3,4,5,6,7,8');
/** extra length of the cords over their ideal route (m) */
const SLACK = envNumber('SLACK', 0.3);
const B = { kind: 'blank' as const };
const bench = (seed: number): LevelDef => ({
  id: 'plug', kind: 'bench',
  units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
  cables: 4, wrong: 0, loose: 0, slack: [SLACK, SLACK + 0.1], mess: 1,
  labels: false, services: 1, types: ['CU'], colorByService: true,
  inventory: {},
  preinstalled: [{ kind: 'fingerManager', unit: 2, side: 0 }, { kind: 'fingerManager', unit: 7, side: 0 }, { kind: 'duct', unit: 4, side: 1 }],
  seed, seg: 0.025,
});

function inside(b: Guide['room'], x: ArrayLike<number>, i: number): boolean {
  for (let d = 0; d < 3; d++) if (x[3 * i + d] < b.min[d] - 0.003 || x[3 * i + d] > b.max[d] + 0.003) return false;
  return true;
}

const tot = { seated: 0, runs: 0, lost: 0, hit: 0, peak: 0, jump: 0 };
// where the hand lets go, from the port: in front of it, and a little off
const offs: [number, number, number][] = [[0, 0, 0.03], [0.012, -0.01, 0.06], [-0.01, 0.008, 0.1], [0.01, 0.02, 0.2]];
for (const seed of seeds) for (const c of [0, 1, 2, 3]) for (const off of offs) {
  const w = new World(bench(seed));
  Object.assign(w.sim.P, params);
  w.preroll(60);
  const sim = w.sim, rack = w.rack, guides = rack.guides();
  const cb = w.cables[c];
  const pa = rack.port(w.circuits[c].a), pb = rack.port(w.circuits[c].b);
  w.unplug(c, 1);
  if (cb.ends[0].port !== pa.id) { w.unplug(c, 0); w.plug(c, 0, pa.id); }
  for (let f = 0; f < 60; f++) sim.step();
  const mgrs = guides.filter((g) => g.kind === 'fingerManager');
  const side = guides.filter((g) => g.kind !== 'fingerManager');
  const order = [mgrs[0], ...side, mgrs[1]];
  const res = planRoute(w, c, order, null);
  if ('error' in res) continue;
  const run = new RouteRun(w, res.plan);
  for (let f = 0; f < 600 && !run.step(1 / 60); f++) sim.step();
  for (let f = 0; f < 60; f++) sim.step();
  // the hand takes the free connector and brings it in front of the port
  const [n0] = w.endNodes(c, 1);
  sim.grab(n0);
  const t = [...sim.grabTarget];
  const goal = [pb.x + off[0], pb.y + off[1], CONNECTOR + off[2]];
  for (let f = 0; f < 300; f++) {
    const d = [goal[0] - t[0], goal[1] - t[1], goal[2] - t[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-4) break;
    const k = Math.min(1, 0.008 / L);
    for (let i = 0; i < 3; i++) t[i] += d[i] * k;
    sim.grabTarget[0] = t[0]; sim.grabTarget[1] = t[1]; sim.grabTarget[2] = t[2];
    sim.step();
  }
  for (let f = 0; f < 30; f++) sim.step();
  const was = Uint8Array.from({ length: cb.count }, (_, k) => order.findIndex((g) => inside(g.room, sim.x, cb.start + k)) + 1);
  const x0 = Float64Array.from(sim.x);
  const lag = Math.hypot(sim.x[3 * n0] - goal[0], sim.x[3 * n0 + 1] - goal[1], sim.x[3 * n0 + 2] - goal[2]);
  if (env.MODE === 'hand') { sim.grabTarget[0] = pb.x; sim.grabTarget[1] = pb.y; sim.grabTarget[2] = CONNECTOR; } else sim.release();
  if (env.MODE === 'hand') { /* the hand pushes it in, no pin */ }
  else if (env.MODE === 'freeze') { const e = cb.start + cb.count - 1; sim.pin(e, sim.x[3 * e], sim.x[3 * e + 1], sim.x[3 * e + 2]); sim.pin(e - 1, sim.x[3 * e - 3], sim.x[3 * e - 2], sim.x[3 * e - 1]); }
  else if (env.MODE !== 'release') w.plug(c, 1, pb.id);
  let peak = 0, seated = -1;
  const timeline: string[] = [];
  for (let f = 0; f < 120; f++) {
    sim.step();
    if (seated < 0 && sim.pinned[cb.start + cb.count - 1]) seated = f;
    if (env.WHEN && [3, 6, 10, 20, 40, 80, 119].includes(f)) {
      let l = 0;
      for (let k = 0; k < cb.count; k++) if (was[k] && !inside(order[was[k] - 1].room, sim.x, cb.start + k)) l++;
      timeline.push(`f${f}:${l}`);
    }
    let fp = 0, fk = -1;
    for (let i = cb.start + 2; i < cb.start + cb.count - 2; i++) { const s = Math.hypot(sim.v[3 * i], sim.v[3 * i + 1], sim.v[3 * i + 2]); if (s > fp) { fp = s; fk = i - cb.start; } }
    peak = Math.max(peak, fp);
    if (env.TRACE && f < 30) { const e = cb.start + cb.count - 1; console.log(`  f${f} peak ${fp.toFixed(2)} @${fk}/${cb.count}  n0 ${[0, 1, 2].map((d) => sim.x[3 * e + d].toFixed(3))} n1 ${[0, 1, 2].map((d) => sim.x[3 * e - 3 + d].toFixed(3))}`); }
  }
  let lost = 0, jump = 0;
  for (let k = 0; k < cb.count; k++) {
    const i = cb.start + k;
    if (was[k] && !inside(order[was[k] - 1].room, sim.x, i)) {
      lost++;
      if (env.WHERE) console.log(`   node ${k}/${cb.count} left guide ${was[k] - 1}: (${[0, 1, 2].map((d) => x0[3 * i + d].toFixed(3))}) -> (${[0, 1, 2].map((d) => sim.x[3 * i + d].toFixed(3))}), port (${pb.x.toFixed(3)},${pb.y.toFixed(3)}) room ${order[was[k] - 1].room.min.map((v) => v.toFixed(3))} / ${order[was[k] - 1].room.max.map((v) => v.toFixed(3))}`);
    }
    if (k > 2 && k < cb.count - 3) jump = Math.max(jump, Math.hypot(sim.x[3 * i] - x0[3 * i], sim.x[3 * i + 1] - x0[3 * i + 1], sim.x[3 * i + 2] - x0[3 * i + 2]));
  }
  const inG = was.reduce((s, v) => s + (v ? 1 : 0), 0);
  if (env.ROWS) console.log(`seed ${seed} cable ${c} off ${off.map((v) => v * 100).join(',')} cm: lag ${(lag * 100).toFixed(1)} cm, in guides ${inG}, left them ${lost}, peak ${peak.toFixed(2)} m/s, moved ${(jump * 100).toFixed(1)} cm, seated at frame ${seated} (off ${(Math.hypot(sim.x[3 * n0] - pb.x, sim.x[3 * n0 + 1] - pb.y, sim.x[3 * n0 + 2] - CONNECTOR) * 1000).toFixed(1)} / ${(Math.hypot(sim.x[3 * n0 - 3] - pb.x, sim.x[3 * n0 - 2] - pb.y, sim.x[3 * n0 - 1] - CONNECTOR - w.seg) * 1000).toFixed(1)} mm) ${timeline.join(' ')}`);
  tot.seated += seated >= 0 ? 1 : 0;
  tot.runs++; tot.lost += lost; tot.hit += lost > 0 ? 1 : 0; tot.peak += peak; tot.jump += jump;
}
const n = tot.runs || 1;
console.log(`${tot.runs} plugs: nodes out of their guide ${tot.lost} (in ${tot.hit} plugs), peak ${(tot.peak / n).toFixed(2)} m/s, moved ${(tot.jump / n * 100).toFixed(1)} cm, seated ${tot.seated}`);
