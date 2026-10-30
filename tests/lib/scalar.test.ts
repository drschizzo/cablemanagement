import { describe, expect, it } from 'vitest';
import { fractionalPart, smoothstep } from '../../src/lib/scalar';

describe('smoothstep', () => {
  it('is 0 below a, 1 above b, a half between', () => {
    expect(smoothstep(1, 3, 0)).toBe(0);
    expect(smoothstep(1, 3, 4)).toBe(1);
    expect(smoothstep(1, 3, 2)).toBe(0.5);
  });

  it('turns round when a > b', () => {
    expect(smoothstep(3, 1, 0)).toBe(1);
    expect(smoothstep(3, 1, 4)).toBe(0);
  });
});

describe('fractional part', () => {
  it('is in [0, 1), below 0 too', () => {
    expect(fractionalPart(2.25)).toBe(0.25);
    expect(fractionalPart(-0.25)).toBe(0.75);
    expect(fractionalPart(3)).toBe(0);
  });
});
