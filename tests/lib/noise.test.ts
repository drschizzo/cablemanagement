import { describe, expect, it } from 'vitest';
import { fbm, valueNoise } from '../../src/lib/noise';

describe('value noise', () => {
  it('stays in [0, 1), the same at the same point', () => {
    for (let k = 0; k < 500; k++) {
      const x = k * 0.37 - 90, y = k * 1.13 - 40;
      const v = valueNoise(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(valueNoise(x, y)).toBe(v);
    }
  });

  it('changes smoothly: no step between two close points', () => {
    for (let k = 0; k < 200; k++) {
      const x = k * 0.071, y = k * 0.043;
      expect(Math.abs(valueNoise(x + 1e-4, y) - valueNoise(x, y))).toBeLessThan(1e-2);
    }
  });

  it('sums octaves into [0, 1) as well', () => {
    for (let k = 0; k < 200; k++) {
      const v = fbm(k * 0.21, k * 0.17, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
