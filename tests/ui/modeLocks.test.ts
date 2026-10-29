// The modes open by one rule: the training and free play first, the rest once the training is done.
import { describe, expect, it } from 'vitest';
import { isModeOpen, TRAINING_END, type ModeRecords } from '../../src/ui/modeLocks';

const signedOff = (...ids: string[]): ModeRecords => ({ progress: { stars: Object.fromEntries(ids.map((id) => [id, 1])), times: {}, challenges: {} } });

describe('the game modes', () => {
  it('a first visit has the training and free play', () => {
    expect(isModeOpen('campaign', signedOff())).toBe(true);
    expect(isModeOpen('free', signedOff())).toBe(true);
    for (const mode of ['puzzles', 'daily', 'career', 'big'] as const) expect(isModeOpen(mode, signedOff())).toBe(false);
  });

  it('the others all open with the last level of the training, not before', () => {
    expect(TRAINING_END).toBe('l5');
    for (const mode of ['puzzles', 'daily', 'career', 'big'] as const) {
      expect(isModeOpen(mode, signedOff('l1', 'l2', 'l3', 'l4'))).toBe(false);
      expect(isModeOpen(mode, signedOff('l5'))).toBe(true);
    }
  });
});
