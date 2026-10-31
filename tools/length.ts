// Headless check of the cord length swap.
import { World } from '../src/game/world';
import { TRAINING } from '../src/game/levels/training';

const w = new World(TRAINING[2]);
w.preroll(60);
const strap = (() => {
  const x = w.sim.x;
  for (let i = 0; i < w.sim.n; i++) for (let j = i + 1; j < w.sim.n; j++) {
    if (w.sim.cableOf[i] === w.sim.cableOf[j]) continue;
    if (Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]) < 0.006) return w.addStrap(x[3 * i], x[3 * i + 1], x[3 * i + 2]);
  }
  return null;
})();
const report = (label: string) => {
  let err = 0, bad = 0;
  for (let i = 0; i < w.sim.n; i++) {
    if (!Number.isFinite(w.sim.x[3 * i])) bad++;
    if (!w.sim.segOK[i]) continue;
    const d = Math.hypot(w.sim.x[3 * i] - w.sim.x[3 * i + 3], w.sim.x[3 * i + 1] - w.sim.x[3 * i + 4], w.sim.x[3 * i + 2] - w.sim.x[3 * i + 5]);
    err = Math.max(err, Math.abs(d - w.sim.rest[i]) / w.sim.rest[i]);
  }
  const ends = w.cables.map((cb) => cb.ends.map((e) => e.port ?? '-').join('/')).join(' ');
  console.log(`${label}: cable 0 ${w.cableLength(0).toFixed(2)} m (${w.cables[0].count} nodes), min ${w.minCableLength(0).toFixed(2)}, stretch ${(err * 100).toFixed(1)} %, NaN ${bad}, straps ${w.straps.length}/${w.straps.map((s) => s.nodes.length)}, connected ${w.evaluate().connected}, ends ${ends}`);
};
report(`start (strap ${strap ? 'yes' : 'no'})`);
for (const L of [0.6, 1.8, 0.05]) {
  const ok = w.setCableLength(0, L);
  for (let f = 0; f < 120; f++) w.sim.step();
  report(`set ${L} -> ${ok}`);
}
{
  let worst = 0, at = 0;
  for (let i = 0; i < w.sim.n; i++) {
    if (!w.sim.segOK[i]) continue;
    const d = Math.hypot(w.sim.x[3 * i] - w.sim.x[3 * i + 3], w.sim.x[3 * i + 1] - w.sim.x[3 * i + 4], w.sim.x[3 * i + 2] - w.sim.x[3 * i + 5]);
    const e = Math.abs(d - w.sim.rest[i]) / w.sim.rest[i];
    if (e > worst) { worst = e; at = i; }
  }
  const c = w.sim.cableOf[at];
  console.log(`worst seg ${at} cable ${c} k ${at - w.cables[c].start}/${w.cables[c].count} rest ${w.sim.rest[at].toFixed(4)} pinned ${w.sim.pinned[at]}${w.sim.pinned[at + 1]} bundle ${w.sim.bundleOf[at]},${w.sim.bundleOf[at + 1]}`);
  console.log('rests of cable 0 head', Array.from(w.sim.rest.subarray(w.cables[0].start, w.cables[0].start + 4)).map((v) => v.toFixed(4)).join(' '));
}
for (let f = 0; f < 300; f++) w.sim.step();
report('after 5 more seconds');
{
  const cb = w.cables[0], x = w.sim.x;
  const tail = [];
  for (let k = cb.count - 6; k < cb.count; k++) { const i = 3 * (cb.start + k); tail.push(`${k}:(${x[i].toFixed(3)},${x[i + 1].toFixed(3)},${x[i + 2].toFixed(3)}) v${Math.hypot(w.sim.v[i], w.sim.v[i + 1], w.sim.v[i + 2]).toFixed(2)}`); }
  console.log(tail.join(' '), 'asleep', w.sim.cables[0].asleep);
}
{
  const before = w.cableLength(1), min = w.minCableLength(1);
  const ok = w.setCableLength(1, min + 0.05);
  for (let f = 0; f < 240; f++) w.sim.step();
  let err = 0;
  const cb = w.cables[1];
  for (let i = cb.start; i < cb.start + cb.count - 1; i++) {
    const d = Math.hypot(w.sim.x[3 * i] - w.sim.x[3 * i + 3], w.sim.x[3 * i + 1] - w.sim.x[3 * i + 4], w.sim.x[3 * i + 2] - w.sim.x[3 * i + 5]);
    err = Math.max(err, Math.abs(d - w.sim.rest[i]) / w.sim.rest[i]);
  }
  console.log(`shorten cable 1: ${before.toFixed(2)} -> ${w.cableLength(1).toFixed(2)} m (min ${min.toFixed(2)}) ok ${ok}, stretch ${(err * 100).toFixed(1)} %, ends ${cb.ends.map((e) => e.port)}`);
}
