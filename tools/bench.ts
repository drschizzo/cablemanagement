// Headless checks of the cable solver: run with
declare const process: { env: Record<string, string | undefined> };
//   npx esbuild tools/bench.ts --bundle --platform=node --format=esm --outfile=/tmp/bench.mjs && node /tmp/bench.mjs
import { CableSim, closest, segSeg, type CableInit, type StaticShape } from 'avbd-cables';

const SEG = 0.025;
const R = 0.0022;

function line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, len: number): number[] {
  const n = Math.max(2, Math.round(len / SEG) + 1);
  const pts: number[] = [];
  // a straight polyline from a to b, with the extra length as a zigzag in z
  const d = Math.hypot(bx - ax, by - ay, bz - az);
  const extra = Math.max(0, len - d);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const wig = extra > 0 ? Math.sin(t * Math.PI) * Math.sqrt(extra * d) * 0.3 : 0;
    pts.push(ax + (bx - ax) * t, ay + (by - ay) * t - wig, az + (bz - az) * t);
  }
  // fix segment lengths to the drawn polyline (the solver takes rest = initial)
  return pts;
}

function stretchError(sim: CableSim): number {
  let worst = 0;
  for (let i = 0; i < sim.n; i++) {
    if (!sim.segOK[i]) continue;
    const d = Math.hypot(sim.x[3 * i] - sim.x[3 * i + 3], sim.x[3 * i + 1] - sim.x[3 * i + 4], sim.x[3 * i + 2] - sim.x[3 * i + 5]);
    worst = Math.max(worst, Math.abs(d - sim.rest[i]) / sim.rest[i]);
  }
  return worst;
}

function worstOverlap(sim: CableSim): number {
  let worst = 0;
  const x = sim.x;
  for (let a = 0; a < sim.n; a++) {
    if (!sim.segOK[a]) continue;
    for (let b = a + 3; b < sim.n; b++) {
      if (!sim.segOK[b]) continue;
      if (sim.cableOf[a] === sim.cableOf[b] && b - a <= 2) continue;
      segSeg(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
        x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5]);
      const pen = 2 * R - Math.sqrt(closest.d2);
      if (pen > worst) worst = pen;
    }
  }
  return worst;
}

function overlapCount(sim: CableSim, tol: number): number {
  let n = 0;
  const x = sim.x;
  for (let a = 0; a < sim.n; a++) {
    if (!sim.segOK[a]) continue;
    for (let b = a + 3; b < sim.n; b++) {
      if (!sim.segOK[b]) continue;
      segSeg(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
        x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5]);
      if (2 * R - Math.sqrt(closest.d2) > tol) n++;
    }
  }
  return n;
}

function maxSpeed(sim: CableSim): number {
  let m = 0;
  for (let i = 0; i < sim.n; i++) m = Math.max(m, Math.hypot(sim.v[3 * i], sim.v[3 * i + 1], sim.v[3 * i + 2]));
  return m;
}

// --- 1. a hanging cable, pinned at both ends
{
  const sim = new CableSim();
  const pts = line(-0.3, 0.5, 0.05, 0.3, 0.5, 0.05, 1.0);
  sim.build([{ points: pts, radius: R }]);
  const last = sim.n - 1;
  sim.pin(0, pts[0], pts[1], pts[2]);
  sim.pin(last, pts[3 * last], pts[3 * last + 1], pts[3 * last + 2]);
  let ms = 0;
  for (let f = 0; f < 240; f++) { sim.step(); ms += sim.stats.ms; }
  let low = 1;
  for (let i = 0; i < sim.n; i++) low = Math.min(low, sim.x[3 * i + 1]);
  console.log(`hanging: stretch err ${(stretchError(sim) * 100).toFixed(3)} %, sag ${(0.5 - low).toFixed(3)} m, vmax ${maxSpeed(sim).toFixed(4)}, ${(ms / 240).toFixed(3)} ms/frame, asleep ${sim.cables[0].asleep}`);
}

// --- 2. a pile of cables dropped across a bar and onto a shelf
const variants: [string, Record<string, number>][] = JSON.parse(process.env.VARIANTS ?? '[["default", {}]]');
for (const [label, params] of variants) {
  const sim = new CableSim(params);
  const defs: CableInit[] = [];
  const NC = 30;
  for (let c = 0; c < NC; c++) {
    const y = 0.3 + c * 0.012;
    const z = 0.02 + ((c * 7) % 10) * 0.009;
    const a = (c % 2 ? 1 : -1) * 0.05;
    defs.push({ points: line(-0.4, y + a, z, 0.4, y - a, z + 0.01, 1.3), radius: R });
  }
  sim.build(defs);
  const statics: StaticShape[] = [
    { kind: 'capsule', ax: -0.5, ay: 0.25, az: 0.05, bx: 0.5, by: 0.25, bz: 0.05, r: 0.004 },
    { kind: 'box', min: [-0.6, -0.2, -0.2], max: [0.6, 0, 0.3] },
    { kind: 'box', min: [-0.6, -0.2, -0.3], max: [0.6, 1, -0.0] },
  ];
  sim.setStatics(statics);
  let ms = 0, worstMs = 0;
  const F = 300;
  for (let f = 0; f < F; f++) {
    sim.step();
    ms += sim.stats.ms; worstMs = Math.max(worstMs, sim.stats.ms);
    if (f % 60 === 59 && process.env.VERBOSE) {
      console.log(`  pile f${f + 1}: contacts ${sim.stats.contacts}, awake ${sim.stats.awake}, ${sim.stats.ms.toFixed(2)} ms, overlap ${(worstOverlap(sim) * 1000).toFixed(2)} mm, stretch ${(stretchError(sim) * 100).toFixed(2)} %, vmax ${maxSpeed(sim).toFixed(3)}`);
    }
  }
  let bad = 0;
  for (let i = 0; i < sim.x.length; i++) if (!Number.isFinite(sim.x[i])) bad++;
  console.log(`pile ${label.padEnd(28)} ${sim.n} nodes, avg ${(ms / F).toFixed(2)} ms, worst ${worstMs.toFixed(2)} ms, overlap ${(worstOverlap(sim) * 1000).toFixed(2)} mm, stretch ${(stretchError(sim) * 100).toFixed(2)} %, vmax ${maxSpeed(sim).toFixed(3)}, awake ${sim.stats.awake}, NaN ${bad}`);
}

