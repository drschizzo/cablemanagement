// The page's options are read from a plain string: no browser needed.
import { describe, expect, it } from 'vitest';
import { aisleSettings, readUrlOptions } from '../../src/app/urlOptions';
import { SHOWCASE_DEFAULT } from '../../src/game/levels/showcaseRack';
import { QUALITY } from '../../src/render/quality';

describe('the options of the page address', () => {
  it('has defaults when the address carries none', () => {
    expect(readUrlOptions('')).toEqual({ syncPhysics: false, bays: SHOWCASE_DEFAULT.bays, pairs: 0, seed: 0, quality: null });
  });

  it('reads them, and keeps the numbers within bounds', () => {
    expect(readUrlOptions('?sync&bays=3&pairs=6&seed=42&quality=2')).toEqual({ syncPhysics: true, bays: 3, pairs: 6, seed: 42, quality: 2 });
    expect(readUrlOptions('?bays=99&pairs=99&quality=99')).toMatchObject({ bays: 32, pairs: 16, quality: QUALITY.length - 1 });
    expect(readUrlOptions('?bays=abc')).toMatchObject({ bays: SHOWCASE_DEFAULT.bays });
  });
});

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
