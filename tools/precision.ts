// Precision bench: the gestures that frustrate a player, measured.
//   PARAMS='{"substeps":8}' npm run precision
// S1 push a cord into a duct and let go; S2 lay a cord along a finger manager;
// S3 a level settling at rest; S4 the big heap of level 8.
import { World } from '../src/game/world';
import { LEVELS } from '../src/game/levels/campaign';
import type { LevelDef } from '../src/game/levels/levelDef';
import { U } from '../src/game/rack';
import { env, envNumber, envParams } from './env';

const params = envParams();
const B = { kind: 'blank' as const };
const bench: LevelDef = {
  id: 'bench', title: '', brief: '',
  units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
  cables: 4, wrong: 0, loose: 0, slack: [0.5, 0.7], mess: 1,
  labels: false, services: 1, types: ['CU'], colorByService: true,
  inventory: {}, preinstalled: [{ kind: 'hmgr', unit: 2, side: 0 }, { kind: 'duct', unit: 3, side: 1 }, { kind: 'duct', unit: 7, side: 1 }],
  seed: 5,
  seg: envNumber('SEG', 0.025),
};

function make(level: LevelDef): World {
  const w = new World({ ...level, ...(env.SEG ? { seg: Number(env.SEG) } : {}), ...(env.BEND ? { bend: Number(env.BEND) } : {}) });
  Object.assign(w.sim.P, params);
  return w;
}

const speedMax = (w: World) => {
  let m = 0;
  for (let i = 0; i < w.sim.n; i++) m = Math.max(m, Math.hypot(w.sim.v[3 * i], w.sim.v[3 * i + 1], w.sim.v[3 * i + 2]));
  return m;
};
const stretchMax = (w: World) => {
  let m = 0;
  for (let i = 0; i < w.sim.n; i++) {
    if (!w.sim.segOK[i]) continue;
    const d = Math.hypot(w.sim.x[3 * i] - w.sim.x[3 * i + 3], w.sim.x[3 * i + 1] - w.sim.x[3 * i + 4], w.sim.x[3 * i + 2] - w.sim.x[3 * i + 5]);
    m = Math.max(m, Math.abs(d - w.sim.rest[i]) / w.sim.rest[i]);
  }
  return m;
};
/** worst overlap of a cord with the rack (m): how far it went into a finger or a wall */
const statPen = (w: World) => (w.sim as any).stats.contacts >= 0 ? worstStaticPen(w) : 0;
function worstStaticPen(w: World): number {
  const S = (w.sim as any).statics as any[];
  let worst = 0;
  const x = w.sim.x;
  for (let i = 0; i < w.sim.n; i++) {
    const px = x[3 * i], py = x[3 * i + 1], pz = x[3 * i + 2];
    for (const s of S) {
      if (s.kind !== 'capsule') continue;
      const ax = s.bx - s.ax, ay = s.by - s.ay, az = s.bz - s.az;
      const L2 = ax * ax + ay * ay + az * az;
      let t = ((px - s.ax) * ax + (py - s.ay) * ay + (pz - s.az) * az) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(px - s.ax - ax * t, py - s.ay - ay * t, pz - s.az - az * t);
      worst = Math.max(worst, s.r + w.radius - d);
    }
  }
  return worst;
}

/** the hand: grab a node, follow waypoints at the controller's speed, hold, release */
function gesture(w: World, node: number, path: number[][], hold = 20, kind: 'hmgr' | 'duct' = 'duct'): { peakAfter: number; settle: number; stretchPeak: number; atRelease: number } {
  const sim = w.sim;
  sim.grab(node);
  const t = [...sim.grabTarget];
  let stretchPeak = 0;
  for (const p of path) {
    for (let f = 0; f < 200; f++) {
      const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
      const L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-4) break;
      const k = Math.min(1, 0.03 / L);
      for (let i = 0; i < 3; i++) t[i] += d[i] * k;
      sim.grabTarget[0] = t[0]; sim.grabTarget[1] = t[1]; sim.grabTarget[2] = t[2];
      sim.step();
      stretchPeak = Math.max(stretchPeak, stretchMax(w));
    }
  }
  for (let f = 0; f < hold; f++) sim.step();
  if (env.WHERE) {
    const g = sim.grabNode;
    console.log(`   au lâcher : main (${sim.grabTarget.map((v) => v.toFixed(3))}) nœud (${[0, 1, 2].map((d) => sim.x[3 * g + d].toFixed(3))}) dans goulotte ${nodesIn(w, sim.cableOf[g], 'duct')} guide ${nodesIn(w, sim.cableOf[g], 'hmgr')}`);
  }
  const atRelease = nodesIn(w, sim.cableOf[sim.grabNode], kind);
  sim.release();
  let peakAfter = 0, settle = -1;
  let where = '';
  for (let f = 0; f < 360; f++) {
    sim.step();
    if (f >= 3) {
      const sp = speedMax(w);
      if (sp > peakAfter) {
        peakAfter = sp;
        let at = 0, m = 0;
        for (let i = 0; i < w.sim.n; i++) { const v = Math.hypot(w.sim.v[3 * i], w.sim.v[3 * i + 1], w.sim.v[3 * i + 2]); if (v > m) { m = v; at = i; } }
        const c = w.sim.cableOf[at];
        where = `f${f} câble ${c} nœud ${at - w.cables[c].start}/${w.cables[c].count} y ${w.sim.x[3 * at + 1].toFixed(2)} z ${w.sim.x[3 * at + 2].toFixed(2)} contacts ${w.sim.stats.contacts}`;
      }
    }
    stretchPeak = Math.max(stretchPeak, stretchMax(w));
    if (settle < 0 && sim.stats.awake === 0) settle = f;
  }
  if (env.WHERE) {
    console.log('   pic :', where);
    const c = w.sim.cableOf[node], cb = w.cables[c];
    const pts: string[] = [];
    for (let k = Math.max(0, node - cb.start - 12); k < Math.min(cb.count, node - cb.start + 13); k += 4) {
      const i = 3 * (cb.start + k);
      pts.push(`${k}:(${w.sim.x[i].toFixed(2)},${w.sim.x[i + 1].toFixed(2)},${w.sim.x[i + 2].toFixed(2)})`);
    }
    console.log('   forme finale :', pts.join(' '));
  }
  return { peakAfter, settle, stretchPeak, atRelease };
}

