// Headless run of every level: build, settle, report timing and tidiness.
import { World } from '../src/game/world';
import { LEVELS } from '../src/game/levels';

for (const lv of LEVELS) {
  const t0 = performance.now();
  const w = new World(lv);
  const tb = performance.now() - t0;
  let ms = 0, worst = 0;
  const F = 300;
  const awake: number[] = [];
  for (let f = 0; f < F; f++) {
    w.sim.step();
    ms += w.sim.stats.ms; worst = Math.max(worst, w.sim.stats.ms);
    if (f % 60 === 59) awake.push(w.sim.stats.awake);
  }
  let bad = 0;
  for (const v of w.sim.x) if (!Number.isFinite(v)) bad++;
  const ev = w.evaluate();
  const items = `${w.rack.items.length}/${lv.preinstalled.length} items`;
  const types = [...new Set(w.cables.map((c) => c.type))].join('+');
  console.log(`${lv.id} ${items} ${types} circuits ${w.circuits.length} (${lv.cables}+${lv.links?.length ?? 0})`);
  console.log(`${lv.id} ${lv.cables} cables, ${w.sim.n} nodes, build ${tb.toFixed(0)} ms, step avg ${(ms / F).toFixed(2)} worst ${worst.toFixed(1)} ms, contacts ${w.sim.stats.contacts}, awake/s ${awake.join(',')}, NaN ${bad} | connected ${ev.connected}/${ev.total} routed ${ev.routed} clear ${ev.clear}`);
}
