import { describe, it, expect } from 'vitest';
import { polyLength, type V3 } from '../../src/lib/vec3';

describe('polylines', () => {
  const L: V3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0]];

  it('length of a polyline', () => {
    expect(polyLength(L)).toBeCloseTo(7);
    expect(polyLength([[1, 2, 3]])).toBe(0);
  });
});
