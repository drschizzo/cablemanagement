// The comb's lanes: even, in the order the cords crossed it, along the way it took.
import { describe, expect, it } from 'vitest';
import { CombStroke, laneOffsets, nearestOnWay } from '../../src/game/comb';
import { World } from '../../src/game/world';
import { LEVELS } from '../../src/game/levels/campaign';

describe('the cable comb', () => {
  it('gives each cord a lane, gap apart, centred, in the order they crossed it', () => {
    const lanes = laneOffsets(new Map([[7, 0.03], [2, -0.02], [5, 0]]), 0.01);
    expect([...lanes]).toEqual([[2, -0.01], [5, 0], [7, 0.01]]);
  });

  it('finds the point of its way nearest a node, and the way\'s direction there', () => {
    const { at, dir } = nearestOnWay([[0, 0, 0.05], [0, 0.1, 0.05], [0.1, 0.1, 0.05]], [0.02, 0.04, 0.08]);
    expect(at[0]).toBeCloseTo(0);
    expect(at[1]).toBeCloseTo(0.04);
    expect(dir).toEqual([0, 1, 0]);
  });

  it('holds the cords in its teeth, lays them on release, and lets them all go in the end', () => {
    const w = new World({ ...LEVELS[0], wrong: 0, loose: 0 });
    w.preroll(60);
    const cb = w.cables[0];
    const at = w.nodePosition(cb.start + Math.floor(cb.count / 2));
    const stroke = new CombStroke(w);
    expect(stroke.move(at, [0, 1, 0])).toBeGreaterThanOrEqual(1);
    expect(w.sim.goalW.some((g) => g > 0)).toBe(true);
    for (let k = 1; k < 10; k++) stroke.move([at[0], at[1] + k * 0.004, at[2]], [0, 1, 0]);
    stroke.release();
    expect(w.sim.goalW.some((g) => g > 0)).toBe(true);
    let done = false;
    for (let t = 0; t < 120 && !done; t++) done = stroke.step(1 / 60);
    expect(done).toBe(true);
    expect(w.sim.goalW.every((g) => g === 0)).toBe(true);
    w.dispose();
  });
});
