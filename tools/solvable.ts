// Is a perfect cabinet possible in every level? Lay every cord on its tidy
// route (managers in empty units, ducts on both sides) and score it.
import { World } from '../src/game/world';
import { LEVELS, type LevelDef } from '../src/game/levels';
import { Rack, DUCT_SPAN } from '../src/game/rack';

for (const lv of LEVELS) {
  const probe = new Rack(lv.units);
  const pre = [...lv.preinstalled];
  const last = lv.units.reduce((m, u, k) => (u.kind !== 'blank' ? k : m), 0);
  lv.units.forEach((u, k) => {
    if (u.kind === 'blank' && k > 0 && k < last && !pre.some((p) => p.kind === 'hmgr' && p.unit === k)) pre.push({ kind: 'hmgr', unit: k, side: 0 });
  });
  for (const side of [-1, 1]) for (let u = 1; u + DUCT_SPAN <= lv.units.length + 1; u += DUCT_SPAN) pre.push({ kind: 'duct', unit: Math.min(u + 1, lv.units.length - 1), side });
  void probe;
  const sol: LevelDef = { ...lv, preinstalled: pre, showcase: 'tidy', wrong: 0, loose: 0 };
  const w = new World(sol);
  for (let f = 0; f < 240; f++) w.sim.step();
  w.circuits.forEach((ci, i) => { for (const e of w.cables[i].ends) e.label = ci.service; });
  const ev = w.evaluate();
  const bad = w.cables.map((cb, c) => (ev.cableRouted[c] ? '' : `R:${cb.ends.map((e) => e.port).join('-')} `) + (ev.cableObstructs[c] ? `O:${cb.ends.map((e) => e.port).join('-')} ` : '')).join('');
  console.log(`${lv.id}: routed ${ev.routed}/${ev.total} clear ${ev.clear} stars ${ev.stars} ${bad}`);
}
