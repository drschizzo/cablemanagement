// The technician's notebook: the finds picked up, and as a bonus looks that
// open with the stars won, one equipped per slot (the velcros, the light
// round the cabinet). Its catalogue, when it opens, and the
// rules of equipping: pure functions over the saved record (storage.ts).

import { DEFAULT_LOOK, type Look } from '../render/look';
import { HANDMADE_LEVELS } from '../game/levels/handmade';
import type { FindId } from '../game/finds';
import type { Career, Progress, Notebook } from './storage';

export type LookSlot = keyof Look;

interface LookSpec {
  id: string;
  slot: LookSlot;
  /** stars won that open it (0: given) */
  stars: number;
  /** the colour it gives its slot */
  value: string;
}

/** the looks, by slot, the given one first; their names are the interface's (ui/names.ts) */
export const LOOKS = [
  { id: 'velcro-navy', slot: 'velcro', stars: 0, value: DEFAULT_LOOK.velcro },
  { id: 'velcro-black', slot: 'velcro', stars: 5, value: '#151617' },
  { id: 'velcro-red', slot: 'velcro', stars: 10, value: '#a3242a' },
  { id: 'velcro-green', slot: 'velcro', stars: 15, value: '#2f7d3a' },
  { id: 'velcro-orange', slot: 'velcro', stars: 25, value: '#d9731a' },
  { id: 'velcro-pink', slot: 'velcro', stars: 40, value: '#e05aa3' },
  { id: 'accent-cool', slot: 'accent', stars: 0, value: DEFAULT_LOOK.accent },
  { id: 'accent-warm', slot: 'accent', stars: 8, value: '#ffb36b' },
  { id: 'accent-mint', slot: 'accent', stars: 20, value: '#7dffc0' },
  { id: 'accent-violet', slot: 'accent', stars: 32, value: '#b48cff' },
  { id: 'accent-red', slot: 'accent', stars: 50, value: '#ff5a5a' },
] as const satisfies readonly LookSpec[];

export type LookItem = (typeof LOOKS)[number];
export type LookId = LookItem['id'];

/** the training level whose sign-off opens the notebook, finds or not */
const NOTEBOOK_OPENS_AT = 'l3';

/** the notebook shows with the first find picked up, or once the player knows the trade (level 3 signed off) */
export function isNotebookOpen(progress: Progress, notebook: Notebook): boolean {
  return notebook.finds.length > 0 || (progress.stars[NOTEBOOK_OPENS_AT] ?? 0) > 0;
}

/** the best stars of every cabinet of the training, big cabinet and ticket of the career, added up */
export function starsWon(progress: Progress, career: Career): number {
  const levels = HANDMADE_LEVELS.reduce((sum, l) => sum + (progress.stars[l.id] ?? 0), 0);
  return levels + career.stars.reduce((sum, s) => sum + (s ?? 0), 0);
}

/** the slots, in the order of the notebook */
export const LOOK_SLOTS = Object.keys(DEFAULT_LOOK) as LookSlot[];

export function isOpen(stars: number, item: LookItem): boolean {
  return stars >= item.stars;
}

/** the item equipped in a slot: the one chosen while it is open, or the one given */
export function equippedIn(notebook: Notebook, stars: number, slot: LookSlot): LookItem {
  const chosen = (LOOKS as readonly LookItem[]).find((i) => i.id === notebook.equipped[slot] && i.slot === slot);
  return chosen && isOpen(stars, chosen) ? chosen : (LOOKS as readonly LookItem[]).find((i) => i.slot === slot && i.stars === 0)!;
}

/** equips an item in its slot; false when it is not open yet */
export function equip(notebook: Notebook, stars: number, item: LookItem): boolean {
  if (!isOpen(stars, item)) return false;
  notebook.equipped[item.slot] = item.id;
  return true;
}

/** the look the equipped items give */
export function lookOf(notebook: Notebook, stars: number): Look {
  const look = { ...DEFAULT_LOOK };
  for (const slot of LOOK_SLOTS) look[slot] = equippedIn(notebook, stars, slot).value;
  return look;
}

/** a find picked up joins the collection; false when it was in it already */
export function collectFind(notebook: Notebook, find: FindId): boolean {
  if (notebook.finds.includes(find)) return false;
  notebook.finds.push(find);
  return true;
}
