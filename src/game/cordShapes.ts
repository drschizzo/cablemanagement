// The shapes a cord is given outside the physics: swapped for another length
// in place, or coiled and thrown into the crate. Pure geometry on lists of
// points, so that it can be tested on its own.

import { polyLength, type V3 } from './idealRoutes';

/** how much longer than the straight path between its boots the shortest cord is (m) */
const MIN_LENGTH_PLAY = 0.02;

/** the shortest cord through these points: connector, boot, straight to the other boot, connector */
export function minLengthThrough(points: V3[]): number {
  const n = points.length;
  return dist(points[0], points[1]) + dist(points[1], points[n - 2]) + dist(points[n - 2], points[n - 1]) + MIN_LENGTH_PLAY;
}

/**
 * A cord through `points` given another `length`, its two ends where they are
 * (connector and boot). Shorter, it takes a shape between its current one and
 * the straight line between its boots; longer, the extra hangs as a belly,
 * which spreads forward on the floor (`floorY`: the lowest a node may lie).
 * The length is reached by bisection on how far the shape goes.
 */
export function shapeForLength(points: V3[], length: number, floorY: number): V3[] {
  const n = points.length;
  const a = points[1], b = points[n - 2];
  // straight route and belly direction, per node (by arc fraction between the boots)
  const cum = [0];
  for (let k = 2; k < n - 1; k++) cum.push(cum[cum.length - 1] + dist(points[k], points[k - 1]));
  const total = cum[cum.length - 1] || 1;
  const fraction = (k: number) => (k <= 1 ? 0 : k >= n - 2 ? 1 : cum[k - 1] / total);
  /** t in 0..1: from the straight line to the current shape; above 1: a belly growing */
  const shape = (t: number): V3[] => points.map((p, k) => {
    if (k <= 1 || k >= n - 2) return p;
    const f = fraction(k);
    if (t <= 1) {
      const s: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      return [s[0] + (p[0] - s[0]) * t, s[1] + (p[1] - s[1]) * t, s[2] + (p[2] - s[2]) * t];
    }
    // the belly hangs down, and forward once it meets the floor
    const sag = Math.sin(Math.PI * f) * (t - 1);
    const y = p[1] - sag;
    return y >= floorY ? [p[0], y, p[2] + sag * 0.25] : [p[0], floorY, p[2] + sag * 0.25 + (floorY - y)];
  });
  let lo = 0, hi = 1;
  if (polyLength(shape(1)) < length) {
    hi = 2;
    while (polyLength(shape(hi)) < length && hi < 64) hi = 1 + (hi - 1) * 2;
    lo = 1;
  }
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    if (polyLength(shape(mid)) < length) lo = mid; else hi = mid;
  }
  return shape((lo + hi) / 2);
}

/** the inside of the crate (m) */
export interface CrateBox {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * A coil of cord, as it comes out of its bag, at a random spot of the crate:
 * the nodes (x, y, z flat) for segments of these `rests` lengths. `pileIndex`
 * drops each coil a little higher than the last, so that they pile up.
 */
export function coilInCrate(crate: CrateBox, rests: number[], cordRadius: number, pileIndex: number, random: () => number = Math.random): number[] {
  const R = 0.055 + random() * 0.02;
  const cx = crate.min[0] + R + 0.02 + random() * (crate.max[0] - crate.min[0] - 2 * R - 0.04);
  const cz = crate.min[2] + R + 0.02 + random() * (crate.max[2] - crate.min[2] - 2 * R - 0.04);
  const y0 = crate.min[1] + 0.03 + (pileIndex % 8) * 0.012;
  const tilt = (random() - 0.5) * 0.4;
  const out: number[] = [];
  let s = 0;
  for (let k = 0; k <= rests.length; k++) {
    const angle = s / R;
    out.push(cx + Math.cos(angle) * R, y0 + (angle / (2 * Math.PI)) * cordRadius * 2.6 + Math.sin(angle) * R * tilt, cz + Math.sin(angle) * R);
    if (k < rests.length) s += rests[k];
  }
  return out;
}

function dist(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
