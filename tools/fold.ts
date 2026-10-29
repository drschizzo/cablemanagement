// A cord laid along a horizontal finger manager, headless: does a part of it
// far along the chain from the stretch in hand end up in the channel? After
// laying and after letting go: the runs of kept nodes, and the nodes inside
// the channel that are not in the run around the hand, and that were not
// already lying there before the hand took the cord.
//   SEEDS=1,2 ROWS=1 npm run fold
import { World } from '../src/game/world';
import type { LevelDef } from '../src/game/levels/levelDef';
import { env, envParams, envSeeds } from './env';

const params = envParams();
const seeds = envSeeds('1,2,3,4,5');
const B = { kind: 'blank' as const };
const bench = (seed: number): LevelDef => ({
  id: 'fold', title: '', brief: '',
  units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
  cables: 4, wrong: 0, loose: 0, slack: [1.2, 1.6], mess: 1,
  labels: false, services: 1, types: ['CU'], colorByService: true,
  inventory: {}, preinstalled: [{ kind: 'fingerManager', unit: 2, side: 0 }],
  seed, seg: 0.025,
});

let lying = 0, n = 0, foldedHeld = 0, foldedAfter = 0;
for (const seed of seeds) for (const c of [0, 1, 2, 3]) for (const off of [12, 25]) for (const sweep of [0.2, 0.35]) {
  const w = new World(bench(seed));
  Object.assign(w.sim.P, params);
  w.preroll(90);
  const sim = w.sim;
  const cb = w.cables[c];
  const node = cb.start + off;
  const y = w.rack.unitY(2);
  const px = w.rack.port(cb.ends[0].port!).x;
  const dir = px < 0 ? 1 : -1;
  const k = w.rack.statics().find((x) => x.kind === 'keeper')!;
  const inChannel = (x: Float32Array | Float64Array): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = cb.start; i < cb.start + cb.count; i++) {
      const p = [x[3 * i], x[3 * i + 1], x[3 * i + 2]];
      if (!(p[0] >= k.min[0] && p[0] <= k.max[0] && p[1] >= k.min[1] - 0.004 && p[1] <= k.max[1] && p[2] >= k.min[2] && p[2] <= k.max[2])) continue;
      const last = out[out.length - 1];
      if (last && last[1] >= i - cb.start - 7) last[1] = i - cb.start; else out.push([i - cb.start, i - cb.start]);
    }
    return out;
  };
  const x0 = sim.x.slice();
  sim.grab(node);
  const t = [...sim.grabTarget];
  const path = [[px, y + 0.03, 0.08], [px, y + 0.004, 0.04], [px + dir * sweep, y + 0.004, 0.04], [px + dir * sweep * 0.3, y + 0.004, 0.04], [px + dir * sweep, y + 0.004, 0.04]];
  for (const p of path) {
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
  // runs of kept nodes, and how far the furthest one is from the run with the hand
  const runs = () => {
    const out: [number, number][] = [];
    for (let i = cb.start; i < cb.start + cb.count; i++) {
      if (sim.keepOf[i] < 0) continue;
      const last = out[out.length - 1];
      if (last && last[1] >= i - 7) last[1] = i; else out.push([i, i]);
    }
    return out.map(([a, b]) => [a - cb.start, b - cb.start] as [number, number]);
  };
  const stray = (rs: [number, number][], g: number) => rs.filter(([a, b]) => !(a - 12 <= g && g <= b + 12)).reduce((s, [a, b]) => s + b - a + 1, 0);
  const r1 = runs();
  const s1 = stray(r1, off);
  sim.release();
  for (let f = 0; f < 90; f++) sim.step();
  const r2 = runs();
  const before = inChannel(x0);
  const s2 = stray(r2, off);
  const inside = inChannel(sim.x);
  // far from the hand, and not already lying there in the starting mess
  const there = (i: number) => before.some(([a, b]) => a <= i && i <= b);
  const s3 = stray(inside, off) && inside
    .filter(([a, b]) => !(a - 12 <= off && off <= b + 12))
    .reduce((t, [a, b]) => { for (let i = a; i <= b; i++) if (!there(i)) t++; return t; }, 0);
  if (s3) lying++;
  n++; if (s1) foldedHeld++; if (s2) foldedAfter++;
  if (env.ROWS) console.log(`seed ${seed} cable ${c} node ${off}/${cb.count} sweep ${sweep}: held ${JSON.stringify(r1)} stray ${s1} | let go ${JSON.stringify(r2)} stray ${s2} | in channel before ${JSON.stringify(before)} after ${JSON.stringify(inside)} stray ${s3}`);
}
console.log(`${n} lays: a part far from the hand kept in the channel in ${foldedHeld} while held, ${foldedAfter} after letting go; far nodes come to lie in it in ${lying}`);
