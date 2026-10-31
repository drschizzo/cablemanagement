// The progress record is plain data: what opens the training and where the
// story stands are tested without a page.
import { describe, expect, it } from 'vitest';
import { endsTheTraining, isUnlocked, levelAfter, nextInStory, recordLevel, withMet } from '../../src/progression/progress';
import { levelRules } from '../../src/game/levels/levelRules';
import { TRAINING } from '../../src/game/levels/training';
import { BIG_BAYS } from '../../src/game/levels/bigBays';
import type { Progress } from '../../src/progression/storage';

const empty = (): Progress => ({ levels: {} });
const level = TRAINING[0];
const record = (met: number, time: number) => ({ met, asked: 2, time });

describe('the progress record', () => {
  it('keeps the best of each record', () => {
    const p = empty();
    recordLevel(p, level, record(2, 120));
    recordLevel(p, level, record(1, 90));
    expect(p.levels[level.id]).toEqual(record(2, 90));
  });
});

describe('the training', () => {
  it('opens a level once the one before is signed off', () => {
    const p = empty();
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
    recordLevel(p, TRAINING[0], record(0, 60));
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });

  it('knows the level after each one, and none after the last', () => {
    expect(levelAfter(TRAINING[0])).toBe(TRAINING[1]);
    expect(levelAfter(TRAINING[TRAINING.length - 1])).toBeNull();
    expect(levelAfter(BIG_BAYS[0])).toBeNull();
    expect(endsTheTraining(TRAINING[TRAINING.length - 1])).toBe(true);
    expect(endsTheTraining(BIG_BAYS[0])).toBe(false);
  });

  it('the story goes on with the career once the training is signed off', () => {
    const p = empty();
    const career = { done: 0, cabinet: null, records: [] };
    expect(nextInStory(p, career)).toBe(TRAINING[0]);
    for (const l of TRAINING) recordLevel(p, l, record(0, 60));
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
