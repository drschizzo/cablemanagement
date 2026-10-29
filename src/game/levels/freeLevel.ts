// Free play: a cabinet generated at random, of any size; and its zen variant,
// without clock or budget.

import type { UnitSpec } from '../rack';
import type { FreeLevel, ZenLevel } from './levelDef';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch } from './equipment';
import { drawIncidents } from '../incidents';
import { rng } from '../../lib/random';

/** from this many cords, free play has its incidents (a colleague, a call) */
const INCIDENTS_FROM = 12;

export function freeLevel(cables: number, seed: number): FreeLevel {
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
    // their own draws, apart from the level's
    incidents: cables >= INCIDENTS_FROM ? drawIncidents(2, rng(seed ^ 0x51ed)) : undefined,
    cords: [[1, Math.ceil(cables / 6)], [1.5, Math.ceil(cables / 6)], [2, Math.ceil(cables / 8)]],
    inventory: { fingerManager: panels + switches, duct: 6, ring: 6, velcro: Math.ceil(cables / 3) },
    preinstalled: [],
    seed,
  };
}

/** cords of a zen cabinet */
export const ZEN_CORDS = 36;

/**
 * Zen: a big cabinet of free play with nothing pressing. No link in
 * production (no downtime budget, no incident), and material to spare,
 * cords of every length included.
 */
export function zenLevel(seed: number): ZenLevel {
  const free = freeLevel(ZEN_CORDS, seed);
  const { downtime, bypass, incidents, ...rest } = free;
  return {
    ...rest,
    id: `zen-${seed}`,
    kind: 'zen',
    cords: [[0.5, 12], [0.75, 12], [1, 12], [1.5, 12], [2, 8]],
    inventory: { fingerManager: 6, duct: 8, ring: 8, velcro: 20 },
  };
}
