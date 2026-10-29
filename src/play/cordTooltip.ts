// The tooltip of a cord under the pointer: its type, its ends, its length, the
// line it makes, whether it is strained. The chosen tool adds its own lines
// (ToolHandler.hoverNotes).

import { FIBRE_NAMES } from '../game/cordTypes';
import type { World } from '../game/world';
import { STRAIN_LABELS, type Evaluation } from '../game/evaluation';
import type { CordPick } from './picking';

/** `traced`: the cords traced at least once (an unmarked cord then tells where it goes) */
export function describeCord(world: World, ev: Evaluation, traced: Set<number>, p: CordPick): string {
  const cb = world.cables[p.cable];
  const line = ev.circuits.findIndex((s) => s.cable === p.cable);
  // an unmarked cord says where it goes once traced, or once it makes its line
  const known = !world.level.blind || traced.has(p.cable) || (line >= 0 && ev.circuits[line].connected);
  const ends = (known ? cb.ends.map((e) => e.port ?? '—').join(' ↔ ') : 'sans marque — <b>T</b> pour le tracer') + ` · ${world.cableLength(p.cable).toFixed(2).replace('.', ',')} m`;
  let text = `<b>${FIBRE_NAMES[cb.type]}</b> · ${ends}`;
  if (line >= 0) text += ` · <span class="ok">liaison ${line + 1} ✓</span>`;
  const strain = ev.cableStrain[p.cable];
  if (strain) text += ` · <span class="warn">${STRAIN_LABELS[strain]}</span>`;
  return text;
}
