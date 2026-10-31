// The page's options are read from a plain string: no browser needed.
import { describe, expect, it } from 'vitest';
import { readUrlOptions } from '../../src/app/urlOptions';
import { SHOWCASE_DEFAULT } from '../../src/game/levels/showcaseRack';
import { QUALITY } from '../../src/render/quality';

describe('the options of the page address', () => {
  it('has defaults when the address carries none', () => {
    expect(readUrlOptions('')).toEqual({ syncPhysics: false, bays: SHOWCASE_DEFAULT.bays, pairs: 0, seed: 0, quality: null, rack: null, forceWebGL: false, hdr: null });
  });

  it('reads them, and keeps the numbers within bounds', () => {
    expect(readUrlOptions('?sync&bays=3&pairs=6&seed=42&quality=2&rack=bpsu.4.e.1.0.a&webgl&hdr=1')).toEqual({ syncPhysics: true, bays: 3, pairs: 6, seed: 42, quality: 2, rack: 'bpsu.4.e.1.0.a', forceWebGL: true, hdr: true });
    expect(readUrlOptions('?hdr=0').hdr).toBe(false);
    expect(readUrlOptions('?bays=99&pairs=99&quality=99')).toMatchObject({ bays: 32, pairs: 16, quality: QUALITY.length - 1 });
    expect(readUrlOptions('?bays=abc')).toMatchObject({ bays: SHOWCASE_DEFAULT.bays });
  });

  it('keeps whole numbers only: a quality between two levels is none', () => {
    const o = readUrlOptions('?bays=2.5&pairs=6.7&quality=1.5');
    expect(o).toMatchObject({ bays: 2, pairs: 6, quality: 1 });
    expect(QUALITY[o.quality!]).toBeDefined();
    expect(readUrlOptions('?quality=-0.5&bays=0').quality).toBe(0);
    expect(readUrlOptions('?bays=0').bays).toBe(SHOWCASE_DEFAULT.bays);
    expect(readUrlOptions('?bays=-4').bays).toBe(1);
  });
});
