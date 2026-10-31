import { describe, expect, it } from 'vitest';
import { isGoalMet, starGoals, starsOf, type StarCounts } from '../../src/game/evaluation';
import { World } from '../../src/game/world';
import { LEVELS } from '../../src/game/levels/campaign';
import type { LevelDef } from '../../src/game/levels/levelDef';
import { tidyKit, tidyLayout } from '../../src/game/idealRoutes';

/** a cabinet of 20 lines with everything done; each test takes one thing away */
const perfect: StarCounts = { total: 20, connected: 20, routed: 20, clear: 20, relaxed: 20, tidy: 20, tautShort: 0, mixedSupports: 0, families: 2, downtime: 50, budget: 50 };
const stars = (c: Partial<StarCounts>) => starsOf({ ...perfect, ...c });

describe('the stars', () => {
  it('none while a single line is not connected, however tidy the rest', () => {
    expect(stars({ connected: 19 })).toBe(0);
    expect(stars({ connected: 0, routed: 0, clear: 0 })).toBe(0);
  });

  it('one while a single cord is not tidy: two take every cord tidy', () => {
    expect(stars({ tidy: 19 })).toBe(1);
    expect(stars({ tidy: 0 })).toBe(1);
  });

  it('three only with everything: each thing the level asks besides, missing alone, leaves two', () => {
    expect(stars({})).toBe(3);
    for (const missing of [{ mixedSupports: 1 }, { downtime: 51 }]) {
      expect([missing, stars(missing)]).toEqual([missing, 2]);
    }
  });

  it('three at the downtime budget exactly, two past it', () => {
    expect(stars({ downtime: 50 })).toBe(3);
    expect(stars({ downtime: 50.01 })).toBe(2);
    expect(stars({ downtime: 1e6, budget: Infinity })).toBe(3);
  });

  it('a level with neither budget nor several families: three with two', () => {
    expect(stars({ budget: Infinity, families: 1, mixedSupports: 3 })).toBe(3);
  });
});

/** the cabinet of a level finished by a careful technician, settled and labelled */
function finished(lv: LevelDef): World {
  const kit = tidyKit(lv);
  const w = new World(kit, tidyLayout(kit).starts);
  for (let f = 0; f < 240; f++) w.sim.step();
  w.circuits.forEach((ci, i) => w.labelCord(i, ci.service));
  return w;
}

describe('what each star asks', () => {
  const goals = (c: Partial<StarCounts>) => starGoals({ ...perfect, ...c });

  it('every goal from the start, the third star\'s included', () => {
    expect(goals({ connected: 0, tidy: 0 }).map((g) => [g.stars, g.kind])).toEqual([[1, 'connect'], [2, 'tidy'], [3, 'budget'], [3, 'separate']]);
  });

  it('the cords not tidy yet, and what is wrong with them', () => {
    expect(goals({ tidy: 10, routed: 12, clear: 15, relaxed: 18 })[1]).toEqual({ stars: 2, kind: 'tidy', done: 10, total: 20, hanging: 8, front: 5, strained: 2, short: 0 });
  });

  it('the third star asks only what the level has', () => {
    expect(goals({ budget: Infinity, families: 1 }).filter((g) => g.stars === 3)).toEqual([]);
  });

  it('the budget is met until it is overrun', () => {
    const budget = (downtime: number) => isGoalMet(goals({ downtime }).find((g) => g.kind === 'budget')!);
    expect([budget(50), budget(51)]).toEqual([true, false]);
  });
});

describe('a perfect cabinet spoiled by one thing', () => {
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
});
