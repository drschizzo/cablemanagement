// The technician's notebook (the workshop it was): the finds picked up, and
// as a bonus looks that open with the stars won, one equipped per slot (the
// velcros, the light round the cabinet). Its catalogue, when it opens, and the
// rules of equipping: pure functions over the saved record (storage.ts).

import { DEFAULT_LOOK, type Look } from '../render/look';
import { BIG_BAYS, LEVELS } from '../game/levels/campaign';
import type { FindId } from '../game/finds';
import type { Career, Progress, Workshop } from './storage';
import type { Words } from './language';

export type LookSlot = keyof Look;

export interface LookItem {
  id: string;
  slot: LookSlot;
  name: Words;
  /** stars won that open it (0: given) */
  stars: number;
  /** the colour it gives its slot */
  value: string;
}

export const SHOP: LookItem[] = [
  { id: 'velcro-navy', slot: 'velcro', name: { fr: 'Marine', en: 'Navy' }, stars: 0, value: DEFAULT_LOOK.velcro },
  { id: 'velcro-black', slot: 'velcro', name: { fr: 'Noir', en: 'Black' }, stars: 5, value: '#151617' },
  { id: 'velcro-red', slot: 'velcro', name: { fr: 'Rouge', en: 'Red' }, stars: 10, value: '#a3242a' },
  { id: 'velcro-green', slot: 'velcro', name: { fr: 'Vert', en: 'Green' }, stars: 15, value: '#2f7d3a' },
  { id: 'velcro-orange', slot: 'velcro', name: { fr: 'Orange', en: 'Orange' }, stars: 25, value: '#d9731a' },
  { id: 'velcro-pink', slot: 'velcro', name: { fr: 'Rose', en: 'Pink' }, stars: 40, value: '#e05aa3' },
  { id: 'accent-cool', slot: 'accent', name: { fr: 'Froide', en: 'Cool' }, stars: 0, value: DEFAULT_LOOK.accent },
  { id: 'accent-warm', slot: 'accent', name: { fr: 'Ambre', en: 'Amber' }, stars: 8, value: '#ffb36b' },
  { id: 'accent-mint', slot: 'accent', name: { fr: 'Menthe', en: 'Mint' }, stars: 20, value: '#7dffc0' },
  { id: 'accent-violet', slot: 'accent', name: { fr: 'Violette', en: 'Violet' }, stars: 32, value: '#b48cff' },
  { id: 'accent-red', slot: 'accent', name: { fr: 'Alerte rouge', en: 'Red alert' }, stars: 50, value: '#ff5a5a' },
];

/** the campaign level whose sign-off opens the notebook, finds or not */
const WORKSHOP_OPENS_AT = 'l3';

/** the notebook shows with the first find picked up, or once the player knows the trade (level 3 signed off) */
export function isWorkshopOpen(progress: Progress, workshop: Workshop): boolean {
  return workshop.finds.length > 0 || (progress.stars[WORKSHOP_OPENS_AT] ?? 0) > 0;
}

/** the best stars of every cabinet of the training, big cabinet and ticket of the career, added up */
export function starsWon(progress: Progress, career: Career): number {
  const levels = [...LEVELS, ...BIG_BAYS].reduce((sum, l) => sum + (progress.stars[l.id] ?? 0), 0);
  return levels + career.stars.reduce((sum, s) => sum + (s ?? 0), 0);
}

/** the slots, in the order of the workshop */
export const LOOK_SLOTS = Object.keys(DEFAULT_LOOK) as LookSlot[];

export function isOpen(stars: number, item: LookItem): boolean {
  return stars >= item.stars;
}

/** the item equipped in a slot: the one chosen while it is open, or the one given */
export function equippedIn(workshop: Workshop, stars: number, slot: LookSlot): LookItem {
  const chosen = SHOP.find((i) => i.id === workshop.equipped[slot] && i.slot === slot);
  return chosen && isOpen(stars, chosen) ? chosen : SHOP.find((i) => i.slot === slot && i.stars === 0)!;
}

/** equips an item in its slot; false when it is not open yet */
export function equip(workshop: Workshop, stars: number, item: LookItem): boolean {
  if (!isOpen(stars, item)) return false;
  workshop.equipped[item.slot] = item.id;
  return true;
}

/** the look the equipped items give */
export function lookOf(workshop: Workshop, stars: number): Look {
  const look = { ...DEFAULT_LOOK };
  for (const slot of LOOK_SLOTS) look[slot] = equippedIn(workshop, stars, slot).value;
  return look;
}

/** a find picked up joins the collection; false when it was in it already */
export function collectFind(workshop: Workshop, find: FindId): boolean {
  if (workshop.finds.includes(find)) return false;
  workshop.finds.push(find);
  return true;
}
