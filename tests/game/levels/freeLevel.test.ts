// A free cabinet: checked, carried by its code, in production or not.
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PALETTE, checkSpec, decodeSpec, encodeSpec, fitUnits, freeLevel, mostCords, type FreeSpec } from '../../../src/game/levels/freeLevel';
import { World } from '../../../src/game/world';
import { SERVICES } from '../../../src/game/services';

const spec: FreeSpec = {
  units: ['blank', 'copperPanel', 'blank', 'switch', 'blank', 'firewall', 'blank', 'router', 'server', 'ups'],
  cables: 12, difficulty: 'normal', services: 3, production: true, seed: 123456,
};

describe('a free cabinet', () => {
  it('travels as a short code, and comes back the same', () => {
    const code = encodeSpec(spec);
    expect(code).toBe('bpbsbfbrxu.12.n.3.1.2n9c');
    expect(decodeSpec(code)).toEqual(spec);
  });

  it('carries every piece of the palette, every difficulty and every count of services', () => {
    const every: FreeSpec = { ...spec, units: Object.values(PALETTE) };
    expect(decodeSpec(encodeSpec(every))).toEqual(every);
    for (const difficulty of DIFFICULTIES) expect(decodeSpec(encodeSpec({ ...spec, difficulty }))).toEqual({ ...spec, difficulty });
    expect(decodeSpec(encodeSpec({ ...spec, services: SERVICES.length }))).toEqual({ ...spec, services: SERVICES.length });
    expect(decodeSpec(encodeSpec({ ...spec, services: SERVICES.length + 1 }))).toEqual({ kind: 'badCode' });
  });

  it('turns down a code that is not one, or a cabinet that cannot be played', () => {
    expect(decodeSpec('nonsense')).toEqual({ kind: 'badCode' });
    expect(decodeSpec('bpbzz.12.n.3.1.2n9c')).toEqual({ kind: 'badCode' });
    expect(decodeSpec('bpb.4.n.3.1.1')).toEqual({ kind: 'noSwitch' });
    expect(checkSpec({ ...spec, units: ['switch'] })).toEqual({ kind: 'noPanel' });
    expect(checkSpec({ ...spec, cables: 30 })).toEqual({ kind: 'tooManyCords', most: 24 });
    expect(checkSpec({ ...spec, units: [...spec.units, 'firewall'] })).toEqual({ kind: 'twice', item: 'firewall' });
  });

  it('patches as many cords as the panels and the switches have ports', () => {
    expect(mostCords(['copperPanel', 'switch'])).toBe(24);
    expect(mostCords(['copperPanel', 'copperPanel', 'switch', 'switch', 'switch'])).toBe(48);
  });

  it('powers the servers from the power strip, when there is one', () => {
    const level = freeLevel({ ...spec, units: [...spec.units, 'pdu'] });
    expect(level.links).toEqual([
      { a: 'P8', b: 'XP1', service: 4, type: 'PWR' },
      { a: 'P7', b: 'XP2', service: 4, type: 'PWR' },
    ]);
    expect(freeLevel(spec).links).toEqual([]);
  });

  it('makes a cabinet that can be played', () => {
    const w = new World(freeLevel(spec));
    w.preroll(20);
    expect(w.circuits.length).toBe(12);
    expect(w.sim.x.every(Number.isFinite)).toBe(true);
    expect(w.evaluate().stars).toBe(0);
    w.dispose();
  });

  it('in production, has a downtime budget; otherwise none, and more material', () => {
    const live = freeLevel(spec), calm = freeLevel({ ...spec, production: false });
    expect(live.downtime).toBeGreaterThan(0);
    expect(calm.downtime).toBeUndefined();
    expect(calm.incidents).toBeUndefined();
    expect(calm.faults ?? 0).toBe(0);
    expect(calm.inventory.velcro!).toBeGreaterThan(live.inventory.velcro!);
  });

  it('adds a panel and a switch when the cords outnumber their ports', () => {
    const units = fitUnits(spec.units, 40);
    expect(mostCords(units)).toBeGreaterThanOrEqual(40);
    expect(units.filter((u) => u === 'copperPanel')).toHaveLength(2);
    expect(fitUnits(spec.units, 12)).toEqual(spec.units);
  });
});
