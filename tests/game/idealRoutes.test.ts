import { describe, it, expect } from 'vitest';
import { pathToNodes, resample } from '../../src/game/idealRoutes';
import type { V3 } from '../../src/lib/vec3';

describe('polylines', () => {
  const L: V3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0]];

  it('resampling at arc lengths, scaled to the polyline', () => {
    const out = new Float64Array(9);
    resample(L, [0, 1.75, 3.5], out, 0); // arcs 0..3.5 spread over 7 m
    expect([...out]).toEqual([0, 0, 0, 3, 0.5, 0, 3, 4, 0].map((v) => expect.closeTo(v, 9)));
  });

  it('a cord laid on a route keeps its two pins and segments of about `seg`', () => {
    const route: V3[] = [[0, 0, 0.034], [0, 0, 0.059], [0, -0.2, 0.06], [0.3, -0.2, 0.06], [0.3, 0, 0.059], [0.3, 0, 0.034]];
    const pts = pathToNodes(route, 0.025);
    const n = pts.length / 3;
    expect(pts.slice(0, 3)).toEqual(route[0]);
    expect(pts.slice(-3)).toEqual(route[5]);
    const segs = [];
    for (let k = 2; k < n - 1; k++) segs.push(Math.hypot(pts[3 * k] - pts[3 * k - 3], pts[3 * k + 1] - pts[3 * k - 2], pts[3 * k + 2] - pts[3 * k - 1]));
    for (const s of segs) expect(s).toBeLessThan(0.03);
  });
});
