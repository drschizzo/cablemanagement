// A find lies inside the cabinet, where the level's seed puts it, until picked up.
import { describe, expect, it } from 'vitest';
import { FINDS, placeFind } from '../../src/game/finds';
import { Rack } from '../../src/game/rack';
import { World } from '../../src/game/world';
import { BIG_BAYS, LEVELS } from '../../src/game/levels/campaign';
import { rng } from '../../src/lib/random';

describe('the finds', () => {
  it('each level of the training and big cabinet hides another one', () => {
    const levels = [...LEVELS, ...BIG_BAYS];
    const hidden = levels.map((l) => l.find);
    expect(hidden.every((f) => f && FINDS.includes(f))).toBe(true);
    expect(new Set(hidden).size).toBe(levels.length);
  });

  it('lies on the cabinet floor, on its roof or in the crate; never in an open rack', () => {
    const rack = new Rack(LEVELS[0].units);
    for (let seed = 0; seed < 40; seed++) {
      const find = placeFind('duck', rack, rng(seed))!;
      const [, y] = find.at;
      expect([rack.floorY, rack.topY + 0.16, rack.crate().min[1] + 0.01].some((h) => Math.abs(h - y) < 1e-9)).toBe(true);
    }
    expect(placeFind('duck', new Rack(LEVELS[0].units, { open: true }), rng(1))).toBeNull();
  });

  it('is in the same place every time, and leaves the cabinet once picked up', () => {
    const a = new World(LEVELS[2]), b = new World(LEVELS[2]);
    expect(a.find).toEqual(b.find);
    expect(a.takeFind()).toBe(LEVELS[2].find);
    expect(a.find).toBeNull();
    expect(a.takeFind()).toBeNull();
  });
});
