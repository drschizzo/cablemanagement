// The gestures a level calls for, read from what it gives.
import { describe, expect, it } from 'vitest';
import { levelGestures } from '../../../src/game/levels/levelGestures';
import { LEVELS } from '../../../src/game/levels/campaign';

describe('the gestures of a level', () => {
  it('the first level needs none beyond the tutorial', () => {
    expect(levelGestures(LEVELS[0])).toEqual([]);
  });

  it('the supports given call for their gesture', () => {
    expect(levelGestures(LEVELS[1])).toEqual(['duct']);
  });

});
