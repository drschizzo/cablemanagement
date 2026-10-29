// A cabinet of the editor: checked, and carried by its code.
import { describe, expect, it } from 'vitest';
import { checkSpec, customLevel, decodeSpec, encodeSpec, mostCords, type CustomSpec } from '../../../src/game/levels/customLevel';
import { World } from '../../../src/game/world';

const spec: CustomSpec = {
  units: ['blank', 'copperPanel', 'blank', 'switch', 'blank', 'firewall', 'blank', 'router', 'server', 'ups'],
  cables: 12, difficulty: 'normal', services: 3, maintenance: true, seed: 123456,
};

describe('a cabinet of the editor', () => {
  it('travels as a short code, and comes back the same', () => {
    const code = encodeSpec(spec);
    expect(code).toBe('bpbsbfbrxu.12.n.3.1.2n9c');
    expect(decodeSpec(code)).toEqual(spec);
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

  it('makes a cabinet that can be played', () => {
    const w = new World(customLevel(spec));
    w.preroll(20);
    expect(w.circuits.length).toBe(12);
    expect(w.sim.x.every(Number.isFinite)).toBe(true);
    expect(w.evaluate().stars).toBe(0);
    w.dispose();
  });
});
