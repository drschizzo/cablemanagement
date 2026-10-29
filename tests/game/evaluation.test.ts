import { describe, expect, it } from 'vitest';
import { cleanliness, starsOf, type Evaluation, type StarCounts } from '../../src/game/evaluation';
import { World } from '../../src/game/world';
import { LEVELS } from '../../src/game/levels/campaign';
import type { LevelDef } from '../../src/game/levels/levelDef';
import { strapBundles, tidyKit, tidyLayout } from '../../src/game/idealRoutes';

/** an evaluation with only the counts cleanliness reads */
const counts = (c: Partial<Evaluation>): Evaluation =>
  ({ total: 4, connected: 0, routed: 0, clear: 0, relaxed: 0, bundles: 0, bundlesNeeded: 0, ...c }) as Evaluation;

describe('cleanliness', () => {
  it('is 0 for a cabinet where nothing is done, 1 when everything is', () => {
    expect(cleanliness(counts({}))).toBe(0);
    expect(cleanliness(counts({ connected: 4, routed: 4, clear: 4, relaxed: 4 }))).toBe(1);
  });

  it('counts plugging double', () => {
    // connected alone: 2 parts of 5
    expect(cleanliness(counts({ connected: 4 }))).toBeCloseTo(2 / 5);
    // routed alone: 1 part of 5
    expect(cleanliness(counts({ routed: 4 }))).toBeCloseTo(1 / 5);
  });

  it('counts the bundles only when the level asks for some', () => {
    const done = { connected: 4, routed: 4, clear: 4, relaxed: 4 };
    expect(cleanliness(counts({ ...done, bundlesNeeded: 2, bundles: 1 }))).toBeCloseTo((8 + 4 + 4 + 4 + 2) / 24);
    expect(cleanliness(counts({ ...done, bundlesNeeded: 2, bundles: 3 }))).toBe(1);
  });
});

/** a cabinet of 20 lines with everything done; each test takes one thing away */
const perfect: StarCounts = { total: 20, connected: 20, routed: 20, clear: 20, labelled: 20, relaxed: 20, bundles: 2, bundlesNeeded: 2, downtime: 50, budget: 50 };
const stars = (c: Partial<StarCounts>) => starsOf({ ...perfect, ...c });

describe('the stars', () => {
  it('none while a single line is not connected, however tidy the rest', () => {
    expect(stars({ connected: 19 })).toBe(0);
    expect(stars({ connected: 0, routed: 0, clear: 0 })).toBe(0);
  });

  it('two from 70 % of the cords routed, not one cord fewer', () => {
    expect(stars({ routed: 14 })).toBe(2);
    expect(stars({ routed: 13 })).toBe(1);
  });

  it('two from 85 % of the cords clear of the ports, not one cord fewer', () => {
    expect(stars({ clear: 17 })).toBe(2);
    expect(stars({ clear: 16 })).toBe(1);
    // both thresholds at once
    expect(stars({ routed: 14, clear: 17 })).toBe(2);
    expect(stars({ routed: 13, clear: 20 })).toBe(1);
  });

  it('three only with everything: each thing missing alone leaves two', () => {
    expect(stars({})).toBe(3);
    for (const missing of [{ routed: 19 }, { clear: 19 }, { labelled: 19 }, { relaxed: 19 }, { bundles: 1 }]) {
      expect([missing, stars(missing)]).toEqual([missing, 2]);
    }
  });

  it('three at the downtime budget exactly, two past it', () => {
    expect(stars({ downtime: 50 })).toBe(3);
    expect(stars({ downtime: 50.01 })).toBe(2);
    expect(stars({ downtime: 1e6, budget: Infinity })).toBe(3);
  });

  it('a level with no bundle asked: none needed, more are fine', () => {
    expect(stars({ bundles: 0, bundlesNeeded: 0 })).toBe(3);
    expect(stars({ bundles: 5 })).toBe(3);
  });

  it('a small cabinet: the thresholds round up to whole cords', () => {
    // 4 lines: 70 % is 2.8 cords, 85 % is 3.4 cords
    const small = { total: 4, connected: 4, labelled: 4, relaxed: 4, bundles: 0, bundlesNeeded: 0 };
    expect(stars({ ...small, routed: 3, clear: 4 })).toBe(2);
    expect(stars({ ...small, routed: 4, clear: 3 })).toBe(1);
  });
});

/** the cabinet of a level finished by a careful technician, settled, strapped and labelled */
function finished(lv: LevelDef): World {
  const kit = tidyKit(lv);
  const w = new World(kit, tidyLayout(kit).starts);
  for (let f = 0; f < 240; f++) w.sim.step();
  strapBundles(w, lv.bundles ?? 0);
  for (let f = 0; f < 60; f++) w.sim.step();
  w.circuits.forEach((ci, i) => w.labelCord(i, ci.service));
  return w;
}

describe('a perfect cabinet spoiled by one thing', () => {
  it('one cord without its label: two stars', () => {
    const w = finished(LEVELS[3]);
    expect(w.level.labels).toBe(true);
    expect(w.evaluate().stars).toBe(3);
    w.labelCord(0, null);
    const ev = w.evaluate();
    expect(ev.labelled).toBe(ev.total - 1);
    expect(ev.stars).toBe(2);
    w.dispose();
  });

  it('one cord cut too short, pulled taut: no third star', () => {
    const w = finished(LEVELS[2]);
    expect(w.evaluate().stars).toBe(3);
    // a cord whose ports are far apart: the shortest that joins them cuts the corners of its tidy route
    const cord = w.cables.findIndex((_, k) => w.minCableLength(k) < 0.65 * w.routeLength(k)!);
    expect(cord).toBeGreaterThanOrEqual(0);
    expect(w.setCableLength(cord, w.minCableLength(cord) + 0.01)).toBe(true);
    const ev = w.evaluate();
    expect(ev.cableStrain[cord]).toBe('taut');
    expect(ev.relaxed).toBe(ev.total - 1);
    expect(ev.stars).toBeLessThan(3);
    w.dispose();
  });

  it('one bundle short of what the level asks: two stars', () => {
    const lv = LEVELS[5];
    expect(lv.bundles).toBeGreaterThan(0);
    const w = finished(lv);
    expect(w.evaluate().stars).toBe(3);
    w.removeStrap(w.straps[0]);
    const ev = w.evaluate();
    expect(ev.bundles).toBe(lv.bundles! - 1);
    expect(ev.stars).toBe(2);
    w.dispose();
  });
});
