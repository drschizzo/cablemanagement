import { describe, expect, it } from 'vitest';
import { ALBEDO_RANGE, tileData } from '../../src/render/floorTextures';
import { rng } from '../../src/lib/random';

/** a tile 600 mm a side, 5 mm a texel */
const N = 120, MM = 600 / N;
const texel = (x: number, y: number) => 4 * (y * N + x);

describe('the maps of a floor tile', () => {
  const plain = tileData(N, MM, rng(1), () => null);

  it('faces up in the middle of its laminate', () => {
    const o = texel(N / 2, N / 2);
    expect(Math.abs(plain.normal[o] - 128)).toBeLessThan(8);
    expect(Math.abs(plain.normal[o + 1] - 128)).toBeLessThan(8);
    expect(plain.normal[o + 2]).toBeGreaterThan(250);
  });

  it('darkens at the joint with its neighbours', () => {
    expect(plain.surface[texel(0, N / 2)]).toBeLessThan(plain.surface[texel(N / 2, N / 2)]);
  });

  it('stores its colour over ALBEDO_RANGE', () => {
    // the laminate is about 0.97 of the floor's colour
    expect(Math.abs(plain.surface[texel(N / 2, N / 2)] - 255 * 0.97 / ALBEDO_RANGE)).toBeLessThan(20);
  });

  it('takes what a feature puts in place of the laminate', () => {
    const holed = tileData(N, MM, rng(1), (xm, ym) => (Math.hypot(xm - 300, ym - 300) < 20 ? { height: -4, albedo: 0.05, roughness: 1 } : null));
    const o = texel(N / 2, N / 2);
    expect(holed.surface[o]).toBeLessThan(10);
    expect(holed.surface[o + 1]).toBe(255);
  });
});
