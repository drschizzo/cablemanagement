// Free play: a cabinet generated at random, of any size.

import type { UnitSpec } from '../rack';
import type { LevelDef } from './levelDef';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch } from './equipment';

export function freeLevel(cables: number, seed: number): LevelDef {
  const panels = Math.max(1, Math.ceil(cables / 24));
  const switches = Math.max(1, Math.ceil(cables / 24));
  const units: UnitSpec[] = [BLANK];
  for (let i = 0; i < panels; i++) units.push(copperPanel(String.fromCharCode(65 + i), 24), BLANK);
  units.push(BLANK, BLANK, BLANK, BLANK);
  for (let i = 0; i < switches; i++) units.push(ethernetSwitch(String.fromCharCode(83 + i), 24), BLANK, BLANK);
  units.push(FIREWALL, BLANK, ROUTER, BLANK, SERVER, UPS);
  return {
    id: `free-${cables}-${seed}`,
    kind: 'free',
    units, cables,
    wrong: Math.round(cables * 0.15), loose: Math.round(cables * 0.1),
    slack: [0.25, 0.6], mess: Math.min(5, 1 + Math.round(cables / 10)),
    labels: true, services: Math.min(6, 1 + Math.round(cables / 8)), types: ['CU'], colorByService: true,
    downtime: 200, bypass: 2,
    cords: [[1, Math.ceil(cables / 6)], [1.5, Math.ceil(cables / 6)], [2, Math.ceil(cables / 8)]],
    inventory: { fingerManager: panels + switches, duct: 6, ring: 6, velcro: Math.ceil(cables / 3) },
    preinstalled: [],
    seed,
  };
}
