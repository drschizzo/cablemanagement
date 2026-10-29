// The rules a level plays by, read from what the level is.
import { describe, expect, it } from 'vitest';
import { levelRules } from '../../../src/game/levels/levelRules';
import { LEVELS } from '../../../src/game/levels/campaign';
import { PUZZLES } from '../../../src/game/levels/puzzles';
import { freeLevel } from '../../../src/game/levels/freeLevel';

const byId = (id: string) => [...LEVELS, ...PUZZLES].find((l) => l.id === id)!;

describe('the rules of a level', () => {
  it('every cabinet has its LEDs and its taut cords', () => {
    for (const level of [...LEVELS, ...PUZZLES]) expect(levelRules(level)).toEqual(expect.arrayContaining(['leds', 'taut']));
  });

  it('production comes with its bypass at level 3', () => {
    expect(levelRules(LEVELS[2])).toEqual(expect.arrayContaining(['maintenance', 'bypass']));
  });

  it('reads each rule from what the level is', () => {
    expect(levelRules(byId('l5'))).toContain('kinked');
    expect(levelRules(byId('l6'))).toContain('bundles');
    expect(levelRules(byId('l8'))).toContain('blind');
    expect(levelRules(byId('p9'))).toContain('faults');
    expect(levelRules(byId('p10'))).toContain('power');
    expect(levelRules(freeLevel(12, 1))).toContain('incidents');
    expect(levelRules(freeLevel(4, 1))).not.toContain('incidents');
  });
});
