import { describe, expect, it } from 'vitest';
import { closest, segSeg } from 'avbd-cables';
import { CableSim, type StaticShape } from '../src/physics/cableSim';

// The solver on its own, without the cabinet: cords, boxes and rods.

const SEG = 0.025;
const R = 0.0022;

/** a straight cord from a to b, nodes SEG apart */
function cord(a: [number, number, number], b: [number, number, number]): number[] {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / SEG) + 1);
  const pts: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    pts.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  return pts;
}

function run(sim: CableSim, seconds: number): void {
  const n = Math.round(seconds / sim.P.dt);
  for (let k = 0; k < n; k++) sim.step();
}

/** the worst relative stretch of a segment */
function stretch(sim: CableSim): number {
  let worst = 0;
  for (let i = 0; i < sim.n; i++) {
    if (!sim.segOK[i]) continue;
    const d = Math.hypot(sim.x[3 * i] - sim.x[3 * i + 3], sim.x[3 * i + 1] - sim.x[3 * i + 4], sim.x[3 * i + 2] - sim.x[3 * i + 5]);
    worst = Math.max(worst, Math.abs(d - sim.rest[i]) / sim.rest[i]);
  }
  return worst;
}

/** the deepest two segments of different cords go into one another (m) */
function overlap(sim: CableSim): number {
  let worst = 0;
  const x = sim.x;
  for (let a = 0; a < sim.n; a++) {
    if (!sim.segOK[a]) continue;
    for (let b = a + 1; b < sim.n; b++) {
      if (!sim.segOK[b] || sim.cableOf[a] === sim.cableOf[b]) continue;
      segSeg(x[3 * a], x[3 * a + 1], x[3 * a + 2], x[3 * a + 3], x[3 * a + 4], x[3 * a + 5],
        x[3 * b], x[3 * b + 1], x[3 * b + 2], x[3 * b + 3], x[3 * b + 4], x[3 * b + 5]);
      worst = Math.max(worst, sim.radius[a] + sim.radius[b] - Math.sqrt(closest.d2));
    }
  }
  return worst;
}

function lowest(sim: CableSim): number {
  let y = Infinity;
  for (let i = 0; i < sim.n; i++) y = Math.min(y, sim.x[3 * i + 1]);
  return y;
}

const floor: StaticShape = { kind: 'box', min: [-1, -0.1, -1], max: [1, 0, 1] };

