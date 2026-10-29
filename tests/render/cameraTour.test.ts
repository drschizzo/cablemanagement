// The flight round a signed-off cabinet starts and ends at the front view.
import { describe, expect, it } from 'vitest';
import { CameraTour, tourPose } from '../../src/render/cameraTour';

describe('the tour round the cabinet', () => {
  it('leaves from the front and comes back to it', () => {
    for (const t of [0, 1]) {
      const p = tourPose(t);
      expect(Math.abs(p.yaw)).toBeLessThan(1e-9);
      expect(Math.abs(p.pitch)).toBeLessThan(1e-9);
      expect(p.zoom).toBeCloseTo(1);
    }
  });

  it('swings to both sides on the way', () => {
    const yaws = Array.from({ length: 50 }, (_, k) => tourPose(k / 49).yaw);
    expect(Math.max(...yaws)).toBeGreaterThan(0.3);
    expect(Math.min(...yaws)).toBeLessThan(-0.2);
  });

  it('ends once, when its time is up or when it is broken off', () => {
    let ended = 0;
    const tour = new CameraTour(1, () => ended++);
    expect(tour.advance(0.5)).not.toBeNull();
    expect(tour.advance(0.6)).toBeNull();
    tour.end();
    expect(ended).toBe(1);
  });
});
