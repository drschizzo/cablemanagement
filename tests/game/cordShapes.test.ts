// The shapes a cord is given outside the physics, on hand-made lists of points.
import { describe, expect, it } from 'vitest';
import { coilInCrate, minLengthThrough, shapeForLength } from '../../src/game/cordShapes';
import { polyLength, type V3 } from '../../src/game/idealRoutes';

/** a cord hanging in a V between two connectors 40 cm apart, 1 m above the floor */
const hanging: V3[] = [
  [-0.2, 1, 0.05], [-0.2, 0.98, 0.05],
  [-0.15, 0.9, 0.05], [-0.1, 0.85, 0.05], [0, 0.82, 0.05], [0.1, 0.85, 0.05], [0.15, 0.9, 0.05],
  [0.2, 0.98, 0.05], [0.2, 1, 0.05],
];
const FLOOR = 0;

describe('a cord given another length', () => {
  it('keeps its two ends where they are', () => {
    const out = shapeForLength(hanging, 0.8, FLOOR);
    for (const k of [0, 1, hanging.length - 2, hanging.length - 1]) expect(out[k]).toEqual(hanging[k]);
  });

  it('reaches the length asked for, shorter or longer', () => {
    for (const length of [minLengthThrough(hanging) + 0.01, 0.7, 1.5, 4]) {
      expect(polyLength(shapeForLength(hanging, length, FLOOR))).toBeCloseTo(length, 3);
    }
  });

  it('never goes through the floor: a long cord spreads on it', () => {
    const out = shapeForLength(hanging, 4, FLOOR);
    expect(Math.min(...out.map((p) => p[1]))).toBeGreaterThanOrEqual(FLOOR);
  });

  it('cannot be shorter than the straight path between its boots', () => {
    expect(minLengthThrough(hanging)).toBeCloseTo(0.02 + 0.02 + 0.4 + 0.02, 6);
  });
});

describe('a coil thrown into the crate', () => {
  const crate = { min: [0.4, 0, 0.1] as [number, number, number], max: [0.8, 0.2, 0.5] as [number, number, number] };
  const rests = new Array(40).fill(0.025);
  const fixed = () => 0.5;

  it('has a node at each end of every segment, as long as the cord', () => {
    const points = coilInCrate(crate, rests, 0.003, 0, fixed);
    expect(points).toHaveLength(3 * (rests.length + 1));
  });

  it('lands inside the crate', () => {
    const points = coilInCrate(crate, rests, 0.003, 0, fixed);
    for (let i = 0; i < points.length; i += 3) {
      expect(points[i]).toBeGreaterThan(crate.min[0]);
      expect(points[i]).toBeLessThan(crate.max[0]);
      expect(points[i + 2]).toBeGreaterThan(crate.min[2]);
      expect(points[i + 2]).toBeLessThan(crate.max[2]);
    }
  });

  it('falls a little higher than the coil before it', () => {
    const first = coilInCrate(crate, rests, 0.003, 0, fixed);
    const second = coilInCrate(crate, rests, 0.003, 1, fixed);
    expect(second[1]).toBeGreaterThan(first[1]);
  });
});
