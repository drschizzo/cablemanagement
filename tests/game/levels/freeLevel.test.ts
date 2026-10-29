// Free play and its zen variant: generated cabinets.
import { describe, expect, it } from 'vitest';
import { ZEN_CORDS, freeLevel, zenLevel } from '../../../src/game/levels/freeLevel';

describe('free play', () => {
  it('has as many cords as asked, and a downtime budget', () => {
    const free = freeLevel(12, 3);
    expect(free.cables).toBe(12);
    expect(free.downtime).toBeGreaterThan(0);
  });
});

describe('the zen cabinet', () => {
  it('has nothing in production and material to spare', () => {
    const zen = zenLevel(7);
    expect(zen.kind).toBe('zen');
    expect(zen.cables).toBe(ZEN_CORDS);
    expect(zen.downtime).toBeUndefined();
    expect(zen.bypass).toBeUndefined();
    expect(zen.inventory.velcro).toBeGreaterThanOrEqual(ZEN_CORDS / 3);
  });
});
