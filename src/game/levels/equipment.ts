// The equipment levels are built from, one rack unit each.

import type { UnitSpec } from '../rack';

export const BLANK: UnitSpec = { kind: 'blank' };

// an optical distribution frame and its switch
export const opticalPanel = (name: string, ports: number): UnitSpec => ({ kind: 'panel', name, ports, label: `Tiroir optique ${name}` });
export const opticalSwitch = (name: string, ports: number): UnitSpec => ({ kind: 'switch', name, ports, label: `Commutateur ${name}` });

// a wiring closet's equipment
export const copperPanel = (name: string, ports: number): UnitSpec => ({ kind: 'panel', name, ports, style: 'copper', label: `Panneau de brassage ${name}` });
export const ethernetSwitch = (name: string, ports: number): UnitSpec => ({ kind: 'switch', name, ports, style: 'switch', label: `Switch ${name}` });
export const firewall = (ports = 8): UnitSpec => ({ kind: 'switch', name: 'F', ports, style: 'firewall', label: 'Pare-feu' });
export const router = (ports = 8): UnitSpec => ({ kind: 'switch', name: 'R', ports, style: 'router', label: 'Routeur' });
export const FIREWALL = firewall();
export const ROUTER = router();
/** a server with two network cards, `at` m from its left edge */
export const server = (name: string, at: number): UnitSpec => ({ kind: 'server', name, portsAt: [at, at + 0.025], style: 'server', label: `Serveur ${name}` });
/** a server whose ports are not patched */
export const SERVER: UnitSpec = { kind: 'server', style: 'server', label: 'Serveur' };
export const UPS: UnitSpec = { kind: 'server', style: 'ups', label: 'Onduleur' };

/** a finger manager installed in this unit */
export const fingerManager = (unit: number) => ({ kind: 'fingerManager' as const, unit, side: 0 });
