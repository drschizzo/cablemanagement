// The technician's notebook: the finds picked up, and as a bonus looks that
// open with the ticks won (one per cabinet signed off, one per requirement of
// the client met), one equipped per slot (the velcros, the light round the
// cabinet). Its catalogue, when it opens, and the rules of equipping: pure
// functions over the saved record (storage.ts).

import { DEFAULT_LOOK, type Look } from '../render/look';
import type { FindId } from '../game/finds';
import type { Career, Progress, Notebook } from './storage';
import { isSignedOff } from './progress';
import { ticksOf } from './levelRecord';

export type LookSlot = keyof Look;

interface LookSpec {
  id: string;
  slot: LookSlot;
  /** ticks won that open it (0: given) */
  ticks: number;
  /** the colour it gives its slot */
  value: string;
}

/** the looks, by slot, the given one first; their names are the interface's (ui/names.ts) */
export const LOOKS = [
  { id: 'velcro-navy', slot: 'velcro', ticks: 0, value: DEFAULT_LOOK.velcro },
  { id: 'velcro-black', slot: 'velcro', ticks: 4, value: '#151617' },
  { id: 'velcro-red', slot: 'velcro', ticks: 8, value: '#a3242a' },
  { id: 'velcro-green', slot: 'velcro', ticks: 12, value: '#2f7d3a' },
  { id: 'velcro-orange', slot: 'velcro', ticks: 20, value: '#d9731a' },
  { id: 'velcro-pink', slot: 'velcro', ticks: 32, value: '#e05aa3' },
  { id: 'accent-cool', slot: 'accent', ticks: 0, value: DEFAULT_LOOK.accent },
  { id: 'accent-warm', slot: 'accent', ticks: 6, value: '#ffb36b' },
  { id: 'accent-mint', slot: 'accent', ticks: 16, value: '#7dffc0' },
  { id: 'accent-violet', slot: 'accent', ticks: 26, value: '#b48cff' },
  { id: 'accent-red', slot: 'accent', ticks: 40, value: '#ff5a5a' },
] as const satisfies readonly LookSpec[];

export type LookItem = (typeof LOOKS)[number];
export type LookId = LookItem['id'];

/** the training level whose sign-off opens the notebook, finds or not */
const NOTEBOOK_OPENS_AT = 'l3';

/** the notebook shows with the first find picked up, or once the player knows the trade (level 3 signed off) */
export function isNotebookOpen(progress: Progress, notebook: Notebook): boolean {
  return notebook.finds.length > 0 || isSignedOff(progress, NOTEBOOK_OPENS_AT);
}

/** the ticks of every cabinet signed off (the tutorial, the training, the big cabinets) and ticket of the career, added up */
export function ticksWon(progress: Progress, career: Career): number {
  return [...Object.values(progress.levels), ...career.records].reduce((sum, r) => sum + ticksOf(r), 0);
}

/** the slots, in the order of the notebook */
export const LOOK_SLOTS = Object.keys(DEFAULT_LOOK) as LookSlot[];

export function isOpen(ticks: number, item: LookItem): boolean {
  return ticks >= item.ticks;
}

/** the item equipped in a slot: the one chosen while it is open, or the one given */
export function equippedIn(notebook: Notebook, ticks: number, slot: LookSlot): LookItem {
  const chosen = (LOOKS as readonly LookItem[]).find((i) => i.id === notebook.equipped[slot] && i.slot === slot);
  return chosen && isOpen(ticks, chosen) ? chosen : (LOOKS as readonly LookItem[]).find((i) => i.slot === slot && i.ticks === 0)!;
}

/** equips an item in its slot; false when it is not open yet */
export function equip(notebook: Notebook, ticks: number, item: LookItem): boolean {
  if (!isOpen(ticks, item)) return false;
  notebook.equipped[item.slot] = item.id;
  return true;
}

/** the look the equipped items give */
export function lookOf(notebook: Notebook, ticks: number): Look {
  const look = { ...DEFAULT_LOOK };
  for (const slot of LOOK_SLOTS) look[slot] = equippedIn(notebook, ticks, slot).value;
  return look;
}

/** a find picked up joins the collection; false when it was in it already */
export function collectFind(notebook: Notebook, find: FindId): boolean {
  if (notebook.finds.includes(find)) return false;
  notebook.finds.push(find);
  return true;
}
