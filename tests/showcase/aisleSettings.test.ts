// The title screen's aisles, given the page's options: no browser needed.
import { describe, expect, it } from 'vitest';
import { readUrlOptions } from '../../src/app/urlOptions';
import { aisleSettings } from '../../src/showcase/aisleSettings';
import { SHOWCASE_DEFAULT } from '../../src/game/levels/showcaseRack';

describe('the aisles of the title screen', () => {
  it('opens on the default aisle, whose mess is baked', () => {
    const a = aisleSettings(readUrlOptions(''));
    expect(a.isDefault).toBe(true);
    expect(a.firstSeed).toBe(SHOWCASE_DEFAULT.seed);
    expect(a.firstPairs).toEqual(SHOWCASE_DEFAULT.pairs);
    expect(a.view).not.toBeNull();
  });

  it('draws the first aisle at random once its size is changed', () => {
    const a = aisleSettings(readUrlOptions('?bays=3'));
    expect(a.isDefault).toBe(false);
    expect(a.firstSeed).toBeUndefined();
    expect(a.view).toBeNull();
    const pairs = a.anotherPairs() as number[];
    expect(pairs).toHaveLength(3);
    for (const p of pairs) expect(p).toBeGreaterThanOrEqual(5);
  });

  it('keeps the seed asked for', () => {
    expect(aisleSettings(readUrlOptions('?seed=7')).firstSeed).toBe(7);
  });
});
