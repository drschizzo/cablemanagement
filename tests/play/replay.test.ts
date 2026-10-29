// The replay of the work: where the keys fall in it, and the cords between two.
import { describe, expect, it } from 'vitest';
import { keyAt, keyTimes, nodesBetween, type CordLayout, type ReplayKey } from '../../src/play/replay';

const layout: CordLayout = { cables: [], cableOf: new Int32Array(1), segOK: new Uint8Array(1), radius: new Float64Array(1) };

/** a key of one node at `x` (on the x axis), `t` s into the play */
function key(t: number, x: number, l = layout): ReplayKey {
  return { t, x: Float32Array.of(x, 0, 0), layout: l, ends: [], straps: [], items: { version: 0, slots: [] }, leds: new Map() };
}

describe('the replay of the work', () => {
  it('spends its length where the cords moved, not on the waits', () => {
    // a long wait, then a move
    const keys = [key(0, 0), key(50, 0), key(51, 1)];
    const times = keyTimes(keys);
    expect(times[0]).toBe(0);
    expect(times[2]).toBeCloseTo(1);
    // the wait gets only its share of the time of play
    expect(times[1]).toBeLessThan(0.35);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('finds the key before a moment, and how far to the next', () => {
    const times = [0, 0.25, 1];
    expect(keyAt(times, 0)).toEqual({ i: 0, f: 0 });
    const at = keyAt(times, 0.625);
    expect(at.i).toBe(1);
    expect(at.f).toBeCloseTo(0.5);
    expect(keyAt(times, 1)).toEqual({ i: 2, f: 0 });
  });

  it('goes through every key, smoothly between', () => {
    const keys = [key(0, 0), key(1, 1), key(2, 2), key(3, 3)];
    const out = new Float64Array(3);
    nodesBetween(keys, 1, 0, out);
    expect(out[0]).toBeCloseTo(1);
    nodesBetween(keys, 1, 1, out);
    expect(out[0]).toBeCloseTo(2);
    // a steady move stays steady
    nodesBetween(keys, 1, 0.3, out);
    expect(out[0]).toBeCloseTo(1.3);
  });

  it('does not reach across a new set of cords', () => {
    const other: CordLayout = { ...layout };
    const keys = [key(0, 5, other), key(1, 1), key(2, 2), key(3, 9, other)];
    const out = new Float64Array(3);
    nodesBetween(keys, 1, 0.5, out);
    expect(out[0]).toBeCloseTo(1.5);
  });
});
