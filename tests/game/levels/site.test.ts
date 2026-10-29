import { describe, expect, it } from 'vitest';
import { levelSite } from '../../../src/game/levels/site';
import { BIG_BAYS, LEVELS } from '../../../src/game/levels/campaign';
import { PUZZLES } from '../../../src/game/levels/puzzles';
import { TICKETS, ticketLevel } from '../../../src/game/levels/career';

describe('where a level takes place', () => {
  it('every ticket of the career is at the client\'s', () => {
    const sites = new Set(TICKETS.map((_, i) => levelSite(ticketLevel(i, null))));
    expect(sites.size).toBe(1);
  });

  it('every level of the training, the big bays and the puzzles has a room of its own', () => {
    const levels = [...LEVELS, ...BIG_BAYS, ...PUZZLES];
    expect(new Set(levels.map(levelSite)).size).toBe(levels.length);
  });

  it('a level is in the same room each time it is played', () => {
    expect(levelSite(LEVELS[0])).toBe(levelSite({ ...LEVELS[0] }));
  });
});
