// Free play: a cabinet generated at random, of any size; and its zen setting,
// without budget nor anything pressing.

import type { UnitSpec } from '../rack';
import type { FreeLevel, ZenLevel } from './levelDef';
import { BLANK, FIREWALL, ROUTER, SERVER, UPS, copperPanel, ethernetSwitch } from './equipment';
import { drawIncidents } from '../incidents';
import { rng } from '../../lib/random';

/** from this many cords, free play has its incidents (a colleague, a call), and from that many, a cord broken inside */
const INCIDENTS_FROM = 12;
const FAULT_FROM = 16;
/** from this many cords, the manual nobody read lies somewhere in the cabinet */
export const MANUAL_FROM = 30;

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
    faults: cables >= FAULT_FROM ? 1 : 0,
    find: cables >= MANUAL_FROM ? 'manual' : undefined,
    cords: [[1, Math.ceil(cables / 6)], [1.5, Math.ceil(cables / 6)], [2, Math.ceil(cables / 8)]],
    inventory: { fingerManager: panels + switches, duct: 6, ring: 6, velcro: Math.ceil(cables / 3) },
    preinstalled: [],
    seed,
  };
}

/**
 * Zen: a cabinet of free play with nothing pressing (free play's setting).
 * No link in production (no downtime budget, no incident, no broken cord,
 * nothing to find), and material to spare, cords of every length included.
 */
export function zenLevel(cables: number, seed: number): ZenLevel {
  const free = freeLevel(cables, seed);
  const { downtime, bypass, incidents, faults, find, ...rest } = free;
  const each = Math.ceil(cables / 3);
  return {
    ...rest,
    id: `zen-${cables}-${seed}`,
    kind: 'zen',
    cords: [[0.5, each], [0.75, each], [1, each], [1.5, each], [2, Math.ceil(cables / 4.5)]],
    inventory: { fingerManager: (free.inventory.fingerManager ?? 0) + 2, duct: 8, ring: 8, velcro: Math.ceil(cables * 0.55) },
  };
}
