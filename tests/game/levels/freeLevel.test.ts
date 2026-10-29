// Free play and its zen variant: generated cabinets.
import { describe, expect, it } from 'vitest';
import { freeLevel, zenLevel } from '../../../src/game/levels/freeLevel';

describe('free play', () => {
  it('has as many cords as asked, and a downtime budget', () => {
    const free = freeLevel(12, 3);
    expect(free.cables).toBe(12);
    expect(free.downtime).toBeGreaterThan(0);
  });
});

describe('the zen setting', () => {
  it('has nothing in production and material to spare, whatever its size', () => {
    for (const cables of [8, 36]) {
      const zen = zenLevel(cables, 7);
      expect(zen.kind).toBe('zen');
      expect(zen.cables).toBe(cables);
      expect(zen.downtime).toBeUndefined();
      expect(zen.bypass).toBeUndefined();
      expect(zen.incidents).toBeUndefined();
      expect(zen.inventory.velcro).toBeGreaterThanOrEqual(cables / 3);
    }
  });
});
