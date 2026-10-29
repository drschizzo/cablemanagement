// What the tooltip says of a cord under the pointer, as data: its type, its
// ends (unless it is unmarked and not traced yet), its length, the line it
// makes, whether it is strained. ui/messages.ts puts it into words.

import type { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { CordInfo } from './messages';
import type { CordPick } from './picking';

/** `traced`: the cords traced at least once (an unmarked cord then tells where it goes) */
export function cordInfo(world: World, ev: Evaluation, traced: Set<number>, p: CordPick): CordInfo {
  const cb = world.cables[p.cable];
  const line = ev.circuits.findIndex((s) => s.cable === p.cable);
  // an unmarked cord says where it goes once traced, or once it makes its line
  const blind = world.level.kind === 'campaign' && !!world.level.blind;
  const known = !blind || traced.has(p.cable) || (line >= 0 && ev.circuits[line].connected);
  return {
    type: cb.type,
    ends: known ? cb.ends.map((e) => e.port) : null,
    length: world.cableLength(p.cable),
    line,
    strain: ev.cableStrain[p.cable],
  };
}