// --- 3. a curtain of patch cords, as in the game: pinned at two port rows, hanging in loops
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const NC = Number(process.env.NC ?? 24);
  const defs: CableInit[] = [];
  const perm = Array.from({ length: NC }, (_, i) => i);
  for (let i = NC - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let c = 0; c < NC; c++) {
    const ax = -0.2 + (0.4 * c) / (NC - 1), ay = 0.8;
    const bx = -0.2 + (0.4 * perm[c]) / (NC - 1), by = 0.45;
    const z = 0.01 + rnd() * 0.08;
    // Catmull-Rom through a random mid point, sampled by arc length
    const mx = (ax + bx) / 2 + (rnd() - 0.5) * 0.5, my = 0.2 + rnd() * 0.25, mz = z;
    const ctrl = [[ax, ay, 0.04], [ax, ay - 0.05, z], [mx, my, mz], [bx, by - 0.05, z], [bx, by, 0.04]];
    const fine: number[][] = [];
    for (let k = 0; k < ctrl.length - 1; k++) {
      const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
      for (let u = 0; u < 1; u += 0.01) {
        const u2 = u * u, u3 = u2 * u;
        fine.push([0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3)));
      }
    }
    fine.push(ctrl[ctrl.length - 1]);
    const pts: number[] = [fine[0][0], fine[0][1], fine[0][2]];
    let acc = 0;
    for (let k = 1; k < fine.length; k++) {
      acc += Math.hypot(fine[k][0] - fine[k - 1][0], fine[k][1] - fine[k - 1][1], fine[k][2] - fine[k - 1][2]);
      if (acc >= SEG) { pts.push(...fine[k]); acc = 0; }
    }
    defs.push({ points: pts, radius: R });
  }
  const sim = new CableSim();
  const starts = sim.build(defs);
  starts.forEach((s, c) => {
    const e = s + sim.cables[c].count - 1;
    for (const i of [s, s + 1, e - 1, e]) sim.pin(i, sim.x[3 * i], sim.x[3 * i + 1], sim.x[3 * i + 2]);
  });
  sim.setStatics([
    { kind: 'box', min: [-0.5, -0.1, -0.3], max: [0.5, 1, 0] },
    { kind: 'box', min: [-0.5, -0.2, -0.3], max: [0.5, 0, 0.3] },
  ]);
  let ms = 0, worst = 0;
  const log: string[] = [];
  for (let f = 0; f < 600; f++) {
    sim.step();
    ms += sim.stats.ms; worst = Math.max(worst, sim.stats.ms);
    if (f === 0 || f % 120 === 119) log.push(`f${f + 1}: awake ${sim.stats.awake} vmax ${maxSpeed(sim).toFixed(3)} ov>1mm ${overlapCount(sim, 0.001)} ov>3mm ${overlapCount(sim, 0.003)}`);
  }
  if (process.env.DEEP) {
    const x = sim.x; const S: any = sim;
    for (let a = 0; a < sim.n; a++) {
      if (!sim.segOK[a]) continue;
      for (let b = a + 3; b < sim.n; b++) {
        if (!sim.segOK[b]) continue;
        segSeg(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
          x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5]);
        const pen = 2 * R - Math.sqrt(closest.d2);
        if (pen < 0.003) continue;
        const ia = a - sim.cables[sim.cableOf[a]].start, ib = b - sim.cables[sim.cableOf[b]].start;
        let info = 'no contact';
        for (let c = 0; c < S.nc; c++) if (S.ca0[c] === a && S.cb0[c] === b) info = `C ${S.contactC(c).toExponential(2)} k ${S.ck[c].toExponential(2)} lam ${S.clam[c].toExponential(2)} n ${[0, 1, 2].map((k) => S.cn[3 * c + k].toFixed(2))}`;
        console.log(`  deep: cable ${sim.cableOf[a]}#${ia}/${sim.cables[sim.cableOf[a]].count} vs ${sim.cableOf[b]}#${ib}/${sim.cables[sim.cableOf[b]].count} pen ${(pen * 1000).toFixed(2)}mm fixed ${sim.fixed[a]}${sim.fixed[a + 1]}/${sim.fixed[b]}${sim.fixed[b + 1]} s ${closest.s.toFixed(2)} t ${closest.t.toFixed(2)} | ${info}`);
      }
    }
  }
  console.log(`curtain ${NC} cables ${sim.n} nodes: avg ${(ms / 600).toFixed(2)} ms, worst ${worst.toFixed(1)} ms, overlap ${(worstOverlap(sim) * 1000).toFixed(2)} mm, stretch ${(stretchError(sim) * 100).toFixed(2)} %, contacts ${sim.stats.contacts}\n  ${log.join('\n  ')}`);
}
