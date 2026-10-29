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
 * The before/after cabinet: an open rack, packed like a real wiring closet.
 * Four copper patch panels, each above its switch; a firewall, a router, two
 * linked servers, two more and a UPS. 100 cords: every panel port to the same
 * port of the switch right below, the switches' uplinks to the firewall and
 * the router, the servers' two NICs.
 * 'mess': the cords are long and tangled, nothing is managed.
 * 'tidy': short cords on their tidy routes, managers and ducts installed.
 * `pairs`: as many panel / switch pairs instead of 3 or 4 (a taller rack, far
 * beyond any real one), with servers in proportion.
 */
export function showcaseRack(state: 'mess' | 'tidy', seed: number, pairs?: number): LevelDef {
  // the closet is drawn from the seed: both worlds of the demo get the same one
  const r = rng(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  const cu = (name: string) => copperPanel(name, 24);
  const sw = (name: string) => ethernetSwitch(name, 24);
  const drawn = 3 + Math.floor(r() * 2);
  pairs ??= drawn;
  // past the first four, two letters (none of them F, R, X, Y: the other units)
  const named = (first: string, more: string) => [...Array(pairs).keys()].map((k) => (k < 4 ? first[k] : more + String.fromCharCode(65 + k - 4)));
  const panels = named('ABCD', 'P'), switches = named('STUV', 'Q');
  // three ways to fill a closet, all of them patched across through the side ducts:
  // the panels above the switches, the switches between two banks of panels,
  // or panel / switch pairs patched to each other's switch
  const layout = pick(['grouped', 'sandwich', 'pairs'] as const);
  const units: UnitSpec[] = [BLANK];
  if (layout === 'grouped') {
    for (const p of panels) units.push(cu(p), BLANK);
    for (const n of switches) units.push(sw(n), BLANK);
  } else if (layout === 'sandwich') {
    const top = Math.ceil(pairs / 2);
    for (const p of panels.slice(0, top)) units.push(cu(p), BLANK);
    for (const n of switches) units.push(sw(n), BLANK);
    for (const p of panels.slice(top)) units.push(cu(p), BLANK);
  } else panels.forEach((p, k) => units.push(cu(p), BLANK, sw(switches[k]), BLANK));
  // an uplink per switch, then the servers' links
  const up = Math.max(4, pairs);
  const fw = firewall(up + 4);
  const rt = router(up + 4);
  units.push(...(r() < 0.5 ? [fw, BLANK, rt, BLANK] : [rt, BLANK, fw, BLANK]));
  const servers = r() < 0.7 ? ['X', 'Y'] : ['X'];
  for (const n of servers) {
    const at = 0.02 + r() * 0.1;
    units.push(server(n, at));
  }
  for (let k = Math.floor(r() * 3) + Math.max(0, pairs - drawn); k > 0; k--) units.push(SERVER);
  units.push(BLANK);
  for (let k = 1 + Math.floor(r() * 2); k > 0; k--) units.push(UPS);
  // a finger manager on every blank next to a panel or a switch
  const cabled = (k: number) => units[k] && (units[k].kind === 'panel' || units[k].kind === 'switch');
  const managers = units.map((u, k) => (k > 0 && u.kind === 'blank' && (cabled(k - 1) || cabled(k + 1)) ? k : -1)).filter((k) => k >= 0);
  // ducts down both sides, from the top manager to the bottom one
  const ducts: number[] = [];
  for (let u = managers[0]; u - 1 <= managers[managers.length - 1]; u += 4) ducts.push(u);
  // the patching: a share of each panel's ports, to its switch, coloured by service
  const out: Circuit[] = [];
  const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const special = pick([0, 7, 11]);
  // each switch has 22 ports for the panels (the last two are its uplinks)
  const free = switches.map(() => shuffle([...Array(22).keys()].map((i) => i + 1)));
  panels.forEach((p, k) => {
    const svc = pick([0, 0, 1, 2, 4, 5]);
    const used = shuffle([...Array(22).keys()].map((i) => i + 1)).slice(0, 16 + Math.floor(r() * 7)).sort((a, b) => a - b);
    used.forEach((i) => {
      // any switch but the one next to the panel, as long as it has ports left (in a taller
      // rack than drawn, one of the closest: across the whole of it, the cords grew too long to fall)
      const others = switches.map((_, j) => j).filter((j) => j !== k && free[j].length > 0 && (pairs === drawn || Math.abs(j - k) <= 2));
      const j = others.length ? pick(others) : k;
      if (!free[j].length) return;
      out.push({ a: `${p}${i}`, b: `${switches[j]}${free[j].pop()}`, type: 'CU', service: special && i % special === 0 ? 3 : svc });
    });
  });
  switches.forEach((n, k) => {
    out.push({ a: `${n}23`, b: `F${k + 1}`, type: 'CU', service: 3 });
    out.push({ a: `${n}24`, b: `R${k + 1}`, type: 'CU', service: 2 });
  });
  servers.forEach((n, k) => {
    out.push({ a: `F${up + 1 + k}`, b: `${n}1`, type: 'CU', service: 4 });
    out.push({ a: `R${up + 1 + k}`, b: `${n}2`, type: 'CU', service: 4 });
  });
  // a taller rack, longer cords: they still have to reach the floor from the top
  const tall = Math.sqrt((4 * pairs + 10) / (4 * drawn + 10));
  const lo = (1.3 + r() * 0.3) * tall;
  return {
    id: `showcase-${state}`,
    title: 'Avant / Après',
    brief: '',
    units, cables: out.length, wrong: 0, loose: 0, slack: [0, 0], mess: 3,
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
    messSpread: { x: 0.45 + r() * 0.15, z: [0.02, 0.3 + r() * 0.1], fall: 2.5 },
    messLength: [lo, lo + (1.2 + r() * 0.6) * tall],
    colorByService: true,
    schedule: () => out,
  };
}
