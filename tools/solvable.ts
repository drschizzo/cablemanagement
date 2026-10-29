// Is a perfect cabinet possible in every level, with its own stock? Lay every
// cord on its tidy route (the level's managers, ducts and rings placed by
// tidyKit) and score it.
//
// Then, from the level's own starting mess: with the same supports placed,
// each cord in production is laid along its tidy route without unplugging it
// (as the route tool does). Those that still hang or block a port must come
// out of the heap the hard way, unplugged: about `REWORK` seconds cut each,
// at their service's weight. Is the downtime budget enough for that?
import { World } from '../src/game/world';
import { CATALOGUE, LEVELS, SERVICES } from '../src/game/levels';
import { polyLength, routePlan, strapBundles, tidyKit, tidyRoutes } from '../src/game/idealRoutes';
import { planRoute, RouteRun } from '../src/game/routeLaying';
import type { Guide } from '../src/game/rack';

declare const process: { env: Record<string, string | undefined> };

/** length of every line's tidy route, in the level's finished cabinet (m) */
function tidyRoutesOf(lv: (typeof LEVELS)[number]): number[] {
  const w = new World(tidyKit(lv));
  return tidyRoutes(w.rack, w.circuits, w.radius, w.seg).map(polyLength);
}

/** seconds a production line stays cut while its cord is taken out of the heap and plugged back */
const REWORK = 15;

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
  console.log(`${lv.id}: routed ${ev.routed}/${ev.total} clear ${ev.clear} relaxed ${ev.relaxed} stars ${ev.stars} lisibilité ${ev.readability.note} bundles ${ev.bundles}/${ev.bundlesNeeded} velcro ${(lv.inventory.velcro ?? 0) - w.inventory.velcro}/${lv.inventory.velcro ?? 0} | ${stock} ${bad}`);
}

console.log('\nAu départ : les liaisons en production rangées sans les débrancher');
for (const lv of LEVELS) {
  const kit = tidyKit(lv);
  const w = new World(lv);
  w.preroll(60);
  for (const p of kit.preinstalled.slice(lv.preinstalled.length)) w.rack.addItem(p.kind, p.unit, p.side, true);
  w.sim.setStatics(w.rack.statics());
  const guides = w.rack.guides();
  const itemOf = (id: number) => w.rack.items.find((it) => it.id === id)!;
  const h = w.sim.P.dt;
  let failed = 0;
  for (const i of w.live) {
    const ci = w.circuits[i];
    const c = w.rack.port(ci.a).plug >> 1;
    const [p] = routePlan(w.rack, [ci]);
    // the way a technician takes: the manager by the first port, down its side, the manager by the other
    const lo = Math.min(p.upper, p.lower), hi = Math.max(p.upper, p.lower);
    const side = guides.filter((g) => g.kind !== 'hmgr' && itemOf(g.item).side === p.side && itemOf(g.item).unit + itemOf(g.item).span > lo && itemOf(g.item).unit <= hi);
    const mgr = (u: number) => guides.filter((g) => g.kind === 'hmgr' && itemOf(g.item).unit === u);
    const top = w.rack.port(ci.a).unit < w.rack.port(ci.b).unit;
    side.sort((a, b) => (itemOf(a.item).unit - itemOf(b.item).unit) * (top ? 1 : -1));
    // a cord from a panel to the switch right under it: its slack goes in the manager below them
    const way: Guide[] = p.curl || p.upper === p.lower ? mgr(p.upper) : [...mgr(top ? p.upper : p.lower), ...side, ...mgr(top ? p.lower : p.upper)];
    const res = planRoute(w, c, way, null);
    if ('error' in res) { failed++; continue; }
    const run = new RouteRun(w, res.plan);
    for (let f = 0; f < 600 && !run.step(h); f++) w.sim.step();
  }
  for (let f = 0; f < 120; f++) w.sim.step();
  const ev = w.evaluate();
  const stuck = [...w.live].filter((i) => !ev.circuits[i].routed || !ev.circuits[i].clear);
  if (process.env.WHY) console.log(`  pendent ${stuck.filter((i) => !ev.circuits[i].routed).length}, devant un port ${stuck.filter((i) => !ev.circuits[i].clear).length}`);
  const cost = stuck.reduce((a, i) => a + REWORK * SERVICES[w.circuits[i].service].weight, 0);
  const budget = lv.downtime ?? Infinity;
  // the new cords the level takes: for every line whose cord is half a metre too long for its
  // tidy route, or stuck in the heap, one of the length of that route (up to the catalogue's next)
  const need = new Map<number, number>();
  const plan = tidyRoutesOf(lv);
  w.circuits.forEach((ci, i) => {
    const L = plan[i];
    if (!stuck.includes(i) && w.cableLength(i) < L + 0.45) return;
    const k = CATALOGUE.find((x) => x >= L + 0.03) ?? CATALOGUE[CATALOGUE.length - 1];
    need.set(k, (need.get(k) ?? 0) + 1);
  });
  const needs = [...need].sort((a, b) => a[0] - b[0]).map(([L, n]) => `${n}×${L}`).join(' ');
  const have = (lv.cords ?? []).map(([L, n]) => `${n}×${L}`).join(' ');
  console.log(`${lv.id}: ${w.live.size - stuck.length}/${w.live.size} rangées en place${failed ? ` (${failed} chemins refusés)` : ''}, ${stuck.length} à débrancher ≈ ${Math.round(cost)} pts pour un budget de ${budget}${cost - (lv.bypass ?? 0) * REWORK * 4 > budget ? ' — TROP JUSTE, même avec les dérivations' : ''}${lv.bypass ? ` (${lv.bypass} dérivation${lv.bypass > 1 ? 's' : ''})` : ''}${needs ? ` ; cordons : ${needs} (stock ${have})` : ''}`);
}
