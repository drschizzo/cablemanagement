import { describe, expect, it } from 'vitest';
import { isGoalMet, isReady, requirementsOf, signOffGoals, type GoalCounts } from '../../src/game/evaluation';
import { World } from '../../src/game/world';
import { TRAINING } from '../../src/game/levels/training';
import type { LevelDef } from '../../src/game/levels/levelDef';
import { tidyKit, tidyLayout } from '../../src/game/idealRoutes';

/** a cabinet of 20 lines with everything done; each test takes one thing away */
const perfect: GoalCounts = { total: 20, connected: 20, routed: 20, clear: 20, relaxed: 20, tidy: 20, tautShort: 0, mixedSupports: 0, hasPowerAndData: true, downtime: 50, budget: 50 };
const ready = (c: Partial<GoalCounts>) => isReady({ ...perfect, ...c });
const requirements = (c: Partial<GoalCounts>) => requirementsOf({ ...perfect, ...c });

describe('signing off', () => {
  it('not while a single line is not connected, however tidy the rest', () => {
    expect(ready({ connected: 19 })).toBe(false);
    expect(ready({ connected: 0, routed: 0, clear: 0 })).toBe(false);
  });

  it('not while a single cord is not tidy', () => {
    expect(ready({ tidy: 19 })).toBe(false);
    expect(ready({ tidy: 0 })).toBe(false);
  });

  it('whatever the client\'s requirements', () => {
    expect(ready({})).toBe(true);
    expect(ready({ mixedSupports: 3, downtime: 1e6 })).toBe(true);
  });

  it('the cords not tidy yet, and what is wrong with them', () => {
    expect(signOffGoals({ ...perfect, tidy: 10, routed: 12, clear: 15, relaxed: 18 })[1]).toEqual({ kind: 'tidy', done: 10, total: 20, hanging: 8, front: 5, strained: 2, short: 0 });
  });
});

describe('the client\'s requirements', () => {
  it('a budget in production, power apart from data in a cabinet that has both', () => {
    expect(requirements({}).map((g) => g.kind)).toEqual(['budget', 'separate']);
    expect(requirements({ budget: Infinity }).map((g) => g.kind)).toEqual(['separate']);
    expect(requirements({ hasPowerAndData: false }).map((g) => g.kind)).toEqual(['budget']);
  });

  it('none in a level that asks nothing more than signing off', () => {
    expect(requirements({ budget: Infinity, hasPowerAndData: false, mixedSupports: 3 })).toEqual([]);
  });

  it('the budget is met at the budget exactly, missed past it', () => {
    const budget = (downtime: number) => isGoalMet(requirements({ downtime }).find((g) => g.kind === 'budget')!);
    expect([budget(50), budget(50.01)]).toEqual([true, false]);
  });

  it('power apart is missed with a single duct mixing it with data', () => {
    const separate = (mixedSupports: number) => isGoalMet(requirements({ mixedSupports }).find((g) => g.kind === 'separate')!);
    expect([separate(0), separate(1)]).toEqual([true, false]);
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

describe('a perfect cabinet spoiled by one thing', () => {
  it('one cord cut too short, pulled taut: it cannot be signed off', () => {
    const w = finished(TRAINING[2]);
    expect(w.evaluate().ready).toBe(true);
    // a cord whose ports are far apart: the shortest that joins them cuts the corners of its tidy route
    const cord = w.cables.findIndex((_, k) => w.minCableLength(k) < 0.65 * w.routeLength(k)!);
    expect(cord).toBeGreaterThanOrEqual(0);
    expect(w.setCableLength(cord, w.minCableLength(cord) + 0.01)).toBe(true);
    const ev = w.evaluate();
    expect(ev.cableStrain[cord]).toBe('taut');
    expect(ev.relaxed).toBe(ev.total - 1);
    expect(ev.ready).toBe(false);
    w.dispose();
  });
});
