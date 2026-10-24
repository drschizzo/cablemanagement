// Is a perfect cabinet possible in every level, with its own stock? Lay every
// cord on its tidy route (the level's managers, ducts and rings placed by
// tidyKit) and score it.
import { World } from '../src/game/world';
import { LEVELS } from '../src/game/levels';
import { strapBundles, tidyKit } from '../src/game/tidy';

for (const lv of LEVELS) {
  const kit = tidyKit(lv);
  const w = new World(kit);
  for (let f = 0; f < 240; f++) w.sim.step();
  strapBundles(w, lv.bundles ?? 0);
  for (let f = 0; f < 60; f++) w.sim.step();
  w.circuits.forEach((ci, i) => { for (const e of w.cables[i].ends) e.label = ci.service; });
  const ev = w.evaluate();
  const added = kit.preinstalled.slice(lv.preinstalled.length);
  const count = (k: string) => added.filter((p) => p.kind === k).length;
  const stock = `guide-câbles ${count('hmgr')}/${lv.inventory.hmgr ?? 0} goulottes ${count('duct')}/${lv.inventory.duct ?? 0} anneaux ${count('vring')}/${lv.inventory.vring ?? 0}`;
  const bad = w.cables.map((cb, c) => (ev.cableRouted[c] ? '' : `R:${cb.ends.map((e) => e.port).join('-')} `) + (ev.cableObstructs[c] ? `O:${cb.ends.map((e) => e.port).join('-')} ` : '')).join('');
  console.log(`${lv.id}: routed ${ev.routed}/${ev.total} clear ${ev.clear} stars ${ev.stars} bundles ${ev.bundles}/${ev.bundlesNeeded} velcro ${(lv.inventory.velcro ?? 0) - w.inventory.velcro}/${lv.inventory.velcro ?? 0} | ${stock} ${bad}`);
}
