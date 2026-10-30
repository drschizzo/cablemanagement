// Smooth noise in two dimensions, the same on every machine: a value at each
// corner of a grid, eased between corners, and summed over octaves.

import { rng } from './random';

/** a value at each corner of the unit grid, in [0, 1), repeating every 256 cells */
const LATTICE = (() => {
  const random = rng(5), t = new Float32Array(256 * 256);
  for (let k = 0; k < t.length; k++) t[k] = random();
  return t;
})();

function lattice(i: number, j: number): number {
  return LATTICE[((i & 255) << 8) | (j & 255)];
}

/** smooth noise in [0, 1) */
export function valueNoise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(i, j), b = lattice(i + 1, j), c = lattice(i, j + 1), d = lattice(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** octaves of noise, each twice as fine and half as strong, in [0, 1) */
export function fbm(x: number, y: number, octaves: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, y);
    norm += amp;
    x *= 2; y *= 2; amp *= 0.5;
  }
  return sum / norm;
}
