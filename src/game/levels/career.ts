// The career: one client (a small local radio station), one cabinet, ticket
// after ticket. The first visit finds the cabinet in a mess; each ticket
// after starts from the cabinet as the player left it (cabinetState.ts),
// installs new equipment in the units kept free for it, patches new links,
// takes others out of service. What was tidied stays tidy; what was botched
// is still there. Its words are in ui/levelTexts.ts.

import type { LevelDef, TicketLevel } from './levelDef';
import type { CabinetState } from '../cabinetState';
import type { Circuit } from '../schedule';
import type { UnitSpec } from '../rack';
import type { CordType } from '../cordTypes';
import { Rack } from '../rack';
import { BLANK, FIREWALL, ROUTER, UPS, copperPanel, ethernetSwitch, fingerManager, pdu, poweredServer, server } from './equipment';
import { makeCables } from '../mess/tangle';
import { drawIncidents } from '../incidents';
import { rng, shuffle } from '../../lib/random';
import type { Stock } from '../supplies';
import { SERVICES } from '../services';

/**
 * The client's cabinet on the first day: a panel over its switch, the
 * firewall and the router, and free units where later tickets install a
 * second panel and switch (4, 5), the archives server under its power strip
 * (13, 11), the streaming server (7). Managers under the switch and the
 * firewall (3, 9); room for more (6, 12: the power strip and its server
 * share the one between them).
 */
const FIRST_UNITS: UnitSpec[] = [
  BLANK, copperPanel('A', 24), ethernetSwitch('S', 24), BLANK, BLANK, BLANK, BLANK, BLANK,
  FIREWALL, BLANK, ROUTER, BLANK, BLANK, BLANK, UPS, BLANK,
];

/** what one visit to the client asks */
export interface TicketSpec {
  /** equipment installed in units free until now */
  install?: { unit: number; spec: UnitSpec }[];
  /** new links from a patch panel to an access switch, drawn among the free ports */
  add?: number;
  /** new links between equipment: a free port of the equipment named `from` (a switch, a power strip) to the port `to` (a server's card or inlet, the firewall); copper unless told */
  links?: { from: string; to: string; service?: number; type?: CordType }[];
  /** links taken out of service: their cords are still plugged, to be taken off */
  remove?: number;
  /** services the new links may carry (the first ones of SERVICES) */
  services: number;
  downtime: number;
  bypass?: number;
  incidents?: number;
  faults?: number;
  bundles?: number;
  inventory: Partial<Stock>;
  cords: [number, number][];
}

/** the first visit: the cords of the cabinet, and the mess the previous technician left */
const FIRST_CORDS = 10;
const MESS = { wrong: 2, loose: 1, slack: [0.3, 0.6] as [number, number], mess: 2 };
const SEED = 7300;

export const TICKETS: TicketSpec[] = [
  // the first day: put the cabinet in order
  { services: 2, downtime: 160, bypass: 1, inventory: { fingerManager: 1, duct: 2, ring: 2, velcro: 3 }, cords: [[0.5, 3], [0.75, 3], [1, 3]] },
  // the newsroom moves in: six links more on the panel
  { add: 6, services: 3, downtime: 140, bypass: 1, inventory: { velcro: 3 }, cords: [[0.5, 3], [0.75, 3], [1, 2]] },
  // the archives server, and the power strip that feeds its two supplies
  { install: [{ unit: 11, spec: pdu() }, { unit: 13, spec: poweredServer('X', 0.03) }],
    links: [{ from: 'S', to: 'X1', service: 4 }, { from: 'S', to: 'X2', service: 4 }, { from: 'P', to: 'XP1', service: 4, type: 'PWR' }, { from: 'P', to: 'XP2', service: 4, type: 'PWR' }],
    add: 2, services: 5, downtime: 160, bypass: 1, inventory: { fingerManager: 1, ring: 2, velcro: 2 }, cords: [[1, 2], [1.5, 2], [2, 2]] },
  // the night show moves: links out, links in, and the phone rings
  { remove: 4, add: 4, services: 5, downtime: 180, bypass: 2, incidents: 2, inventory: { velcro: 2 }, cords: [[0.5, 2], [0.75, 3], [1, 2]] },
  // the festival: a second panel and its switch
  { install: [{ unit: 4, spec: copperPanel('B', 24) }, { unit: 5, spec: ethernetSwitch('T', 24) }], links: [{ from: 'T', to: 'F2' }],
    add: 8, services: 5, downtime: 220, bypass: 2, inventory: { fingerManager: 1, duct: 2, velcro: 4 }, cords: [[0.15, 6], [0.25, 4], [0.5, 4], [1, 3]] },
  // the storm: old cords broken inside, and listeners calling
  { add: 2, faults: 2, incidents: 2, services: 5, downtime: 200, bypass: 2, inventory: { velcro: 2 }, cords: [[0.5, 3], [0.75, 3], [1, 3]] },
  // online: the streaming server
  { install: [{ unit: 7, spec: server('Y', 0.09) }], links: [{ from: 'T', to: 'Y1', service: 4 }, { from: 'T', to: 'Y2', service: 4 }],
    add: 4, services: 6, downtime: 240, bypass: 2, bundles: 2, inventory: { ring: 2, velcro: 6 }, cords: [[1, 3], [1.5, 3], [2, 2]] },
  // the 40th anniversary live: nothing new, everything perfect, in bundles
  { services: 6, downtime: 260, bypass: 2, bundles: 4, inventory: { velcro: 8 }, cords: [[0.5, 4], [0.75, 4], [1, 4]] },
];

