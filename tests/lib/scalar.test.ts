import { describe, expect, it } from 'vitest';
import { smoothstep } from '../../src/lib/scalar';

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
