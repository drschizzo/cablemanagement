// Letting go of a cord laid along a horizontal finger manager, headless: how
// much it springs back. The hand lays the cord near its panel port, sweeps it
// along the fingers, holds it, lets go; then the cord's peak speed, its peak
// upward speed and its kinetic energy over the next half second.
//   SEEDS=1,2 ROWS=1 PARAMS='{"keepK":8}' npm run release
import { World } from '../src/game/world';
import type { LevelDef } from '../src/game/levels/levelDef';
import { env, envParams, envSeeds } from './env';

const params = envParams();
const seeds = envSeeds('1,2,3,4,5');
const B = { kind: 'blank' as const };
const bench = (seed: number): LevelDef => ({
  id: 'release', title: '', brief: '',
  units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
  cables: 4, wrong: 0, loose: 0, slack: [0.5, 0.7], mess: 1,
  labels: false, services: 1, types: ['CU'], colorByService: true,
  inventory: {}, preinstalled: [{ kind: 'fingerManager', unit: 2, side: 0 }, { kind: 'duct', unit: 3, side: 1 }, { kind: 'duct', unit: 7, side: 1 }],
  seed, seg: 0.025,
});

const tot = { peak: 0, up: 0, ke: 0, kept: 0, after: 0, n: 0 };
for (const seed of seeds) for (const c of [0, 1, 2, 3]) for (const off of [15, 22]) for (const sweep of [0.2, 0.35]) {
  const w = new World(bench(seed));
  Object.assign(w.sim.P, params);
  w.preroll(90);
  const sim = w.sim;
  const cb = w.cables[c];
  const node = cb.start + off;
  const y = w.rack.unitY(2);
  const px = w.rack.port(cb.ends[0].port!).x;
  const dir = px < 0 ? 1 : -1;
  sim.grab(node);
  const t = [...sim.grabTarget];
  for (const p of [[px, y + 0.004, 0.04], [px + dir * sweep, y + 0.004, 0.04]]) {
    for (let f = 0; f < 200; f++) {
      const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
      const L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-4) break;
      const k = Math.min(1, 0.03 / L);
      for (let i = 0; i < 3; i++) t[i] += d[i] * k;
      sim.grabTarget[0] = t[0]; sim.grabTarget[1] = t[1]; sim.grabTarget[2] = t[2];
      sim.step();
    }
  }
  for (let f = 0; f < 30; f++) sim.step();
  const kept = () => { let n = 0; for (let i = cb.start; i < cb.start + cb.count; i++) if (sim.keepOf[i] >= 0) n++; return n; };
  const atRelease = kept();
  sim.release();
  let peak = 0, up = 0, ke = 0;
  for (let f = 0; f < 90; f++) {
    sim.step();
    for (let i = cb.start; i < cb.start + cb.count; i++) {
      const vx = sim.v[3 * i], vy = sim.v[3 * i + 1], vz = sim.v[3 * i + 2];
      const s2 = vx * vx + vy * vy + vz * vz;
      peak = Math.max(peak, Math.sqrt(s2)); up = Math.max(up, vy);
      if (f < 30) ke += sim.mass[i] * s2 / 2;
    }
  }
  const after = kept();
  if (env.ROWS) console.log(`seed ${seed} cable ${c} node ${off} sweep ${sweep}: kept ${atRelease} -> ${after}, peak ${peak.toFixed(2)} m/s, up ${up.toFixed(2)} m/s, energy ${(ke * 1000).toFixed(1)} mJ·frame`);
  tot.peak += peak; tot.up += up; tot.ke += ke; tot.kept += atRelease; tot.after += after; tot.n++;
}
const n = tot.n;
console.log(`mean over ${n} releases: peak ${(tot.peak / n).toFixed(2)} m/s, up ${(tot.up / n).toFixed(2)} m/s, energy ${(tot.ke / n * 1000).toFixed(1)} mJ·frame, nodes kept ${(tot.kept / n).toFixed(1)} at release -> ${(tot.after / n).toFixed(1)} after`);
