// The kinds of cable of avbd-cables (CABLES), headless: for each, a cable
// dropped on the floor, one draped over a rod, a heap of cables dropped across
// one another, and a cable dragged through the heap by a heavy target (a hand).
// Then: the worst stretch of a segment, the deepest two cables or a cable and
// the floor go into one another (as a fraction of the radius), when it all
// falls asleep, and whether a NaN appeared.
//   KINDS=rope,hose PARAMS='{"marginCap":0.02}' npm run presets
declare const process: { env: Record<string, string | undefined> };
import { CABLES, CableSim, closest, segSeg, type CableKind, type StaticShape } from 'avbd-cables';

const floor: StaticShape = { kind: 'box', min: [-3, -0.2, -3], max: [3, 0, 3] };

/** a straight cable from a to b, nodes `seg` apart */
function line(a: number[], b: number[], seg: number): number[] {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / seg) + 1);
  const pts: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    pts.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  return pts;
}

function stretch(sim: CableSim): number {
  let w = 0;
  for (let i = 0; i < sim.n; i++) {
    if (!sim.segOK[i]) continue;
    const d = Math.hypot(sim.x[3 * i] - sim.x[3 * i + 3], sim.x[3 * i + 1] - sim.x[3 * i + 4], sim.x[3 * i + 2] - sim.x[3 * i + 5]);
    w = Math.max(w, Math.abs(d - sim.rest[i]) / sim.rest[i]);
  }
  return w;
}

/** the deepest overlap (m): two segments of different cables, or a node and the floor */
function overlap(sim: CableSim): number {
  let w = 0;
  const x = sim.x;
  for (let i = 0; i < sim.n; i++) w = Math.max(w, sim.radius[i] - x[3 * i + 1]);
  for (let a = 0; a < sim.n; a++) {
    if (!sim.segOK[a]) continue;
    for (let b = a + 1; b < sim.n; b++) {
      if (!sim.segOK[b] || sim.cableOf[a] === sim.cableOf[b]) continue;
      segSeg(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
        x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5]);
      w = Math.max(w, sim.radius[a] + sim.radius[b] - Math.sqrt(closest.d2));
    }
  }
  return w;
}

/** runs until everything sleeps (or `limit` s): the time it took (Infinity: never), the worst stretch and overlap on the way */
function settle(sim: CableSim, limit: number, each?: (f: number) => void): { asleep: number; stretch: number; overlap: number; nan: boolean } {
  let worst = 0, deep = 0;
  const frames = Math.round(limit / sim.P.dt);
  for (let f = 0; f < frames; f++) {
    each?.(f);
    sim.step();
    worst = Math.max(worst, stretch(sim));
    if (f % 6 === 0) deep = Math.max(deep, overlap(sim));
    if (!sim.x.every(Number.isFinite)) return { asleep: Infinity, stretch: worst, overlap: deep, nan: true };
    if (!each && sim.cables.every((c) => c.asleep)) return { asleep: (f + 1) * sim.P.dt, stretch: worst, overlap: deep, nan: false };
  }
  return { asleep: sim.cables.every((c) => c.asleep) ? limit : Infinity, stretch: worst, overlap: deep, nan: false };
}

const pct = (v: number) => `${(100 * v).toFixed(1)} %`;
const sec = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} s` : 'jamais');

function bench(name: string, k: CableKind): void {
  const r = k.cable.radius, seg = k.segment;
  const out: string[] = [];
  // 1. one cable, 1.5 m, dropped from 30 cm
  {
    const sim = new CableSim(k.params);
    sim.build([{ ...k.cable, points: line([-0.75, 0.3, 0], [0.75, 0.3, 0], seg) }]);
    sim.setStatics([floor]);
    const s = settle(sim, 8);
    out.push(`sol : repos ${sec(s.asleep)}, étirement ${pct(s.stretch)}, enfoncé ${pct(overlap(sim) / r)} du rayon${s.nan ? ', NaN' : ''}`);
  }
  // 2. one cable over a rod 40 cm up
  {
    const sim = new CableSim(k.params);
    sim.build([{ ...k.cable, points: line([-0.6, 0.45, 0], [0.6, 0.45, 0], seg) }]);
    sim.setStatics([floor, { kind: 'capsule', ax: 0, ay: 0.4, az: -0.5, bx: 0, by: 0.4, bz: 0.5, r: 0.02 }]);
    const s = settle(sim, 8);
    const mid = sim.n >> 1;
    out.push(`tige : repos ${sec(s.asleep)}, étirement ${pct(s.stretch)}, milieu ${sim.x[3 * mid + 1] > 0.4 ? 'dessus' : 'tombé'}${s.nan ? ', NaN' : ''}`);
  }
  // 3. a heap: 12 cables of 1.5 m, crossed, dropped; 4. one dragged 1 m through it
  {
    const sim = new CableSim(k.params);
    const defs = [];
    for (let c = 0; c < 12; c++) {
      const a = (c * Math.PI) / 12, h = 0.05 + c * 4 * r;
      defs.push({ ...k.cable, points: line([-0.75 * Math.cos(a), h, -0.75 * Math.sin(a)], [0.75 * Math.cos(a), h, 0.75 * Math.sin(a)], seg) });
    }
    sim.build(defs);
    sim.setStatics([floor]);
    const s = settle(sim, 12);
    const ov = overlap(sim);
    out.push(`tas : repos ${sec(s.asleep)}, étirement ${pct(s.stretch)}, chevauchement ${pct(ov / r)} du rayon (au pire ${pct(s.overlap / r)})${s.nan ? ', NaN' : ''}`);
    const end = sim.cables[0].start + sim.cables[0].count - 1;
    const from = [sim.x[3 * end], sim.x[3 * end + 1], sim.x[3 * end + 2]];
    const d = settle(sim, 1.5, (f) => {
      const t = Math.min(1, f / 60);
      sim.setTarget(end, from[0] - t * 1.0, 0.05 + 8 * r, from[2] + t * 0.2, 1.6, 4 * r + 0.04, true);
    });
    sim.clearTarget(end);
    const after = settle(sim, 10);
    out.push(`traîné : étirement ${pct(d.stretch)}, chevauchement au pire ${pct(d.overlap / r)} du rayon, puis repos ${sec(after.asleep)}, chevauchement ${pct(overlap(sim) / r)}${d.nan || after.nan ? ', NaN' : ''}`);
  }
  console.log(`${name} (rayon ${(r * 1000).toFixed(1)} mm, nœuds tous les ${(seg * 100).toFixed(1)} cm)`);
  for (const l of out) console.log(`  ${l}`);
}

const kinds = (process.env.KINDS ?? Object.keys(CABLES).join(',')).split(',') as (keyof typeof CABLES)[];
const extra = JSON.parse(process.env.PARAMS ?? '{}');
for (const name of kinds) bench(name, { ...CABLES[name], params: { ...CABLES[name].params, ...extra } });
