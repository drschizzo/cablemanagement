import { describe, expect, it } from 'vitest';
import { nextStar, starsOf, type StarCounts } from '../../src/game/evaluation';
import { World } from '../../src/game/world';
import { BIG_BAYS, LEVELS } from '../../src/game/levels/campaign';
import type { LevelDef } from '../../src/game/levels/levelDef';
import { strapBundles, tidyKit, tidyLayout } from '../../src/game/idealRoutes';

/** a cabinet of 20 lines with everything done; each test takes one thing away */
const perfect: StarCounts = { total: 20, connected: 20, routed: 20, clear: 20, labelled: 20, relaxed: 20, tidy: 20, tautShort: 0, mixedSupports: 0, bundles: 2, bundlesNeeded: 2, downtime: 50, budget: 50 };
const stars = (c: Partial<StarCounts>) => starsOf({ ...perfect, ...c });

describe('the stars', () => {
  it('none while a single line is not connected, however tidy the rest', () => {
    expect(stars({ connected: 19 })).toBe(0);
    expect(stars({ connected: 0, routed: 0, clear: 0 })).toBe(0);
  });

  it('two with every cord tidy but one per eight links, not one cord fewer', () => {
    // 20 lines: 3 cords may be left
    expect(stars({ tidy: 17 })).toBe(2);
    expect(stars({ tidy: 16 })).toBe(1);
  });

  it('three only with everything: each thing missing alone leaves two', () => {
    expect(stars({})).toBe(3);
    for (const missing of [{ tidy: 19 }, { labelled: 19 }, { mixedSupports: 1 }, { bundles: 1 }]) {
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

  it('a small cabinet leaves one cord at least', () => {
    const small = { total: 4, connected: 4, labelled: 4, bundles: 0, bundlesNeeded: 0 };
    expect(stars({ ...small, tidy: 3 })).toBe(2);
    expect(stars({ ...small, tidy: 2 })).toBe(1);
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

describe('what the next star needs', () => {
  const next = (c: Partial<StarCounts>) => nextStar({ ...perfect, ...c });

  it('nothing once there are three stars', () => {
    expect(next({})).toBeNull();
  });

  it('the first star: the links still to plug', () => {
    expect(next({ connected: 17 })).toEqual({ stars: 1, needs: [{ kind: 'connect', count: 3 }] });
  });

  it('the second: the cords to make tidy beyond those it leaves, and what is wrong with the untidy ones', () => {
    expect(next({ tidy: 10, routed: 12, clear: 15, relaxed: 18 })).toEqual({ stars: 2, needs: [{ kind: 'tidy', count: 7, allowed: 3, hanging: 8, front: 5, strained: 2, short: 0 }] });
  });

  it('the third: everything left, and the incident first when the budget is overrun', () => {
    expect(next({ relaxed: 18, tidy: 18, bundles: 1, downtime: 51 })).toEqual({ stars: 3, needs: [{ kind: 'incident' }, { kind: 'tidy', count: 2, allowed: 0, hanging: 0, front: 0, strained: 2, short: 0 }, { kind: 'bundle', count: 1 }] });
  });
});

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
    const lv = BIG_BAYS[0];
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
