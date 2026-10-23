// Headless check of the before/after cabinet: the mess, then the tidy cords.
import { World } from '../src/game/world';
import { showcaseRack } from '../src/game/levels';

{
  const t0 = performance.now();
  const w = new World(showcaseRack('mess'));
  const build = performance.now() - t0;
  let ms = 0;
  const log: string[] = [];
  for (let f = 0; f < 180; f++) { w.sim.step(); ms += w.sim.stats.ms; if (f % 30 === 29) log.push(`${w.sim.stats.awake}/${w.sim.stats.ms.toFixed(0)}ms`); }
  let low = 0;
  for (let i = 0; i < w.sim.n; i++) if (w.sim.x[3 * i + 1] < w.rack.floorY + 0.02) low++;
  const ev = w.evaluate();
  console.log(`mess: ${w.sim.n} nodes, build ${build.toFixed(0)} ms, ${(ms / 180).toFixed(1)} ms/step, awake/ms ${log.join(' ')}, nodes on the floor ${low}, routed ${ev.routed} clear ${ev.clear}`);
}
{
  const w = new World(showcaseRack('tidy'));
  w.sim.teleport(w.tidyTargets());
  let ms = 0;
  const awake: number[] = [];
  for (let f = 0; f < 300; f++) { w.sim.step(); ms += w.sim.stats.ms; if (f % 50 === 49) awake.push(w.sim.stats.awake); }
  w.circuits.forEach((ci, i) => { for (const e of w.cables[i].ends) e.label = ci.service; });
  const ev = w.evaluate();
  let bad = 0;
  for (const v of w.sim.x) if (!Number.isFinite(v)) bad++;
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
  console.log(`tidy: ${w.sim.n} nodes, ${(ms / 300).toFixed(1)} ms/step, awake ${awake.join(',')}, routed ${ev.routed}/${ev.total} clear ${ev.clear} stars ${ev.stars}, NaN ${bad} ${faults.join(' ')}`);
}
