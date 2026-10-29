// The maintenance window on its own: no rack, no physics. Whether a link is up
// is a plain set the test changes by hand (a test double for the cabinet).
import { describe, expect, it } from 'vitest';
import { MaintenanceWindow } from '../../src/game/maintenanceWindow';
import type { Circuit } from '../../src/game/mess/tangle';

/** three links: data (weight 1), voice (weight 3), admin (weight 4) */
const circuits: Circuit[] = [
  { a: 'A1', b: 'S1', type: 'CU', service: 0 },
  { a: 'A2', b: 'S2', type: 'CU', service: 1 },
  { a: 'A3', b: 'S3', type: 'CU', service: 3 },
];

function windowWith(upAtStart: number[], bypasses = 0, budget = 100) {
  const up = new Set(upAtStart);
  const stock = { bypass: bypasses };
  const maintenance = new MaintenanceWindow(circuits, (i) => up.has(i), budget, stock);
  return { up, stock, maintenance };
}

describe('the maintenance window', () => {
  it('puts in production the links that work at the start', () => {
    const { maintenance } = windowWith([0, 2]);
    expect([...maintenance.live]).toEqual([0, 2]);
    expect(maintenance.liveDown()).toBe(0);
  });

  it('counts the downtime of a production link cut, by the weight of its service', () => {
    const { up, maintenance } = windowWith([0, 1, 2]);
    up.delete(1);
    maintenance.tick(2);
    expect(maintenance.downtime).toBe(6);
    expect(maintenance.isDown(1)).toBe(true);
    expect(maintenance.cutCost(1)).toBe(3);
  });

  it('costs nothing for a link that was never in production', () => {
    const { maintenance } = windowWith([0]);
    maintenance.tick(10);
    expect(maintenance.downtime).toBe(0);
    expect(maintenance.cutCost(2)).toBe(0);
  });

  it('a bypass carries its link while it is cut, and comes back once it is restored', () => {
    const { up, stock, maintenance } = windowWith([2], 1);
    expect(maintenance.toggleBypass(2)).toBe(true);
    expect(stock.bypass).toBe(0);
    up.delete(2);
    expect(maintenance.tick(5)).toEqual([]);
    expect(maintenance.downtime).toBe(0);
    up.add(2);
    expect(maintenance.tick(0.1)).toEqual([2]);
    expect(stock.bypass).toBe(1);
    expect(maintenance.bypassed.size).toBe(0);
  });

  it('refuses a bypass when none is left, or for a link out of production', () => {
    const { maintenance } = windowWith([0], 0);
    expect(maintenance.toggleBypass(0)).toBe(false);
    const other = windowWith([0], 1).maintenance;
    expect(other.toggleBypass(1)).toBe(false);
  });
});
