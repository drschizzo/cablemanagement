import { describe, expect, it } from 'vitest';
import { World } from '../../../src/game/world';
import { SHOWCASE_DEFAULT, showcaseRack } from '../../../src/game/levels/showcaseRack';
import { decode, encode, printOf } from '../../../src/game/mess/baked';

// (Node's own module, untyped here: the project has no Node types)
const node = (m: string) => import(m);

describe('baked aisle', () => {
  it('keeps positions to 0.1 mm', () => {
    // a chain of nodes a few cm apart, as a cord
    const x = new Float64Array(300);
    for (let i = 3; i < x.length; i++) x[i] = x[i - 3] + Math.sin(i) * 0.03;
    const [back] = decode(encode([{ print: 42, x }]).slice().buffer);
    expect(back.print).toBe(42);
    for (let i = 0; i < x.length; i++) expect(Math.abs(back.x[i] - x[i])).toBeLessThanOrEqual(0.5e-4 + 1e-12);
  });

  it('refuses a step it cannot hold', () => {
    expect(() => encode([{ print: 0, x: Float64Array.of(0, 0, 0, 4, 0, 0) }])).toThrow();
  });

  it('is up to date with the mess of the default aisle (else: npm run bake)', async () => {
    const { readFileSync } = await node('node:fs');
    const { gunzipSync } = await node('node:zlib');
    const bytes: Uint8Array = gunzipSync(readFileSync('src/game/mess/showcase.bin'));
    const bays = decode(bytes.slice().buffer);
    expect(bays.length).toBe(SHOWCASE_DEFAULT.bays);
    bays.forEach((b, k) => {
      const w = new World(showcaseRack('mess', SHOWCASE_DEFAULT.seed + k, SHOWCASE_DEFAULT.pairs[k]));
      expect(b.x.length).toBe(w.sim.x.length);
      expect(b.print).toBe(printOf(w.sim.x));
      w.dispose();
    });
  });
});
