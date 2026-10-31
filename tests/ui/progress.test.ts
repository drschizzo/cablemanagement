// The progress record is plain data: the rules of the best score are tested
// without a page.
import { describe, expect, it } from 'vitest';
import { endsTheTraining, isUnlocked, knownGestures, knownRules, levelAfter, nextInStory, recordResult, withMet } from '../../src/ui/progress';
import { levelRules } from '../../src/game/levels/levelRules';
import { BIG_BAYS, LEVELS } from '../../src/game/levels/campaign';
import type { Progress } from '../../src/ui/storage';

const empty = (): Progress => ({ stars: {}, times: {} });
const level = LEVELS[0];

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
    p.stars[LEVELS[0].id] = 1;
    expect(isUnlocked(p, 1)).toBe(false);
    p.stars[LEVELS[0].id] = 2;
    expect(isUnlocked(p, 1)).toBe(true);
  });

  it('knows the level after each one, and none after the last', () => {
    expect(levelAfter(LEVELS[0])).toBe(LEVELS[1]);
    expect(levelAfter(LEVELS[LEVELS.length - 1])).toBeNull();
    expect(levelAfter(BIG_BAYS[0])).toBeNull();
    expect(endsTheTraining(LEVELS[LEVELS.length - 1])).toBe(true);
    expect(endsTheTraining(BIG_BAYS[0])).toBe(false);
  });

  it('the story goes on with the career once the training is tidy', () => {
    const p = empty();
    const career = { done: 0, cabinet: null, stars: [] };
    expect(nextInStory(p, career)).toBe(LEVELS[0]);
    for (const l of LEVELS) p.stars[l.id] = 2;
    expect(nextInStory(p, career)?.id).toBe('career-1');
    expect(nextInStory(p, { ...career, done: 99 })).toBeUndefined();
  });
});

describe('the rules met', () => {
  it('are those saved, and those of the levels signed off', () => {
    const p = empty();
    p.stars[LEVELS[2].id] = 1;
    const known = knownRules(['power'], p);
    expect(known.has('power')).toBe(true);
    expect(known.has('maintenance')).toBe(true);
    expect(known.has('blind')).toBe(false);
  });

  it('grow with a level signed off, without twice the same', () => {
    const rules = withMet(['leds'], levelRules(LEVELS[2]));
    expect(rules).toContain('maintenance');
    expect(rules.filter((r) => r === 'leds')).toHaveLength(1);
  });

  it('the gestures of a level signed off are known, as its rules', () => {
    const p = empty();
    expect(knownGestures([], p).has('duct')).toBe(false);
    p.stars[LEVELS[1].id] = 2;
    expect(knownGestures([], p).has('duct')).toBe(true);
  });
});
