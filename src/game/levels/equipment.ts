// The equipment levels are built from, one rack unit each. What their face
// plates say is the interface's (ui/names.ts, unitLabel).

import type { UnitSpec } from '../rack';

export const BLANK: UnitSpec = { kind: 'blank' };

// an optical distribution frame and its switch
export const opticalPanel = (name: string, ports: number): UnitSpec => ({ kind: 'panel', name, ports });
export const opticalSwitch = (name: string, ports: number): UnitSpec => ({ kind: 'switch', name, ports });

// a wiring closet's equipment
export const copperPanel = (name: string, ports: number): UnitSpec => ({ kind: 'panel', name, ports, style: 'copper' });
export const ethernetSwitch = (name: string, ports: number): UnitSpec => ({ kind: 'switch', name, ports, style: 'switch' });
export const firewall = (ports = 8): UnitSpec => ({ kind: 'switch', name: 'F', ports, style: 'firewall' });
export const router = (ports = 8): UnitSpec => ({ kind: 'switch', name: 'R', ports, style: 'router' });
export const FIREWALL = firewall();
export const ROUTER = router();
/** a server with two network cards, `at` m from its left edge */
export const server = (name: string, at: number): UnitSpec => ({ kind: 'server', name, portsAt: [at, at + 0.025], style: 'server' });
/** a server with two network cards and two power supplies, their inlets at the right end of its face */
export const poweredServer = (name: string, at: number): UnitSpec => ({ ...server(name, at), inlets: [0.17, 0.2] });
/** a power distribution unit: a row of C13 outlets */
export const pdu = (name = 'P', outlets = 8): UnitSpec => ({ kind: 'switch', name, ports: outlets, style: 'pdu' });
/** a server whose ports are not patched */
export const SERVER: UnitSpec = { kind: 'server', style: 'server' };
export const UPS: UnitSpec = { kind: 'server', style: 'ups' };

/** a finger manager installed in this unit */
export const fingerManager = (unit: number) => ({ kind: 'fingerManager' as const, unit, side: 0 });
