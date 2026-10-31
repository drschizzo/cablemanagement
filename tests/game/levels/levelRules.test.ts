// The rules a level plays by, and the training as a ladder: each level adds
// its own, the first ones are plugging and tidying only.
import { describe, expect, it } from 'vitest';
import { levelRules } from '../../../src/game/levels/levelRules';
import { BIG_BAYS, LEVELS } from '../../../src/game/levels/campaign';
import { freeLevel, plainSpec } from '../../../src/game/levels/freeLevel';

const byId = (id: string) => [...LEVELS, ...BIG_BAYS].find((l) => l.id === id)!;

describe('the rules of a level', () => {
  it('every cabinet has its LEDs and its taut cords', () => {
    for (const level of [...LEVELS, ...BIG_BAYS]) expect(levelRules(level)).toEqual(expect.arrayContaining(['leds', 'taut']));
  });

  it('the first two levels of the training have nothing in production', () => {
    expect(levelRules(LEVELS[0])).toEqual(['leds', 'taut']);
    expect(levelRules(LEVELS[1])).not.toContain('maintenance');
  });

  it('production comes with its bypass at level 3', () => {
    expect(levelRules(LEVELS[2])).toEqual(expect.arrayContaining(['maintenance', 'bypass']));
  });

  it('reads each rule from what the level is', () => {
    expect(levelRules(byId('l5'))).toContain('kinked');
    expect(levelRules(byId('l8'))).toContain('blind');
    expect(levelRules(byId('l5'))).toContain('separation');
    expect(levelRules(byId('l4'))).not.toContain('separation');
    expect(levelRules(freeLevel(plainSpec(12, 1, true)))).toContain('incidents');
    expect(levelRules(freeLevel(plainSpec(16, 1, true)))).toContain('faults');
    expect(levelRules(freeLevel(plainSpec(4, 1, true)))).not.toContain('incidents');
    expect(levelRules(freeLevel(plainSpec(16, 1, false)))).not.toContain('maintenance');
  });

  it('the duct is told where the level first gives one', () => {
    expect(levelRules(LEVELS[0])).not.toContain('duct');
    expect(levelRules(LEVELS[1])).toContain('duct');
  });
});
