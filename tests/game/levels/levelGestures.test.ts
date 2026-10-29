// The gestures a level calls for, read from what it gives.
import { describe, expect, it } from 'vitest';
import { levelGestures } from '../../../src/game/levels/levelGestures';
import { BIG_BAYS, LEVELS } from '../../../src/game/levels/campaign';

describe('the gestures of a level', () => {
  it('the first level needs none beyond the tutorial', () => {
    expect(levelGestures(LEVELS[0])).toEqual([]);
  });

  it('the supports given call for their gesture', () => {
    expect(levelGestures(LEVELS[1])).toEqual(['duct', 'ring']);
  });

  it('the velcro, once bundles count', () => {
    expect(levelGestures(LEVELS[4])).not.toContain('velcro');
    expect(levelGestures(BIG_BAYS[0])).toContain('velcro');
  });
});
