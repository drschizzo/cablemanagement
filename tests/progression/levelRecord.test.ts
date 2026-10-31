// The record of a cabinet signed off, and the better of two, over plain records.
import { describe, expect, it } from 'vitest';
import { bestRecord, ticksOf } from '../../src/progression/levelRecord';

describe('a level\'s record', () => {
  it('the first one is kept as it is', () => {
    expect(bestRecord(undefined, { met: 1, asked: 2, time: 90 })).toEqual({ met: 1, asked: 2, time: 90 });
  });

  it('keeps the most requirements met and the shortest time, each on its own', () => {
    expect(bestRecord({ met: 2, asked: 2, time: 120 }, { met: 1, asked: 2, time: 90 })).toEqual({ met: 2, asked: 2, time: 90 });
  });

  it('one tick for the cabinet signed off, one per requirement met', () => {
    expect(ticksOf({ met: 0, asked: 0, time: 60 })).toBe(1);
    expect(ticksOf({ met: 2, asked: 2, time: 60 })).toBe(3);
  });
});
