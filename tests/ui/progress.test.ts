// The progress record is plain data: the rules of the best score are tested
// without a page.
import { describe, expect, it } from 'vitest';
import { endsTheTraining, isUnlocked, knownGestures, knownRules, levelAfter, nextInStory, recordResult, withMet } from '../../src/ui/progress';
import { levelRules } from '../../src/game/levels/levelRules';
import { PUZZLES } from '../../src/game/levels/puzzles';
import { BIG_BAYS, LEVELS } from '../../src/game/levels/campaign';
import type { Progress } from '../../src/ui/storage';

const empty = (): Progress => ({ stars: {}, times: {}, challenges: {} });
const level = { ...LEVELS[0], par: 100 };

describe('the progress record', () => {
  it('keeps the best stars and time, and tells what it held before', () => {
    const p = empty();
    recordResult(p, level, 2, 90, 10);
    const second = recordResult(p, level, 1, 120, 10);
    expect(p.stars[level.id]).toBe(2);
    expect(p.times[level.id]).toBe(90);
    expect(second.previousStars).toBe(2);
  });

  it('wins the time challenge with three stars within the time', () => {
    const p = empty();
    expect(recordResult(p, level, 2, 50, 10).challengeWon).toBe(false);
    expect(recordResult(p, level, 3, 150, 10).challengeWon).toBe(false);
    expect(recordResult(p, level, 3, 80, 10).challengeWon).toBe(true);
    expect(p.challenges[level.id]).toBe(true);
  });

  it('wins the gestures challenge of a puzzle with three stars in few enough gestures', () => {
    const puzzle = { ...PUZZLES[2], moves: 4 };
    expect(recordResult(empty(), puzzle, 3, 999, 5).challengeWon).toBe(false);
    expect(recordResult(empty(), puzzle, 2, 10, 2).challengeWon).toBe(false);
    expect(recordResult(empty(), puzzle, 3, 999, 4).challengeWon).toBe(true);
  });
});

describe('the training and the big cabinets', () => {
  it('opens a level once the one before has two stars', () => {
    const p = empty();
    expect(isUnlocked(p, LEVELS, 0)).toBe(true);
    expect(isUnlocked(p, LEVELS, 1)).toBe(false);
    p.stars[LEVELS[0].id] = 1;
    expect(isUnlocked(p, LEVELS, 1)).toBe(false);
    p.stars[LEVELS[0].id] = 2;
    expect(isUnlocked(p, LEVELS, 1)).toBe(true);
    expect(isUnlocked(p, BIG_BAYS, 0)).toBe(true);
    expect(isUnlocked(p, BIG_BAYS, 1)).toBe(false);
  });

  it('knows the level after each one, and none after the last of its list', () => {
    expect(levelAfter(LEVELS[0])).toBe(LEVELS[1]);
    expect(levelAfter(LEVELS[LEVELS.length - 1])).toBeNull();
    expect(levelAfter(BIG_BAYS[0])).toBe(BIG_BAYS[1]);
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
    expect(knownGestures(['velcro'], p).has('velcro')).toBe(true);
  });
});
