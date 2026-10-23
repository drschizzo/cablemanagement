// Is a perfect cabinet possible in every level? Lay every cord on its tidy
// route (managers in empty units, ducts on both sides) and score it.
import { World } from '../src/game/world';
import { LEVELS } from '../src/game/levels';
import { tidyKit } from '../src/game/tidy';

for (const lv of LEVELS) {
  const w = new World(tidyKit(lv));
  for (let f = 0; f < 240; f++) w.sim.step();
  w.circuits.forEach((ci, i) => { for (const e of w.cables[i].ends) e.label = ci.service; });
  const ev = w.evaluate();
  const bad = w.cables.map((cb, c) => (ev.cableRouted[c] ? '' : `R:${cb.ends.map((e) => e.port).join('-')} `) + (ev.cableObstructs[c] ? `O:${cb.ends.map((e) => e.port).join('-')} ` : '')).join('');
  console.log(`${lv.id}: routed ${ev.routed}/${ev.total} clear ${ev.clear} stars ${ev.stars} ${bad}`);
}
