// The progress record is plain data: the rules of the best score are tested
// without a page.
import { describe, expect, it } from 'vitest';
import { isUnlocked, knownGestures, knownRules, levelAfter, recordResult, withMet } from '../../src/ui/progress';
import { levelRules } from '../../src/game/levels/levelRules';
import { PUZZLES } from '../../src/game/levels/puzzles';
import { LEVELS } from '../../src/game/levels/campaign';
import type { Progress } from '../../src/ui/storage';

const empty = (): Progress => ({ stars: {}, times: {}, challenges: {}, notes: {} });
const level = { ...LEVELS[0], par: 100 };

describe('the progress record', () => {
  it('keeps the best stars, time and note, and tells what it held before', () => {
    const p = empty();
    recordResult(p, level, 2, 90, 10, 60);
    const second = recordResult(p, level, 1, 120, 10, 70);
    expect(p.stars[level.id]).toBe(2);
    expect(p.times[level.id]).toBe(90);
    expect(p.notes[level.id]).toBe(70);
    expect(second.previousStars).toBe(2);
    expect(second.previousNote).toBe(60);
  });

  it('a first result has no previous note', () => {
    expect(recordResult(empty(), level, 1, 50, 10, 40).previousNote).toBeUndefined();
  });

  it('wins the time challenge with three stars within the time', () => {
    const p = empty();
    expect(recordResult(p, level, 2, 50, 10, 0).challengeWon).toBe(false);
    expect(recordResult(p, level, 3, 150, 10, 0).challengeWon).toBe(false);
    expect(recordResult(p, level, 3, 80, 10, 0).challengeWon).toBe(true);
    expect(p.challenges[level.id]).toBe(true);
  });

  it('wins the gestures challenge of a puzzle with three stars in few enough gestures', () => {
    const puzzle = { ...PUZZLES[2], moves: 4 };
    expect(recordResult(empty(), puzzle, 3, 999, 5, 0).challengeWon).toBe(false);
    expect(recordResult(empty(), puzzle, 2, 10, 2, 0).challengeWon).toBe(false);
    expect(recordResult(empty(), puzzle, 3, 999, 4, 0).challengeWon).toBe(true);
  });
});

describe('the campaign', () => {
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
