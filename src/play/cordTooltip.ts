// The tooltip of a cord under the pointer: its type, its ends, its length, the
// line it makes, whether it is strained, and what the hand can do with it.

import { FIBRE_NAMES } from '../game/levels';
import type { World } from '../game/world';
import { STRAIN_LABELS, type Evaluation } from '../game/evaluation';
import type { Tool } from './context';
import type { CordPick } from './picking';

/** `traced`: the cords traced at least once (an unmarked cord then tells where it goes) */
export function describeCord(world: World, ev: Evaluation, tool: Tool, traced: Set<number>, p: CordPick): string {
  const cb = world.cables[p.cable];
  const line = ev.circuits.findIndex((s) => s.cable === p.cable);
  // an unmarked cord says where it goes once traced, or once it makes its line
  const known = !world.level.blind || traced.has(p.cable) || (line >= 0 && ev.circuits[line].connected);
  const ends = (known ? cb.ends.map((e) => e.port ?? '—').join(' ↔ ') : 'sans marque — <b>T</b> pour le tracer') + ` · ${world.cableLength(p.cable).toFixed(2).replace('.', ',')} m`;
  let text = `<b>${FIBRE_NAMES[cb.type]}</b> · ${ends}`;
  if (line >= 0) text += ` · <span class="ok">liaison ${line + 1} ✓</span>`;
  const strain = ev.cableStrain[p.cable];
  if (strain) text += ` · <span class="warn">${STRAIN_LABELS[strain]}</span>`;
  if (tool === 'hand' && (p.end >= 0 || world.endOfNode(p.node))) {
    const plugged = cb.ends[p.end >= 0 ? p.end : world.endOfNode(p.node)!.end].port;
    text += plugged ? '<br><i>connecteur : saisir et tirer pour débrancher</i>' : '<br><i>connecteur : relâchez-le devant un port pour le brancher</i>';
  }
  if (tool === 'hand') text += '<br><i>T : tracer · Suppr : au bac</i>';
  return text;
}
