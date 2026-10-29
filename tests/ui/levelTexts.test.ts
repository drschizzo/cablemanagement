// The levels are data without a sentence: their words are in ui/levelTexts.ts,
// and none may be missing.
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels/campaign';
import { freeLevel } from '../../src/game/levels/freeLevel';
import { PUZZLES } from '../../src/game/levels/puzzles';
import { hasLevelText, levelTitle } from '../../src/ui/levelTexts';

describe('the words of the levels', () => {
  it('has a title and a brief for every level of the campaign, and every puzzle', () => {
    expect([...LEVELS, ...PUZZLES].filter((l) => !hasLevelText(l.id)).map((l) => l.id)).toEqual([]);
  });

  it('names a generated level after what it is', () => {
    expect(levelTitle(freeLevel(12, 1))).toContain('12 câbles');
  });
});