function nodesIn(w: World, c: number, kind: 'hmgr' | 'duct'): number {
  const ids = new Set(w.rack.items.filter((i) => i.kind === kind).map((i) => i.id));
  const boxes = w.rack.supports().filter((s) => ids.has(s.item));
  const cb = w.cables[c], x = w.sim.x;
  let n = 0;
  for (let k = 0; k < cb.count; k++) {
    const i = 3 * (cb.start + k);
    if (boxes.some((s) => x[i] >= s.min[0] && x[i] <= s.max[0] && x[i + 1] >= s.min[1] && x[i + 1] <= s.max[1] && x[i + 2] >= s.min[2] && x[i + 2] <= s.max[2])) n++;
  }
  return n;
}

const t0 = performance.now();
// S1: into the duct
{
  const w = make(bench);
  w.preroll(90);
  const c = 0, cb = w.cables[c];
  const node = cb.start + Math.floor(cb.count / 2);
  const y = w.rack.topY - 5 * U;
  const g = gesture(w, node, [[0.2, y, 0.16], [0.318, y, 0.16], [0.318, y, 0.0], [0.318, y - 0.12, 0.0]]);
  const inside = nodesIn(w, c, 'duct');
  console.log(`S1 goulotte : ${g.atRelease} nœuds dedans au lâcher, ${inside} restent, pic vitesse après lâcher ${g.peakAfter.toFixed(2)} m/s, repos ${g.settle < 0 ? 'jamais' : (g.settle / 60).toFixed(1) + ' s'}, étirement max ${(g.stretchPeak * 100).toFixed(1)} %, pénétration ${(statPen(w) * 1000).toFixed(1)} mm`);
}
// S2: along the finger manager, the way a player does it: near the panel end, then a sweep
{
  const w = make(bench);
  w.preroll(90);
  const c = 1, cb = w.cables[c];
  // hold it 50 cm from its panel port, then sweep away from the port, along the fingers
  const node = cb.start + 20;
  const y = w.rack.unitY(2);
  const px = w.rack.port(cb.ends[0].port!).x;
  const dir = px < 0 ? 1 : -1;
  const g = gesture(w, node, [[px, y + 0.004, 0.04], [px + dir * 0.3, y + 0.004, 0.04]], 20, 'hmgr');
  console.log(`S2 guide-câbles : ${g.atRelease} nœuds posés au lâcher, ${nodesIn(w, c, 'hmgr')} restent, pic vitesse après lâcher ${g.peakAfter.toFixed(2)} m/s, repos ${g.settle < 0 ? 'jamais' : (g.settle / 60).toFixed(1) + ' s'}, étirement max ${(g.stretchPeak * 100).toFixed(1)} %, pénétration ${(statPen(w) * 1000).toFixed(1)} mm`);
}
// S3, S4: settling
for (const li of [3, 7]) {
  const w = make(LEVELS[li]);
  let asleepAt = -1, ms = 0;
  for (let f = 0; f < 900; f++) {
    w.sim.step();
    ms += w.sim.stats.ms;
    if (asleepAt < 0 && w.sim.stats.awake === 0) asleepAt = f;
  }
  console.log(`${li === 3 ? 'S3 repos niveau 4' : 'S4 tas niveau 8'} : ${asleepAt < 0 ? `encore ${w.sim.stats.awake}/${w.cables.length} actifs à 15 s` : `tout au repos à ${(asleepAt / 60).toFixed(1)} s`}, vitesse max ${speedMax(w).toFixed(3)} m/s, étirement ${(stretchMax(w) * 100).toFixed(1)} %, ${(ms / 900).toFixed(1)} ms/pas`);
}
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
