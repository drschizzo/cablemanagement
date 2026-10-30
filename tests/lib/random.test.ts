import { describe, expect, it } from 'vitest';
import { rng, seedOf } from '../../src/lib/random';

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

describe('random draws', () => {
  it('a seed always gives the same sequence', () => {
    const a = rng(42), b = rng(42), c = rng(43);
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });
});