describe('cable solver', () => {
  it('a cord dropped on a floor lies on it, unstretched, and falls asleep', () => {
    const sim = new CableSim();
    sim.build([{ points: cord([-0.3, 0.2, 0], [0.3, 0.2, 0]), radius: R }]);
    sim.setStatics([floor]);
    run(sim, 3);
    expect(lowest(sim)).toBeGreaterThan(R - 0.001);
    expect(lowest(sim)).toBeLessThan(R + 0.002);
    expect(stretch(sim)).toBeLessThan(0.01);
    expect(sim.cables[0].asleep).toBe(true);
  });

  // (up to marginStatic a frame: 3.6 m/s at 60 Hz)
  it('a fast cord does not pass through a thin plate', () => {
    const sim = new CableSim();
    sim.build([{ points: cord([-0.3, 0.1, 0], [0.3, 0.1, 0]), radius: R }]);
    for (let i = 0; i < sim.n; i++) sim.v[3 * i + 1] = -3;
    sim.setStatics([{ kind: 'box', min: [-1, -0.004, -1], max: [1, 0, 1] }]);
    run(sim, 1);
    expect(lowest(sim)).toBeGreaterThan(0);
  });

  it('a cord pinned at both ends hangs without stretching, and comes to rest', () => {
    const sim = new CableSim();
    // 0.6 m apart, 0.75 m of cord: slack, so it sags
    const pts = cord([-0.375, 0.5, 0], [0.375, 0.5, 0]);
    sim.build([{ points: pts, radius: R }]);
    const last = sim.n - 1;
    sim.pin(0, -0.3, 0.5, 0);
    sim.pin(last, 0.3, 0.5, 0);
    run(sim, 4);
    expect(sim.x[3 * (last >> 1) + 1]).toBeLessThan(0.4);
    expect(stretch(sim)).toBeLessThan(0.01);
    expect(sim.cables[0].asleep).toBe(true);
  });

  it('a cord dropped across a rod hangs on it', () => {
    const sim = new CableSim();
    sim.build([{ points: cord([-0.2, 0.1, 0], [0.2, 0.1, 0]), radius: R }]);
    sim.setStatics([{ kind: 'capsule', ax: 0, ay: 0, az: -0.2, bx: 0, by: 0, bz: 0.2, r: 0.01 }]);
    run(sim, 3);
    const mid = sim.n >> 1;
    // its middle on the rod, its ends hanging down either side
    expect(sim.x[3 * mid + 1]).toBeGreaterThan(0.01);
    expect(sim.x[1]).toBeLessThan(-0.05);
    expect(sim.x[3 * (sim.n - 1) + 1]).toBeLessThan(-0.05);
    expect(stretch(sim)).toBeLessThan(0.01);
  });

  it('cords dropped on one another pile up without going through', () => {
    const sim = new CableSim();
    const defs = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 6;
      const c = Math.cos(a) * 0.25, s = Math.sin(a) * 0.25;
      defs.push({ points: cord([-c, 0.02 + 0.03 * k, -s], [c, 0.02 + 0.03 * k, s]), radius: R });
    }
    sim.build(defs);
    sim.setStatics([floor]);
    run(sim, 3);
    expect(overlap(sim)).toBeLessThan(0.0005);
    expect(lowest(sim)).toBeGreaterThan(R - 0.001);
    expect(stretch(sim)).toBeLessThan(0.01);
  });

  it('the hand drags a cord along, and it follows', () => {
    const sim = new CableSim();
    sim.build([{ points: cord([-0.3, 0.1, 0], [0.3, 0.1, 0]), radius: R }]);
    sim.setStatics([floor]);
    run(sim, 1);
    const last = sim.n - 1;
    sim.grab(last);
    for (let k = 0; k < 90; k++) {
      sim.grabTarget[0] = 0.3 + (k / 90) * 0.3; sim.grabTarget[1] = 0.1; sim.grabTarget[2] = 0;
      sim.step();
    }
    run(sim, 0.5);
    expect(Math.hypot(sim.x[3 * last] - 0.6, sim.x[3 * last + 1] - 0.1, sim.x[3 * last + 2])).toBeLessThan(0.02);
    // the rest of the cord came along
    expect(sim.x[0]).toBeGreaterThan(-0.25);
    sim.release();
    expect(stretch(sim)).toBeLessThan(0.02);
  });

  it('a target leads a node to its point; cleared, the node falls back', () => {
    const sim = new CableSim();
    sim.build([{ points: cord([-0.3, 0.1, 0], [0.3, 0.1, 0]), radius: R }]);
    sim.setStatics([floor]);
    run(sim, 1);
    const last = sim.n - 1;
    sim.setTarget(last, 0.25, 0.2, 0.05, 2, 0.05);
    run(sim, 2);
    expect(Math.hypot(sim.x[3 * last] - 0.25, sim.x[3 * last + 1] - 0.2, sim.x[3 * last + 2] - 0.05)).toBeLessThan(0.01);
    expect(stretch(sim)).toBeLessThan(0.01);
    sim.clearTarget(last);
    run(sim, 2);
    expect(sim.x[3 * last + 1]).toBeLessThan(R + 0.002);
  });

  it('a target out of reach pulls on its leash, and does not stretch the cord like an elastic', () => {
    /** the worst stretch of a segment in the 4th second, a cord pinned at one end led 2 m away by the other */
    const worst = (lead: number) => {
      const sim = new CableSim();
      sim.build([{ points: cord([0, 0.5, 0], [0.5, 0.5, 0]), radius: R }]);
      sim.pin(0, 0, 0.5, 0);
      sim.setTarget(sim.n - 1, 2, 0.5, 0, 1.6, lead, true);
      let w = 0;
      for (let k = 0; k < 240; k++) { sim.step(); if (k >= 180) w = Math.max(w, stretch(sim)); }
      return w;
    };
    // the cord whips about in the leash (as in the hand), but the pull stays bounded:
    // without it, the cord would stretch to reach the target
    expect(worst(0.05)).toBeLessThan(0.6);
    expect(worst(10)).toBeGreaterThan(1.5);
  });

  it('is deterministic: the same start gives the same positions, bit for bit', () => {
    const go = () => {
      const sim = new CableSim();
      sim.build([0, 1, 2].map((k) => ({ points: cord([-0.2, 0.05 + 0.04 * k, -0.1 + 0.1 * k], [0.2, 0.05 + 0.04 * k, 0.1 - 0.1 * k]), radius: R })));
      sim.setStatics([floor]);
      run(sim, 1.5);
      return sim.x;
    };
    expect(go()).toEqual(go());
  });
});
