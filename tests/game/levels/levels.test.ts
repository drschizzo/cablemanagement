// Every level builds, its schedule makes sense, and a perfect cabinet is possible.
import { describe, it, expect } from 'vitest';
import { World } from '../../../src/game/world';
import { ITEM_KINDS } from '../../../src/game/supplies';
import { SERVICES } from '../../../src/game/services';
import { LEVELS, TUTORIAL } from '../../../src/game/levels/campaign';
import { freeLevel } from '../../../src/game/levels/freeLevel';
import { PUZZLES } from '../../../src/game/levels/puzzles';
import { showcaseRack } from '../../../src/game/levels/showcaseRack';
import type { LevelDef } from '../../../src/game/levels/levelDef';
import { strapBundles, tidyKit, tidyLayout, tidyTargets } from '../../../src/game/idealRoutes';

const ALL: LevelDef[] = [...LEVELS, ...PUZZLES, TUTORIAL, freeLevel(30, 1), showcaseRack('mess', 1), showcaseRack('tidy', 1)];

describe.each(ALL.map((lv) => [lv.id, lv] as const))('%s', (_, lv) => {
  const w = new World(lv);

  it('a schedule on existing ports, each port used once', () => {
    const ids = w.circuits.flatMap((c) => [c.a, c.b]);
    for (const id of ids) expect(() => w.rack.port(id)).not.toThrow();
    expect(new Set(ids).size).toBe(ids.length);
    expect(w.circuits).toHaveLength(lv.schedule ? w.cables.length : lv.cables + (lv.links?.length ?? 0));
  });

  it('the services of the schedule have a label colour', () => {
    for (const c of w.circuits) expect(SERVICES[c.service]?.color, `service ${c.service}`).toBeDefined();
  });

  it('the starting mess settles without blowing up', () => {
    w.preroll(20);
    expect(w.sim.x.every(Number.isFinite)).toBe(true);
  });
});

describe('levels', () => {
  it('unique ids, the cabinets grow', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].cables).toBeGreaterThanOrEqual(LEVELS[i - 1].cables);
  });

  it('a level’s cabinet is the same every time (seeded)', () => {
    const a = new World(LEVELS[2]), b = new World(LEVELS[2]);
    expect(a.circuits).toEqual(b.circuits);
    expect(a.cables.map((c) => c.ends.map((e) => e.port))).toEqual(b.cables.map((c) => c.ends.map((e) => e.port)));
  });
});

/** the cabinet of a level finished by a careful technician, settled and labelled */
function finished(lv: LevelDef) {
  return finishedWorld(lv).evaluate();
}

function finishedWorld(lv: LevelDef) {
  const kit = tidyKit(lv);
  const w = new World(kit, tidyLayout(kit).starts);
  for (let f = 0; f < 240; f++) w.sim.step();
  strapBundles(w, lv.bundles ?? 0);
  for (let f = 0; f < 60; f++) w.sim.step();
  w.circuits.forEach((ci, i) => w.labelCord(i, ci.service));
  return w;
}

describe('no level is won before the player does anything', () => {
  for (const lv of [...LEVELS, ...PUZZLES]) {
    it(lv.id, () => {
      const w = new World(lv);
      w.preroll(60);
      expect(w.evaluate().stars).toBe(0);
    });
  }
});

describe('three stars are possible, with the level\'s own stock', () => {
  for (const lv of [...LEVELS, ...PUZZLES]) {
    it(lv.id, () => {
      const kit = tidyKit(lv);
      const added = kit.preinstalled.slice(lv.preinstalled.length);
      for (const k of ITEM_KINDS) expect(added.filter((p) => p.kind === k).length).toBeLessThanOrEqual(lv.inventory[k] ?? 0);
      expect(finished(lv).stars).toBe(3);
    });
  }

  it('past the downtime budget, an incident: two stars at most', () => {
    const lv = LEVELS[0];
    const kit = tidyKit(lv);
    const w = new World(kit, tidyLayout(kit).starts);
    for (let f = 0; f < 240; f++) w.sim.step();
    expect(w.evaluate().stars).toBe(3);
    w.maintenance.downtime = w.maintenance.budget + 1;
    expect(w.evaluate().stars).toBe(2);
  });

  it('the tidy cabinet of the before/after is perfect', () => {
    const level = showcaseRack('tidy', 7);
    const { starts, paths } = tidyLayout(level);
    const w = new World(level, starts);
    w.sim.teleport(tidyTargets(w, paths));
    w.circuits.forEach((ci, i) => w.labelCord(i, ci.service));
    const ev = w.evaluate();
    expect(ev.routed).toBe(ev.total);
    expect(ev.clear).toBe(ev.total);
  });
});
