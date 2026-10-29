// The cabinets of the before/after aisle (the title screen), drawn from a seed.

import type { UnitSpec } from '../rack';
import { rng, type Circuit } from '../mess/tangle';
import type { LevelDef } from './levelDef';
import { BLANK, SERVER, UPS, copperPanel, ethernetSwitch, fingerManager, firewall, router, server } from './equipment';

/**
 * How the mess of the demo is settled before it is shown: a short fall with a
 * cheap solver (it is frozen afterwards, nobody touches it).
 */
export const SHOWCASE_SETTLE = { frames: 40, solver: { substeps: 1, refSubsteps: 1, iterations: 4 } };

/**
 * The aisle the title screen opens on: its bays, the pairs of each, and its seed
 * (bay k is drawn from seed + k). Its mess is baked (npm run bake), the others fall.
 */
export const SHOWCASE_DEFAULT = { bays: 5, pairs: [10, 8, 10, 8, 10], seed: 368410640 };

/**
 * A cabinet of the before/after aisle: an open rack packed like a real wiring
 * closet, drawn from `seed` (both worlds of a bay, the mess and the tidy one,
 * get the same closet). Copper patch panels and their switches, in one of
 * three layouts; a firewall and a router taking the switches' uplinks; one or
 * two servers patched to both, more servers and a UPS or two. Each panel
 * patches most of its ports across to another switch, through the side ducts.
 * 'mess': the cords are long and tangled, nothing is managed.
 * 'tidy': short cords on their tidy routes, managers and ducts installed.
 * `pairs`: as many panel / switch pairs instead of 3 or 4 (a taller rack, far
 * beyond any real one), with servers in proportion.
 */
export function showcaseRack(state: 'mess' | 'tidy', seed: number, pairs?: number): LevelDef {
  const random = rng(seed);
  // the draws come in a fixed order: the baked mess of the title screen depends on it
  const drawnPairs = 3 + Math.floor(random() * 2);
  const pairCount = pairs ?? drawnPairs;
  const closet = drawEquipment(random, pairCount, drawnPairs);
  const { managers, ducts } = placeSupports(closet.units);
  const circuits = drawPatching(random, closet, pairCount === drawnPairs);
  // a taller rack, longer cords: they still have to reach the floor from the top
  const tall = Math.sqrt((4 * pairCount + 10) / (4 * drawnPairs + 10));
  const shortest = (1.3 + random() * 0.3) * tall;
  return {
    id: `showcase-${state}`,
    title: 'Avant / Après',
    brief: '',
    units: closet.units, cables: circuits.length, wrong: 0, loose: 0, slack: [0, 0], mess: 3,
    labels: true, services: 6, types: ['CU'],
    inventory: { velcro: 60 },
    preinstalled: [
      ...managers.map(fingerManager),
      ...[-1, 1].flatMap((side) => ducts.map((unit) => ({ kind: 'duct' as const, unit, side }))),
    ],
    seed,
    showcase: state,
    // the old cords of the mess are limp, the new ones springy
    bend: state === 'mess' ? 1.5 : 0,
    open: true,
    // the mess is coarser: it only has to fall once, and quickly (coarser still in a taller
    // rack, its cords longer: a hanging curtain of them, seen from afar)
    seg: state === 'mess' ? 0.05 * Math.min(1.4, tall) : 0.025,
    radius: 0.0028,
    // most detours start low, close to where they will end up
    messSpread: { x: 0.45 + random() * 0.15, z: [0.02, 0.3 + random() * 0.1], fall: 2.5 },
    messLength: [shortest, shortest + (1.2 + random() * 0.6) * tall],
    colorByService: true,
    schedule: () => circuits,
  };
}

/** the equipment of a closet, and the names its patching needs */
interface Closet {
  units: UnitSpec[];
  panels: string[];
  switches: string[];
  /** the servers patched to the firewall and the router */
  servers: string[];
  /** ports of the firewall and the router taken by the switches' uplinks */
  uplinks: number;
}

