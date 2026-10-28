// Shaping a cord by hand, headless.
// 1. Does an elbow pinched into a cord keep its shape once let go? A cord
// sticks out of a port, sideways. The hand takes it 25 cm out and
// lifts it level with the port, so that the rest of it hangs down from the
// hand: a right-angle elbow at the hand. Then, with or without a pinch, the
// hand lets go; three seconds later, the angle left between the cord before
// the elbow and after it (inside the pinch), and whether the cord has come
// to rest.
// 2. Does a cord with pinched elbows settle, in a cabinet? Three elbows
// pinched one after the other, then its kinetic energy and the reversals of
// its nodes' velocity over the next three seconds, and when it falls asleep.
//   PARAMS='{"pinchK":8}' npm run pinch
declare const process: { env: Record<string, string | undefined> };
import { CABLES } from '@drschizzo/avbd-cables';
import { RackSim } from '../src/game/rackSim';
import { World } from '../src/game/world';
import { LEVELS } from '../src/game/levels';

const params = JSON.parse(process.env.PARAMS ?? '{}');
const SEG = 0.025, R = 0.0028;

/** turning angle (degrees) between segments a → a+1 and b → b+1 */
function angle(sim: RackSim, a: number, b: number): number {
  const x = sim.x;
  const u = [x[3 * a + 3] - x[3 * a], x[3 * a + 4] - x[3 * a + 1], x[3 * a + 5] - x[3 * a + 2]];
  const v = [x[3 * b + 3] - x[3 * b], x[3 * b + 4] - x[3 * b + 1], x[3 * b + 5] - x[3 * b + 2]];
  const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

function run(label: string, pinch: boolean, n: number, shelf: boolean, extra: Record<string, number> = {}) {
  const sim = new RackSim({ ...params, ...extra });
  const pts: number[] = [];
  for (let k = 0; k < n; k++) pts.push(k * SEG, 1, 0);
  sim.build([{ points: pts, ...CABLES.patchCord.cable, radius: R, bend: 12 }]);
  // a shelf 20 cm under the port, for the hanging part to rest on
  if (shelf) sim.setStatics([{ kind: 'box', min: [0.1, 0.5, -0.3], max: [1.2, 0.8, 0.3] }]);
  // the connector, in its port
  sim.pin(0, 0, 1, 0);
  sim.pin(1, SEG, 1, 0);
  const g = 10;
  for (let f = 0; f < 30; f++) sim.step();
  sim.grab(g);
  // lift the held point back level with the port
  for (let f = 0; f < 120; f++) {
    const t = sim.grabTarget;
    t[0] += (g * SEG - t[0]) * 0.1; t[1] += (1 - t[1]) * 0.1; t[2] += (0 - t[2]) * 0.1;
    sim.step();
  }
  const held = angle(sim, g - 3, g + 2);
  if (pinch) {
    // the hand keeps pinching for a second
    sim.pinch(true);
    for (let f = 0; f < 60; f++) { sim.firmPinch(sim.P.pinchStart + sim.P.pinchGrow * (f / 60)); sim.step(); }
    sim.pinch(false);
  }
  sim.release();
  let f = 0, slept = -1;
  for (; f < 180; f++) {
    sim.step();
    if (slept < 0 && sim.cables[0].asleep) slept = f;
  }
  let vmax = 0;
  for (let i = 0; i < sim.n; i++) vmax = Math.max(vmax, Math.hypot(sim.v[3 * i], sim.v[3 * i + 1], sim.v[3 * i + 2]));
  const tip = sim.x[3 * (n - 1) + 1];
  console.log(`  ${label.padEnd(20)} held ${held.toFixed(0).padStart(3)}°, kept ${angle(sim, g - 3, g + 2).toFixed(0).padStart(3)}°, tip y ${tip.toFixed(3)}, asleep ${slept < 0 ? 'no' : `${(slept / 60).toFixed(2)} s`}, vmax ${vmax.toFixed(4)}`);
}

for (const [n, shelf] of [[16, false], [22, false], [40, true]] as const) {
  console.log(`-- ${((n - 11) * SEG * 100).toFixed(0)} cm under the hand${shelf ? ', onto a shelf' : ''}`);
  run('let go', false, n, shelf);
  run('pinched for 1 s', true, n, shelf);
}

console.log('-- three pinched elbows, in a cabinet');
for (const pinch of [false, true]) {
  let ke = 0, rev = 0, late = 0, asleepS = 0;
  for (const lvl of [0, 2, 4]) for (const c of [0, 1, 2]) {
    const w = new World(LEVELS[lvl]);
    Object.assign(w.sim.P, params);
    w.preroll(90);
    const sim = w.sim, cb = w.cables[c];
    for (const f of [0.3, 0.5, 0.7]) {
      const g = cb.start + Math.round(cb.count * f);
      sim.grab(g);
      const t0 = [...sim.grabTarget];
      for (let k = 0; k < 60; k++) { sim.grabTarget[0] = t0[0] + 0.1 * Math.sin(k / 20); sim.grabTarget[1] = t0[1] + 0.12 * (k / 60); sim.step(); }
      if (pinch) { sim.pinch(true); for (let k = 0; k < 40; k++) { sim.firmPinch(sim.P.pinchStart + sim.P.pinchGrow * (k / 60)); sim.step(); } sim.pinch(false); }
      sim.release();
      for (let k = 0; k < 20; k++) sim.step();
    }
    const prev = new Float64Array(sim.v.length);
    let asleep = -1;
    for (let f = 0; f < 240; f++) {
      sim.step();
      for (let i = cb.start; i < cb.start + cb.count; i++) {
        const v2 = sim.v[3 * i] ** 2 + sim.v[3 * i + 1] ** 2 + sim.v[3 * i + 2] ** 2;
        const d = sim.v[3 * i] * prev[3 * i] + sim.v[3 * i + 1] * prev[3 * i + 1] + sim.v[3 * i + 2] * prev[3 * i + 2];
        if (f >= 60) { ke += v2; if (d < 0 && v2 > 1e-4) rev++; }
        prev[3 * i] = sim.v[3 * i]; prev[3 * i + 1] = sim.v[3 * i + 1]; prev[3 * i + 2] = sim.v[3 * i + 2];
      }
      if (asleep < 0 && sim.cables[c].asleep) asleep = f;
    }
    if (asleep < 0) late++; else asleepS += asleep / 60;
  }
  console.log(`  ${(pinch ? 'pinched' : 'let go').padEnd(20)} energy ${(ke * 1000).toFixed(0)}, reversals ${rev}, asleep within 4 s ${9 - late}/9 (mean ${(asleepS / Math.max(1, 9 - late)).toFixed(1)} s)`);
}
