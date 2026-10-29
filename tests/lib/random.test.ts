import { describe, expect, it } from 'vitest';
import { seedOf } from '../../src/lib/random';

describe('seeds from a text', () => {
  it('gives the same seed for the same text, another for another', () => {
    expect(seedOf('campaign:l1')).toBe(seedOf('campaign:l1'));
    expect(seedOf('campaign:l1')).not.toBe(seedOf('campaign:l2'));
  });

  it('gives a whole number rng() takes', () => {
    const s = seedOf('career');
    expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });
});
