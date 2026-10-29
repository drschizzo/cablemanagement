// Headless check of the crate: throw cords in, take new ones from the stock.
import { World } from '../src/game/world';
import { LEVELS } from '../src/game/levels/campaign';

const w = new World(LEVELS[2]);
w.preroll(60);
const inCrate = (c: number) => {
  const cr = w.rack.crate(), cb = w.cables[c], x = w.sim.x;
  let n = 0;
  for (let k = 0; k < cb.count; k++) {
    const i = 3 * (cb.start + k);
    if (x[i] > cr.min[0] && x[i] < cr.max[0] && x[i + 2] > cr.min[2] && x[i + 2] < cr.max[2] && x[i + 1] < cr.max[1] + 0.02) n++;
  }
  return `${n}/${cb.count}`;
};
for (const c of [1, 2, 3]) w.depositCable(c);
for (let f = 0; f < 240; f++) w.sim.step();
const a = w.addCable('OS2', 1.0);
const b = w.addCable('OS2', 0.5);
for (let f = 0; f < 240; f++) w.sim.step();
let bad = 0;
for (const v of w.sim.x) if (!Number.isFinite(v)) bad++;
console.log(`in crate: ${[1, 2, 3, a, b].map((c) => `#${c} ${inCrate(c)}`).join(', ')} | cables ${w.cables.length} | lengths new ${w.cableLength(a).toFixed(2)}, ${w.cableLength(b).toFixed(2)} | ends ${w.cables[1].ends.map((e) => e.port)} | NaN ${bad} | awake ${w.sim.stats.awake}`);
