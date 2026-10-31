// The levels are data without a sentence: their words are in ui/levelTexts.ts,
// and none may be missing.
import { describe, expect, it } from 'vitest';
import { BIG_BAYS, LEVELS } from '../../src/game/levels/campaign';
import { freeLevel, plainSpec } from '../../src/game/levels/freeLevel';
import { TICKETS } from '../../src/game/levels/career';
import { hasLevelText, hasTicketText, levelTitle } from '../../src/ui/levelTexts';

describe('the words of the levels', () => {
  it('has a title and a brief for every level of the campaign', () => {
    expect([...LEVELS, ...BIG_BAYS].filter((l) => !hasLevelText(l.id)).map((l) => l.id)).toEqual([]);
  });

  it('has a title and a brief for every ticket of the career', () => {
    expect(TICKETS.every((_, t) => hasTicketText(t))).toBe(true);
  });

  it('names a generated level after what it is', () => {
    expect(levelTitle(freeLevel(plainSpec(12, 1, false)))).toContain('12 câbles');
  });
});
