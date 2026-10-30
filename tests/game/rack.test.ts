import { describe, it, expect } from 'vitest';
import { Rack, DUCT_SPAN, insideBox, type UnitSpec } from '../../src/game/rack';

describe('the rack', () => {
  const B: UnitSpec = { kind: 'blank' };
  const units: UnitSpec[] = [B, { kind: 'panel', name: 'A', ports: 12 }, B, { kind: 'switch', name: 'S', ports: 24 }, B, B, B, B];

  it('names the ports after their unit, one row per unit', () => {
    const r = new Rack(units);
    expect(r.ports.map((p) => p.id)).toEqual([...Array.from({ length: 12 }, (_, i) => `A${i + 1}`), ...Array.from({ length: 24 }, (_, i) => `S${i + 1}`)]);
    expect(r.port('S1').y).toBeCloseTo(r.unitY(3));
    expect(() => r.port('Z9')).toThrow();
  });

  it('says where to put an item back, a duct included (it snaps round the unit given)', () => {
    for (const [kind, unit] of [['duct', 0], ['duct', 3], ['duct', 4], ['fingerManager', 2], ['ring', 5]] as const) {
      const r = new Rack(units), again = new Rack(units);
      const it = r.addItem(kind, unit, 1)!;
      const slot = r.slotOf(it);
      const back = again.addItem(slot.kind, slot.unit, slot.side)!;
      expect([back.unit, back.span]).toEqual([it.unit, it.span]);
    }
  });

  it('a finger manager goes in an empty unit, once', () => {
    const r = new Rack(units);
    expect(r.addItem('fingerManager', 1, 0)).toBeNull(); // the panel's unit
    const m = r.addItem('fingerManager', 2, 0)!;
    expect(m).not.toBeNull();
    expect(r.canPlace('fingerManager', 2, 0)).toBe(false);
    expect(r.itemAt('fingerManager', 2, 0)).toBe(m);
  });

  it('ducts cover four units on one side and do not overlap', () => {
    const r = new Rack(units);
    const d = r.addItem('duct', 1, 1)!;
    expect(d.span).toBe(DUCT_SPAN);
    expect(d.unit).toBe(0);
    expect(r.canPlace('duct', 2, 1)).toBe(false);
    expect(r.canPlace('duct', 2, -1)).toBe(true);
    expect(r.canPlace('ring', 3, 1)).toBe(false);
    expect(r.canPlace('ring', 4, 1)).toBe(true);
  });

  it('a locked item stays', () => {
    const r = new Rack(units);
    const m = r.addItem('fingerManager', 2, 0, true)!;
    expect(r.removeItem(m.id)).toBe(false);
    const free = r.addItem('fingerManager', 4, 0)!;
    expect(r.removeItem(free.id)).toBe(true);
  });

  it('every item makes a volume where a cord counts as held', () => {
    const r = new Rack(units);
    const m = r.addItem('fingerManager', 2, 0)!;
    const [s] = r.supports();
    expect(s.item).toBe(m.id);
    expect(insideBox(s, 0, r.unitY(2), 0.03)).toBe(true);
    expect(insideBox(s, 0, r.unitY(5), 0.03)).toBe(false);
  });
});
