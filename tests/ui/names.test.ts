// The things of the game are named by the interface, from what they are.
import { describe, expect, it } from 'vitest';
import { FIREWALL, SERVER, UPS, copperPanel, ethernetSwitch, opticalPanel, opticalSwitch, server } from '../../src/game/levels/equipment';
import { countOf, unitLabel } from '../../src/ui/names';

describe('the names of things', () => {
  it('says what each unit is on its face plate', () => {
    expect(unitLabel(opticalPanel('A', 12))).toBe('Tiroir optique A');
    expect(unitLabel(opticalSwitch('S', 12))).toBe('Switch S');
    expect(unitLabel(copperPanel('B', 24))).toBe('Panneau de brassage B');
    expect(unitLabel(ethernetSwitch('T', 24))).toBe('Switch T');
    expect(unitLabel(FIREWALL)).toBe('Pare-feu');
    expect(unitLabel(server('X', 0.03))).toBe('Serveur X');
    expect(unitLabel(SERVER)).toBe('Serveur');
    expect(unitLabel(UPS)).toBe('Onduleur');
  });

  it('counts the supplies, one and several', () => {
    expect(countOf('duct', 2)).toBe('2 goulottes');
    expect(countOf('ring', 1)).toBe('1 anneau');
  });
});
