// Plugging a cord laid along a finger manager, headless, as a player does it:
// one end plugged in the switch below, the hand takes the other connector,
// brings the cord up the left of the rack, into the manager's channel by its
// left end, along the channel to below a free panel port, then plugs it in
// just above. Then: how many of the cord's nodes in the channel left it, and
// how fast the cord moved.
//   SEEDS=1,2 ROWS=1 PARAMS='{"keepK":8}' npm run plugin
declare const process: { env: Record<string, string | undefined> };
import { World } from '../src/game/world';
import { type LevelDef } from '../src/game/levels';
import { CONNECTOR } from '../src/game/rack';
import type { StaticCapsule } from '@drschizzo/avbd-cables';

/** closest distance between segments p0p1 and q0q1 */
function segSeg(p0: number[], p1: number[], q0: number[], q1: number[]): number {
  const d1 = [0, 1, 2].map((k) => p1[k] - p0[k]), d2 = [0, 1, 2].map((k) => q1[k] - q0[k]), r = [0, 1, 2].map((k) => p0[k] - q0[k]);
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  return Math.hypot(...[0, 1, 2].map((k) => p0[k] + d1[k] * s - q0[k] - d2[k] * t));
}

const params = JSON.parse(process.env.PARAMS ?? '{}');
const seeds = (process.env.SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
const SLACK = Number(process.env.SLACK ?? 0.8);
const X0 = Number(process.env.X0 ?? -0.34);
const B = { kind: 'blank' as const };
const bench = (seed: number): LevelDef => ({
  id: 'plugin', title: '', brief: '',
  units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B, B, B],
  cables: 4, wrong: 0, loose: 0, slack: [SLACK, SLACK + 0.2], mess: 1,
  labels: false, services: 1, types: ['CU'], colorByService: true,
  inventory: {}, preinstalled: [{ kind: 'hmgr', unit: 2, side: 0 }],
  seed, seg: 0.025,
});

