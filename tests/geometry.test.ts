import { describe, it, expect } from 'vitest';
import { pathToNodes, polyLength, resample, type V3 } from '../src/game/idealRoutes';
import { rng } from '../src/game/tangle';
import { Rack, DUCT_SPAN, insideBox, type UnitSpec } from '../src/game/rack';

describe('polylines', () => {
  const L: V3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0]];

  it('length of a polyline', () => {
    expect(polyLength(L)).toBeCloseTo(7);
    expect(polyLength([[1, 2, 3]])).toBe(0);
  });

  it('resampling at arc lengths, scaled to the polyline', () => {
    const out = new Float64Array(9);
    resample(L, [0, 1.75, 3.5], out, 0); // arcs 0..3.5 spread over 7 m
    expect([...out]).toEqual([0, 0, 0, 3, 0.5, 0, 3, 4, 0].map((v) => expect.closeTo(v, 9)));
  });

  it('a cord laid on a route keeps its two pins and segments of about `seg`', () => {
    const route: V3[] = [[0, 0, 0.034], [0, 0, 0.059], [0, -0.2, 0.06], [0.3, -0.2, 0.06], [0.3, 0, 0.059], [0.3, 0, 0.034]];
    const pts = pathToNodes(route, 0.025);
    const n = pts.length / 3;
    expect(pts.slice(0, 3)).toEqual(route[0]);
    expect(pts.slice(-3)).toEqual(route[5]);
    const segs = [];
    for (let k = 2; k < n - 1; k++) segs.push(Math.hypot(pts[3 * k] - pts[3 * k - 3], pts[3 * k + 1] - pts[3 * k - 2], pts[3 * k + 2] - pts[3 * k - 1]));
    for (const s of segs) expect(s).toBeLessThan(0.03);
  });
});

describe('random draws', () => {
  it('a seed always gives the same sequence', () => {
    const a = rng(42), b = rng(42), c = rng(43);
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe('the rack', () => {
  const B: UnitSpec = { kind: 'blank' };
  const units: UnitSpec[] = [B, { kind: 'panel', name: 'A', ports: 12 }, B, { kind: 'switch', name: 'S', ports: 24 }, B, B, B, B];

  it('names the ports after their unit, one row per unit', () => {
    const r = new Rack(units);
    expect(r.ports.map((p) => p.id)).toEqual([...Array.from({ length: 12 }, (_, i) => `A${i + 1}`), ...Array.from({ length: 24 }, (_, i) => `S${i + 1}`)]);
    expect(r.port('S1').y).toBeCloseTo(r.unitY(3));
    expect(() => r.port('Z9')).toThrow();
  });

  it('a finger manager goes in an empty unit, once', () => {
    const r = new Rack(units);
    expect(r.addItem('hmgr', 1, 0)).toBeNull(); // the panel's unit
    const m = r.addItem('hmgr', 2, 0)!;
    expect(m).not.toBeNull();
    expect(r.canPlace('hmgr', 2, 0)).toBe(false);
    expect(r.itemAt('hmgr', 2, 0)).toBe(m);
  });

  it('ducts cover four units on one side and do not overlap', () => {
    const r = new Rack(units);
    const d = r.addItem('duct', 1, 1)!;
    expect(d.span).toBe(DUCT_SPAN);
    expect(d.unit).toBe(0);
    expect(r.canPlace('duct', 2, 1)).toBe(false);
    expect(r.canPlace('duct', 2, -1)).toBe(true);
    expect(r.canPlace('vring', 3, 1)).toBe(false);
    expect(r.canPlace('vring', 4, 1)).toBe(true);
  });

  it('a locked item stays', () => {
    const r = new Rack(units);
    const m = r.addItem('hmgr', 2, 0, true)!;
    expect(r.removeItem(m.id)).toBe(false);
    const free = r.addItem('hmgr', 4, 0)!;
    expect(r.removeItem(free.id)).toBe(true);
  });

  it('every item makes a volume where a cord counts as held', () => {
    const r = new Rack(units);
    const m = r.addItem('hmgr', 2, 0)!;
    const [s] = r.supports();
    expect(s.item).toBe(m.id);
    expect(insideBox(s, 0, r.unitY(2), 0.03)).toBe(true);
    expect(insideBox(s, 0, r.unitY(5), 0.03)).toBe(false);
  });
});
