// The progress record is plain data: the rules of the best score are tested
// without a page.
import { describe, expect, it } from 'vitest';
import { endsTheTraining, isUnlocked, levelAfter, nextInStory, recordResult, withMet } from '../../src/progression/progress';
import { levelRules } from '../../src/game/levels/levelRules';
import { TRAINING } from '../../src/game/levels/training';
import { BIG_BAYS } from '../../src/game/levels/bigBays';
import type { Progress } from '../../src/progression/storage';

const empty = (): Progress => ({ stars: {}, times: {} });
const level = TRAINING[0];

describe('the progress record', () => {
  it('keeps the best stars and time, and tells what it held before', () => {
    const p = empty();
    recordResult(p, level, 2, 90);
    const second = recordResult(p, level, 1, 120);
    expect(p.stars[level.id]).toBe(2);
    expect(p.times[level.id]).toBe(90);
    expect(second.previousStars).toBe(2);
  });

});

describe('the training', () => {
  it('opens a level once the one before has two stars', () => {
    const p = empty();
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
    p.stars[TRAINING[0].id] = 1;
    expect(isUnlocked(p, 1)).toBe(false);
    p.stars[TRAINING[0].id] = 2;
    expect(isUnlocked(p, 1)).toBe(true);
  });

  it('knows the level after each one, and none after the last', () => {
    expect(levelAfter(TRAINING[0])).toBe(TRAINING[1]);
    expect(levelAfter(TRAINING[TRAINING.length - 1])).toBeNull();
    expect(levelAfter(BIG_BAYS[0])).toBeNull();
    expect(endsTheTraining(TRAINING[TRAINING.length - 1])).toBe(true);
    expect(endsTheTraining(BIG_BAYS[0])).toBe(false);
  });

  it('the story goes on with the career once the training is tidy', () => {
    const p = empty();
    const career = { done: 0, cabinet: null, stars: [] };
    expect(nextInStory(p, career)).toBe(TRAINING[0]);
    for (const l of TRAINING) p.stars[l.id] = 2;
    expect(nextInStory(p, career)?.id).toBe('career-1');
    expect(nextInStory(p, { ...career, done: 99 })).toBeUndefined();
  });
});

describe('the rules met', () => {
  it('grow with a level signed off, without twice the same', () => {
    const rules = withMet(['leds'], levelRules(TRAINING[2]));
    expect(rules).toContain('maintenance');
    expect(rules.filter((r) => r === 'leds')).toHaveLength(1);
  });
});