const tot = { seated: 0, slip: 0, byEnd: 0, runs: 0, lost: 0, hit: 0, peak: 0, inG: 0 };
for (const seed of seeds) for (const c of [0, 1, 2, 3]) for (const port of ['A2', 'A4', 'A6']) {
  const w = new World(bench(seed));
  Object.assign(w.sim.P, params);
  w.preroll(60);
  const sim = w.sim, rack = w.rack;
  const room = rack.guides().find((g) => g.kind === 'hmgr')!.room;
  const cb = w.cables[c];
  const pa = rack.port(port);
  if (pa.plug >= 0) w.unplug(pa.plug >> 1, pa.plug & 1);
  // the end in the switch stays; the other comes out of the panel
  const e = cb.ends[0].port?.startsWith('S') ? 1 : 0;
  w.unplug(c, e);
  for (let f = 0; f < 60; f++) sim.step();
  const [n0, n1] = w.endNodes(c, e);
  sim.grab(n0);
  const t = [...sim.grabTarget];
  const yc = (room.min[1] + room.max[1]) / 2, zc = 0.035;
  const way = [[X0, yc - 0.25, 0.08], [X0, yc, zc], [pa.x, yc, zc], ...(process.env.UP ? [[pa.x, pa.y, CONNECTOR + Number(process.env.UP)]] : [])];
  for (const p of way) for (let f = 0; f < 400; f++) {
    const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-4) break;
    const k = Math.min(1, 0.008 / L);
    for (let i = 0; i < 3; i++) t[i] += d[i] * k;
    sim.grabTarget[0] = t[0]; sim.grabTarget[1] = t[1]; sim.grabTarget[2] = t[2];
    sim.step();
  }
  for (let f = 0; f < 30; f++) sim.step();
  /** where the cord, followed from the connector, first drops below the manager's bottom fingers (x), or null */
  const exitX = (): number | null => {
    const y = room.min[1] - 0.004, x = sim.x, dir = e === 0 ? 1 : -1;
    for (let i = n0 + dir; i >= cb.start && i < cb.start + cb.count; i += dir) {
      const j = i - dir;
      if (x[3 * i + 1] < y && x[3 * j + 1] >= y) { const t = (x[3 * j + 1] - y) / (x[3 * j + 1] - x[3 * i + 1]); return x[3 * j] + t * (x[3 * i] - x[3 * j]); }
    }
    return null;
  };
  const inside = (i: number) => sim.x[3 * i] >= room.min[0] - 0.003 && sim.x[3 * i] <= room.max[0] + 0.003 && sim.x[3 * i + 1] >= room.min[1] - 0.003 && sim.x[3 * i + 1] <= room.max[1] + 0.003 && sim.x[3 * i + 2] <= room.max[2] + 0.003;
  const was: number[] = [];
  for (let i = cb.start; i < cb.start + cb.count; i++) if (i !== n0 && i !== n1 && inside(i)) was.push(i);
  const exit0 = exitX();
  sim.release();
  if (process.env.MODE === 'freeze') { sim.pin(n0, sim.x[3 * n0], sim.x[3 * n0 + 1], sim.x[3 * n0 + 2]); sim.pin(n1, sim.x[3 * n1], sim.x[3 * n1 + 1], sim.x[3 * n1 + 2]); } else if (process.env.MODE !== 'release') w.plug(c, e, port);
  let peak = 0, pen = 0;
  const caps = rack.statics().filter((q): q is StaticCapsule => q.kind === 'capsule');
  for (let f = 0; f < 120; f++) {
    sim.step();
    for (let i = cb.start; i < cb.start + cb.count - 1; i++) {
      const p0 = [sim.x[3 * i], sim.x[3 * i + 1], sim.x[3 * i + 2]], p1 = [sim.x[3 * i + 3], sim.x[3 * i + 4], sim.x[3 * i + 5]];
      if (Math.min(p0[0], p1[0]) > -0.15) continue;
      for (const q of caps) pen = Math.max(pen, q.r + w.radius - segSeg(p0, p1, [q.ax, q.ay, q.az], [q.bx, q.by, q.bz]));
    }
    if (process.env.TRACE && (f < 14 || f % 10 === 0)) {
      const dir = e === 0 ? 1 : -1, ex = exitX();
      let k0 = -1;
      for (let i = n0; i >= cb.start && i < cb.start + cb.count; i += dir) if (sim.x[3 * i] < room.min[0] + 0.05) { k0 = i; break; }
      const nodes: string[] = [];
      for (let i = k0, m = 0; m < 4 && i >= cb.start && i < cb.start + cb.count; i += dir, m++) nodes.push(`${Math.abs(i - n0)}:${[0, 1, 2].map((d) => (sim.x[3 * i + d] * 1000).toFixed(0)).join(',')}`);
      console.log(`  f${f} exit ${ex?.toFixed(3)} n0 ${[0, 1, 2].map((d) => (sim.x[3 * n0 + d] * 1000).toFixed(0)).join(',')} | ${nodes.join('  ')}`);
    }
    for (let i = cb.start; i < cb.start + cb.count; i++) if (i !== n0 && i !== n1) peak = Math.max(peak, Math.hypot(sim.v[3 * i], sim.v[3 * i + 1], sim.v[3 * i + 2]));
  }
  const gone = was.filter((i) => !inside(i));
  const exit1 = exitX();
  const seated = sim.pinned[n0] && sim.pinned[n1];
  tot.seated += seated ? 1 : 0;
  // it came in by the end of the manager, and now goes out between two fingers
  const slipped = exit0 !== null && exit0 < room.min[0] && exit1 !== null && exit1 > room.min[0] + 0.004;
  tot.slip += slipped ? 1 : 0; tot.byEnd += exit0 !== null && exit0 < room.min[0] ? 1 : 0;
  if (process.env.ROWS) console.log(`seed ${seed} cable ${c} ${port}: in the channel ${was.length}, left it ${gone.length}${gone.length ? ' (' + gone.map((i) => `${Math.abs(i - n0)}@${sim.x[3 * i].toFixed(2)},${sim.x[3 * i + 1].toFixed(2)},${sim.x[3 * i + 2].toFixed(2)}`).join(' ') + ')' : ''}${seated ? '' : ` NOT SEATED at ${[0, 1, 2].map((d) => (sim.x[3 * n0 + d] * 1000).toFixed(0)).join(",")} port ${(pa.x * 1000).toFixed(0)},${(pa.y * 1000).toFixed(0)} (${(Math.hypot(sim.x[3 * n0] - pa.x, sim.x[3 * n0 + 1] - pa.y, sim.x[3 * n0 + 2] - CONNECTOR) * 1000).toFixed(1)} / ${(Math.hypot(sim.x[3 * n1] - pa.x, sim.x[3 * n1 + 1] - pa.y, sim.x[3 * n1 + 2] - CONNECTOR - w.seg) * 1000).toFixed(1)} mm)`}, exit ${exit0?.toFixed(3)} -> ${exit1?.toFixed(3)}${slipped ? ' SLIPPED' : ''}, into a finger ${(pen * 1000).toFixed(1)} mm, peak ${peak.toFixed(2)} m/s`);
  tot.runs++; tot.lost += gone.length; tot.hit += gone.length ? 1 : 0; tot.peak += peak; tot.inG += was.length;
}
const n = tot.runs || 1;
console.log(`${tot.runs} plugs, ${tot.byEnd} by the end of the manager, ${tot.slip} slipped between its fingers: ${(tot.inG / n).toFixed(1)} nodes in the channel, ${tot.lost} left it (in ${tot.hit} plugs), peak ${(tot.peak / n).toFixed(2)} m/s, seated ${tot.seated}`);
