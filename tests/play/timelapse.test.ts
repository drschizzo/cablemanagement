// The timelapse keeps a frame every few seconds, and the whole of a long job.
import { describe, expect, it } from 'vitest';
import { FIRST_INTERVAL, MAX_FRAMES, Timelapse } from '../../src/play/timelapse';

describe('the timelapse of the work', () => {
  it('takes a frame at once, then one every interval', () => {
    const t = new Timelapse<number>();
    expect(t.due(0)).toBe(true);
    t.add(0);
    expect(t.due(FIRST_INTERVAL / 2)).toBe(false);
    expect(t.due(FIRST_INTERVAL / 2)).toBe(true);
  });

  it('a long job: one frame in two goes, the pace halves, the first and the order stay', () => {
    const t = new Timelapse<number>();
    for (let k = 0; k < MAX_FRAMES; k++) t.add(k);
    expect(t.frames.length).toBe(MAX_FRAMES / 2);
    expect(t.interval).toBe(FIRST_INTERVAL * 2);
    expect(t.frames[0]).toBe(0);
    expect([...t.frames].sort((a, b) => a - b)).toEqual(t.frames);
  });
});
