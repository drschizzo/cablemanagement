// The patching schedule of a level: which port goes to which, with which
// type of cord, for which service. Drawn at random for most levels, written
// by hand for some (LevelDef.schedule).

import type { Rack, Port } from './rack';
import { CORD_KINDS, type FibreType } from './cordTypes';
import type { LevelDef } from './levels/levelDef';
import { shuffle } from '../lib/random';

/** a line of the schedule: a link between two ports */
export interface Circuit {
  a: string;
  b: string;
  type: FibreType;
  service: number;
}

/** a schedule drawn for a level: panel cords to the access switches, then the links between equipment */
export function makeSchedule(level: LevelDef, rack: Rack, r: () => number): Circuit[] {
  const links = level.links ?? [];
  const reserved = new Set(links.flatMap((l) => [l.a, l.b]));
  const panelUnits = rack.units.map((u, k) => (u.kind === 'panel' ? k : -1)).filter((k) => k >= 0);
  // panel cords go to the access switches (not to the firewall or the router)
  const switchPorts = shuffle(rack.ports.filter((p) => {
    const u = rack.units[p.unit];
    return u.kind === 'switch' && (u.style ?? 'switch') === 'switch' && !reserved.has(p.id);
  }), r);
  // spread the cords over the panels, then over the ports of each panel
  const panelPorts = panelUnits.map((u) => shuffle(rack.ports.filter((p) => p.unit === u && !reserved.has(p.id)), r));
  const out: Circuit[] = [];
  // one-to-one patching: a panel right above a switch goes port i to port i
  const below = (k: number) => (level.pairing && rack.units[k + 1]?.kind === 'switch' ? rack.ports.filter((p) => p.unit === k + 1) : null);
  const taken = new Set<string>();
  for (let c = 0; c < level.cables; c++) {
    const pi = c % panelUnits.length;
    const sw = below(panelUnits[pi]);
    let a: Port, b: Port;
    if (sw) {
      const k = panelPorts[pi].findIndex((p) => sw[p.index] && !reserved.has(sw[p.index].id) && !taken.has(sw[p.index].id));
      a = panelPorts[pi].splice(k, 1)[0];
      b = sw[a.index];
    } else {
      a = panelPorts[pi].pop()!;
      do { b = switchPorts.pop()!; } while (taken.has(b.id));
    }
    taken.add(b.id);
    // copper panels take copper cords; fibre: one type per panel, or alternating
    const fibres = level.types.filter((t) => CORD_KINDS[t].family === 'fibre');
    const ti = panelUnits.length > 1 ? pi : c;
    const type: FibreType = rack.units[a.unit].style === 'copper' ? 'CU' : fibres[ti % Math.max(1, fibres.length)] ?? 'OS2';
    out.push({ a: a.id, b: b.id, type, service: Math.floor(r() * level.services) });
  }
  // the schedule reads best sorted by panel port
  out.sort((p, q) => rack.ports.indexOf(rack.port(p.a)) - rack.ports.indexOf(rack.port(q.a)));
  // then the links between equipment: uplinks, firewall, router, servers, their power
  for (const l of links) out.push({ a: l.a, b: l.b, type: l.type ?? 'CU', service: l.service ?? 3 });
  return out;
}
