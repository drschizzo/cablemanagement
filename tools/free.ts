// Free play with many cords, headless: how long the cabinet takes to settle,
// and how erratic the other cords get while the hand drags one through them.
//   NC=48 SEEDS=1,2,3 PARAMS='{"kCapCable":2}' npm run free
declare const process: { env: Record<string, string | undefined> };
import { World } from '../src/game/world';
import { freeLevel } from '../src/game/levels';

const NC = Number(process.env.NC ?? 48);
const seeds = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
const params = JSON.parse(process.env.PARAMS ?? '{}');

/** speed of node i (m/s) */
const speed = (w: World, i: number) => Math.hypot(w.sim.v[3 * i], w.sim.v[3 * i + 1], w.sim.v[3 * i + 2]);

/** relative stretch of the worst segment */
function stretchMax(w: World): number {
  let m = 0;
  const x = w.sim.x;
  for (let i = 0; i < w.sim.n; i++) {
    if (!w.sim.segOK[i]) continue;
    const d = Math.hypot(x[3 * i] - x[3 * i + 3], x[3 * i + 1] - x[3 * i + 4], x[3 * i + 2] - x[3 * i + 5]);
    m = Math.max(m, Math.abs(d - w.sim.rest[i]) / w.sim.rest[i]);
  }
  return m;
}

/** deepest overlap among the current contacts (m) */
function worstPen(w: World): number {
  const S = w.sim as any;
  let m = 0;
  for (let c = 0; c < S.nc; c++) m = Math.max(m, -S.contactC(c));
  return m;
}

const tot = { settle: 0, ms: 0, kicks: 0, jerk: 0, rest: 0, shake: 0, pen: 0 };
for (const seed of seeds) {
  const w = new World(freeLevel(NC, seed));
  Object.assign(w.sim.P, params);
  const sim = w.sim;
  // 1. settling from the generated mess
  let ms = 0, worst = 0, settle = -1;
  const awake: number[] = [];
  for (let f = 0; f < 900; f++) {
    sim.step();
    ms += sim.stats.ms; worst = Math.max(worst, sim.stats.ms);
    if (f % 60 === 59) awake.push(sim.stats.awake);
    if (settle < 0 && sim.stats.awake === 0) settle = f;
  }
  // shimmer left: nodes of awake cords still moving
  let restFast = 0;
  for (let i = 0; i < sim.n; i++) if (speed(w, i) > 0.02) restFast++;

  // 2. the hand drags a cord through the others: back and forth across the
  // cabinet, at the controller's top speed, then slowly, then lets go
  const c = Math.floor(NC / 2), cb = w.cables[c];
  const node = cb.start + Math.floor(cb.count / 2);
  sim.grab(node);
  const t = [sim.x[3 * node], sim.x[3 * node + 1], sim.x[3 * node + 2]];
  const path = [[-0.2, t[1], 0.08], [0.2, t[1] - 0.15, 0.03], [-0.15, t[1] + 0.1, 0.05], [0.15, t[1], 0.12], [0, t[1] - 0.05, 0.06]];
  let kicks = 0, jerk = 0, stretchPeak = 0, dragMs = 0, frames = 0, shake = 0, pen = 0;
  const vPrev = Float64Array.from(sim.v);
  const measure = () => {
    for (let i = 0; i < sim.n; i++) {
      const near = sim.cableOf[i] === c && Math.abs(i - node) < 12;
      if (near) continue;
      // a node away from the hand whose velocity changes by more than 1 m/s in a frame was kicked
      const dv = Math.hypot(sim.v[3 * i] - vPrev[3 * i], sim.v[3 * i + 1] - vPrev[3 * i + 1], sim.v[3 * i + 2] - vPrev[3 * i + 2]);
      if (dv > 1) kicks++;
      if (dv > jerk) jerk = dv;
      // shaking: a node going back and forth from one frame to the next
      const dot = sim.v[3 * i] * vPrev[3 * i] + sim.v[3 * i + 1] * vPrev[3 * i + 1] + sim.v[3 * i + 2] * vPrev[3 * i + 2];
      if (dot < 0 && speed(w, i) > 0.1 && Math.hypot(vPrev[3 * i], vPrev[3 * i + 1], vPrev[3 * i + 2]) > 0.1) shake++;
    }
    vPrev.set(sim.v);
    stretchPeak = Math.max(stretchPeak, stretchMax(w));
    pen = Math.max(pen, worstPen(w));
  };
  for (const [n, p] of path.concat(path.slice(0, 3)).entries()) {
    const v = n < path.length ? 0.035 : 0.004;
    for (let f = 0; f < 800; f++) {
      const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
      const L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-4) break;
      const k = Math.min(1, v / L);
      for (let i = 0; i < 3; i++) t[i] += d[i] * k;
      sim.grabTarget[0] = t[0]; sim.grabTarget[1] = t[1]; sim.grabTarget[2] = t[2];
      sim.step();
      dragMs += sim.stats.ms; frames++;
      measure();
    }
    for (let f = 0; f < 10; f++) { sim.step(); dragMs += sim.stats.ms; frames++; measure(); }
  }
  sim.release();
  let after = -1;
  for (let f = 0; f < 600; f++) {
    sim.step();
    measure();
    if (after < 0 && sim.stats.awake === 0) after = f;
  }
  let nan = 0;
  for (const v of sim.x) if (!Number.isFinite(v)) nan++;
  console.log(`seed ${seed}: ${sim.n} nodes, settle ${settle < 0 ? 'never' : (settle / 60).toFixed(1) + ' s'} (awake/s ${awake.join(',')}), fast at 15 s ${restFast}, ` +
    `step avg ${(ms / 900).toFixed(2)} worst ${worst.toFixed(1)} ms | drag ${(dragMs / frames).toFixed(2)} ms, kicks ${kicks}, jerk ${jerk.toFixed(2)} m/s, shake ${shake}, pen ${(pen * 1000).toFixed(1)} mm, stretch ${(stretchPeak * 100).toFixed(1)} %, rest after ${after < 0 ? 'never' : (after / 60).toFixed(1) + ' s'}, NaN ${nan}`);
  tot.settle += settle < 0 ? 15 : settle / 60; tot.ms += ms / 900; tot.kicks += kicks; tot.jerk = Math.max(tot.jerk, jerk); tot.rest += restFast; tot.shake += shake; tot.pen = Math.max(tot.pen, pen);
}
const n = seeds.length;
console.log(`mean: settle ${(tot.settle / n).toFixed(1)} s, step ${(tot.ms / n).toFixed(2)} ms, kicks ${(tot.kicks / n).toFixed(0)}, worst jerk ${tot.jerk.toFixed(2)} m/s, shake ${(tot.shake / n).toFixed(0)}, worst pen ${(tot.pen * 1000).toFixed(1)} mm, fast at 15 s ${(tot.rest / n).toFixed(0)}`);
