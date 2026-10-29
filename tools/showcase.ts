// Headless check of the before/after cabinet, over a few random closets: the
// mess (settled as in the demo), then the tidy cords on their routes.
//   npm run showcase -- [seeds] [pairs]
declare const process: { argv: string[] };
import { World } from '../src/game/world';
import { SHOWCASE_SETTLE, showcaseRack } from '../src/game/levels/showcaseRack';
import { tidyLayout, tidyTargets } from '../src/game/idealRoutes';

const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
const pairs = process.argv[3] ? Number(process.argv[3]) : undefined;
for (const seed of seeds) {
  const m = new World(showcaseRack('mess', seed, pairs));
  Object.assign(m.sim.P, SHOWCASE_SETTLE.solver);
  const t0 = performance.now();
  for (let f = 0; f < SHOWCASE_SETTLE.frames; f++) m.sim.step();
  const settle = performance.now() - t0;
  let low = 0, nan = 0;
  for (let i = 0; i < m.sim.n; i++) if (m.sim.x[3 * i + 1] < m.rack.floorY + 0.02) low++;
  for (const v of m.sim.x) if (!Number.isFinite(v)) nan++;

  const tidyLevel = showcaseRack('tidy', seed, pairs);
  const { starts: tidyStarts, paths } = tidyLayout(tidyLevel);
  const w = new World(tidyLevel, tidyStarts);
  w.sim.teleport(tidyTargets(w, paths));
  w.circuits.forEach((ci, i) => w.labelCord(i, ci.service));
  const ev = w.evaluate();
  const x = w.sim.x;
  const faults: string[] = [];
  w.cables.forEach((cb, c) => {
    if (!ev.cableRouted[c]) faults.push(`R${c}:${cb.ends.map((e) => e.port)}`);
    if (!ev.cableObstructs[c]) return;
    for (const p of w.rack.ports) {
      if (cb.ends.some((e) => e.port === p.id)) continue;
      for (let k = 5; k < cb.count - 5; k++) {
        const i = cb.start + k;
        if (Math.abs(x[3 * i] - p.x) < Math.max(0.006, w.rack.portPitch(p) * 0.45) && Math.abs(x[3 * i + 1] - (p.y - 0.002)) < 0.011 && x[3 * i + 2] < 0.11) { faults.push(`O${c}:${cb.ends.map((e) => e.port)}@${p.id}`); return; }
      }
    }
  });
  const layout = m.rack.units.map((u) => (u.kind === 'blank' ? '_' : u.kind[0])).join('');
  console.log(`seed ${seed} ${layout}: mess ${m.sim.n} nodes settled in ${settle.toFixed(0)} ms, ${(low / m.sim.n * 100).toFixed(0)}% on the floor, NaN ${nan} | tidy ${w.cables.length} cords, routed ${ev.routed} clear ${ev.clear} ${faults.join(' ')}`);
}
