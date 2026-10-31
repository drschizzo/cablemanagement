// The modes open by one rule: the training and free play first, the career once the training is done.
import { describe, expect, it } from 'vitest';
import { isModeOpen } from '../../src/ui/modeLocks';
import type { Progress } from '../../src/ui/storage';

const signedOff = (...ids: string[]): Progress => ({ stars: Object.fromEntries(ids.map((id) => [id, 1])), times: {} });

describe('the game modes', () => {
  it('a first visit has the training and free play', () => {
    expect(isModeOpen('campaign', signedOff())).toBe(true);
    expect(isModeOpen('free', signedOff())).toBe(true);
    expect(isModeOpen('career', signedOff())).toBe(false);
  });

  it('the career opens with the last level of the training, not before', () => {
    expect(isModeOpen('career', signedOff('l1', 'l2', 'l3', 'l4'))).toBe(false);
    expect(isModeOpen('career', signedOff('l5'))).toBe(true);
  });
});