/** what every ticket shares: cords coloured by service, labels; copper, and power once a power strip is in */
function base(index: number, units: UnitSpec[], spec: TicketSpec): Omit<TicketLevel, 'cables'> {
  const types: CordType[] = units.some((u) => u.style === 'pdu') ? ['CU', 'PWR'] : ['CU'];
  return {
    id: `career-${index + 1}`,
    kind: 'ticket',
    ticket: index,
    units,
    ...MESS,
    labels: true, services: spec.services, types, colorByService: true,
    downtime: spec.downtime, bypass: spec.bypass, faults: spec.faults, bundles: spec.bundles,
    incidents: spec.incidents ? drawIncidents(spec.incidents, rng(SEED + 100 + index)) : undefined,
    inventory: spec.inventory,
    cords: spec.cords,
    preinstalled: [],
    seed: SEED + index,
  };
}

/**
 * Ticket `index`, from the cabinet as the player left it after the one before
 * (null: the first visit, which starts from the mess).
 */
export function ticketLevel(index: number, cabinet: CabinetState | null): TicketLevel {
  const spec = TICKETS[index];
  if (!cabinet) {
    return {
      ...base(index, FIRST_UNITS, spec), cables: FIRST_CORDS,
      links: [{ a: 'S24', b: 'F1' }, { a: 'F8', b: 'R1', service: 3 }],
      preinstalled: [fingerManager(3), fingerManager(9)],
    };
  }
  const units = cabinet.units.map((u) => ({ ...u }));
  for (const i of spec.install ?? []) units[i.unit] = i.spec;
  const rack = new Rack(units);
  const random = rng(SEED + index);
  const kept = withoutSome(rack, cabinet.circuits, spec.remove ?? 0, random);
  const freed = new Set(cabinet.circuits.filter((c) => !kept.includes(c)).flatMap((c) => [c.a, c.b]));
  // the links between equipment first: their ports are reserved
  const links = equipmentLinks(rack, kept, spec.links ?? []);
  const added = [...newLinks(rack, [...kept, ...links], freed, spec.add ?? 0, spec.services, random), ...links];
  const circuits = [...kept, ...added];
  const level = base(index, units, spec);
  // the new cords: put in by somebody in a hurry, one end often left hanging; of their service's colour
  const fresh = makeCables({ ...level, cables: added.length, wrong: 0, loose: Math.ceil(added.length / 2) } as LevelDef, rack, added, random)
    .map((s, i) => ({ ...s, color: SERVICES[added[i].service].color }));
  return {
    ...level,
    cables: circuits.length,
    schedule: () => circuits,
    starts: [...cabinet.cords, ...fresh],
    straps: cabinet.straps,
    preinstalled: cabinet.items,
  };
}

/** the schedule without `count` panel links, drawn (equipment links stay) */
function withoutSome(rack: Rack, circuits: readonly Circuit[], count: number, random: () => number): Circuit[] {
  const panelLinks = shuffle(circuits.filter((c) => rack.units[rack.port(c.a).unit].kind === 'panel'), random).slice(0, count);
  return circuits.filter((c) => !panelLinks.includes(c));
}

/** the links between equipment of a ticket, each from the highest free port of its switch */
function equipmentLinks(rack: Rack, schedule: readonly Circuit[], links: NonNullable<TicketSpec['links']>): Circuit[] {
  const used = new Set(schedule.flatMap((c) => [c.a, c.b]));
  return links.map((l) => {
    const from = rack.ports.filter((p) => rack.units[p.unit].name === l.from && !used.has(p.id)).pop()!;
    used.add(from.id);
    return { a: from.id, b: l.to, type: l.type ?? 'CU', service: l.service ?? 3 };
  });
}

/**
 * `count` new links from a patch panel port to a port of the switch right
 * below it, both out of the schedule (a port of a link taken out of service
 * comes first: its old cord has to go), each of a service drawn among the
 * first `services`.
 */
function newLinks(rack: Rack, schedule: readonly Circuit[], freed: ReadonlySet<string>, count: number, services: number, random: () => number): Circuit[] {
  const used = new Set(schedule.flatMap((c) => [c.a, c.b]));
  // drawn, the freed ports last: they are taken first
  const free = (unit: number) => shuffle(rack.ports.filter((p) => p.unit === unit && !used.has(p.id)), random)
    .sort((p, q) => Number(freed.has(p.id)) - Number(freed.has(q.id)));
  const pairs = rack.units.map((u, k) => k).filter((k) => rack.units[k].kind === 'panel' && rack.units[k + 1]?.style === 'switch')
    .map((k) => ({ panel: free(k), sw: free(k + 1) }));
  const out: Circuit[] = [];
  for (let k = 0; k < count; k++) {
    // the pair with the most room left
    const pair = pairs.reduce((best, p) => (Math.min(p.panel.length, p.sw.length) > Math.min(best.panel.length, best.sw.length) ? p : best));
    if (!pair.panel.length || !pair.sw.length) break;
    out.push({ a: pair.panel.pop()!.id, b: pair.sw.pop()!.id, type: 'CU', service: Math.floor(random() * services) });
  }
  return out;
}