function drawEquipment(random: () => number, pairCount: number, drawnPairs: number): Closet {
  const pick = <T>(a: T[]): T => a[Math.floor(random() * a.length)];
  const panel = (name: string) => copperPanel(name, 24);
  const sw = (name: string) => ethernetSwitch(name, 24);
  // past the first four, two letters (none of them F, R, X, Y: the other units)
  const named = (first: string, more: string) => [...Array(pairCount).keys()].map((k) => (k < 4 ? first[k] : more + String.fromCharCode(65 + k - 4)));
  const panels = named('ABCD', 'P'), switches = named('STUV', 'Q');
  // three ways to fill a closet, all of them patched across through the side ducts:
  // the panels above the switches, the switches between two banks of panels,
  // or panel / switch pairs patched to each other's switch
  const layout = pick(['grouped', 'sandwich', 'pairs'] as const);
  const units: UnitSpec[] = [BLANK];
  if (layout === 'grouped') {
    for (const p of panels) units.push(panel(p), BLANK);
    for (const n of switches) units.push(sw(n), BLANK);
  } else if (layout === 'sandwich') {
    const top = Math.ceil(pairCount / 2);
    for (const p of panels.slice(0, top)) units.push(panel(p), BLANK);
    for (const n of switches) units.push(sw(n), BLANK);
    for (const p of panels.slice(top)) units.push(panel(p), BLANK);
  } else panels.forEach((p, k) => units.push(panel(p), BLANK, sw(switches[k]), BLANK));
  // an uplink per switch, then the servers' links
  const uplinks = Math.max(4, pairCount);
  const fw = firewall(uplinks + 4);
  const rt = router(uplinks + 4);
  units.push(...(random() < 0.5 ? [fw, BLANK, rt, BLANK] : [rt, BLANK, fw, BLANK]));
  const servers = random() < 0.7 ? ['X', 'Y'] : ['X'];
  for (const n of servers) units.push(server(n, 0.02 + random() * 0.1));
  for (let k = Math.floor(random() * 3) + Math.max(0, pairCount - drawnPairs); k > 0; k--) units.push(SERVER);
  units.push(BLANK);
  for (let k = 1 + Math.floor(random() * 2); k > 0; k--) units.push(UPS);
  return { units, panels, switches, servers, uplinks };
}

/** a finger manager on every blank next to a panel or a switch; ducts down both sides, from the top manager to the bottom one */
function placeSupports(units: UnitSpec[]): { managers: number[]; ducts: number[] } {
  const cabled = (k: number) => units[k] && (units[k].kind === 'panel' || units[k].kind === 'switch');
  const managers = units.map((u, k) => (k > 0 && u.kind === 'blank' && (cabled(k - 1) || cabled(k + 1)) ? k : -1)).filter((k) => k >= 0);
  const ducts: number[] = [];
  for (let u = managers[0]; u - 1 <= managers[managers.length - 1]; u += 4) ducts.push(u);
  return { managers, ducts };
}

/**
 * The patching: a share of each panel's ports to another switch, coloured by
 * service; the switches' uplinks; the servers' two cards. `allSwitches` false: in a
 * taller rack than drawn, each panel patches to one of the closest switches
 * (across the whole of it, the cords grew too long to fall).
 */
function drawPatching(random: () => number, closet: Closet, allSwitches: boolean): Circuit[] {
  const { panels, switches, servers, uplinks } = closet;
  const pick = <T>(a: T[]): T => a[Math.floor(random() * a.length)];
  const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const out: Circuit[] = [];
  // every n-th port of a panel is an admin link (0: none)
  const adminEvery = pick([0, 7, 11]);
  // each switch has 22 ports for the panels (the last two are its uplinks)
  const free = switches.map(() => shuffle([...Array(22).keys()].map((i) => i + 1)));
  panels.forEach((p, k) => {
    const service = pick([0, 0, 1, 2, 4, 5]);
    const used = shuffle([...Array(22).keys()].map((i) => i + 1)).slice(0, 16 + Math.floor(random() * 7)).sort((a, b) => a - b);
    used.forEach((i) => {
      // any switch but the one next to the panel, as long as it has ports left
      const others = switches.map((_, j) => j).filter((j) => j !== k && free[j].length > 0 && (allSwitches || Math.abs(j - k) <= 2));
      const j = others.length ? pick(others) : k;
      if (!free[j].length) return;
      out.push({ a: `${p}${i}`, b: `${switches[j]}${free[j].pop()}`, type: 'CU', service: adminEvery && i % adminEvery === 0 ? 3 : service });
    });
  });
  switches.forEach((n, k) => {
    out.push({ a: `${n}23`, b: `F${k + 1}`, type: 'CU', service: 3 });
    out.push({ a: `${n}24`, b: `R${k + 1}`, type: 'CU', service: 2 });
  });
  servers.forEach((n, k) => {
    out.push({ a: `F${uplinks + 1 + k}`, b: `${n}1`, type: 'CU', service: 4 });
    out.push({ a: `R${uplinks + 1 + k}`, b: `${n}2`, type: 'CU', service: 4 });
  });
  return out;
}
