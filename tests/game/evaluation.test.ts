import { describe, expect, it } from 'vitest';
import { cleanliness, type Evaluation } from '../../src/game/evaluation';

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
