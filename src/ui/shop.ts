// The shop: looks to buy with what the jobs paid, one worn per slot (the
// velcros, the light round the cabinet). Its catalogue, and the rules of
// buying and wearing: pure functions over the saved wallet (storage.ts).

import { DEFAULT_LOOK, type Look } from '../render/look';
import type { Wallet } from './storage';
import type { Words } from './language';

export type LookSlot = keyof Look;

export interface LookItem {
  id: string;
  slot: LookSlot;
  name: Words;
  /** € (0: given) */
  price: number;
  /** the colour it gives its slot */
  value: string;
}

export const SHOP: LookItem[] = [
  { id: 'velcro-navy', slot: 'velcro', name: { fr: 'Marine', en: 'Navy' }, price: 0, value: DEFAULT_LOOK.velcro },
  { id: 'velcro-black', slot: 'velcro', name: { fr: 'Noir', en: 'Black' }, price: 40, value: '#151617' },
  { id: 'velcro-red', slot: 'velcro', name: { fr: 'Rouge', en: 'Red' }, price: 60, value: '#a3242a' },
  { id: 'velcro-green', slot: 'velcro', name: { fr: 'Vert', en: 'Green' }, price: 60, value: '#2f7d3a' },
  { id: 'velcro-orange', slot: 'velcro', name: { fr: 'Orange', en: 'Orange' }, price: 90, value: '#d9731a' },
  { id: 'velcro-pink', slot: 'velcro', name: { fr: 'Rose', en: 'Pink' }, price: 150, value: '#e05aa3' },
  { id: 'accent-cool', slot: 'accent', name: { fr: 'Froide', en: 'Cool' }, price: 0, value: DEFAULT_LOOK.accent },
  { id: 'accent-warm', slot: 'accent', name: { fr: 'Ambre', en: 'Amber' }, price: 80, value: '#ffb36b' },
  { id: 'accent-mint', slot: 'accent', name: { fr: 'Menthe', en: 'Mint' }, price: 120, value: '#7dffc0' },
  { id: 'accent-violet', slot: 'accent', name: { fr: 'Violette', en: 'Violet' }, price: 160, value: '#b48cff' },
  { id: 'accent-red', slot: 'accent', name: { fr: 'Alerte rouge', en: 'Red alert' }, price: 250, value: '#ff5a5a' },
];

/** the slots, in the order of the shop */
export const LOOK_SLOTS: LookSlot[] = ['velcro', 'accent'];

export function isOwned(wallet: Wallet, item: LookItem): boolean {
  return item.price === 0 || wallet.owned.includes(item.id);
}

/** the item worn in a slot: the one chosen, or the one given */
export function wornIn(wallet: Wallet, slot: LookSlot): LookItem {
  const chosen = SHOP.find((i) => i.id === wallet.equipped[slot] && i.slot === slot);
  return chosen && isOwned(wallet, chosen) ? chosen : SHOP.find((i) => i.slot === slot && i.price === 0)!;
}

/** buys an item; false when it is owned already or the wallet is too light */
export function buy(wallet: Wallet, item: LookItem): boolean {
  if (isOwned(wallet, item) || wallet.coins < item.price) return false;
  wallet.coins -= item.price;
  wallet.owned.push(item.id);
  return true;
}

/** wears an item in its slot; false when it is not owned */
export function wear(wallet: Wallet, item: LookItem): boolean {
  if (!isOwned(wallet, item)) return false;
  wallet.equipped[item.slot] = item.id;
  return true;
}

/** the look the wallet's items give */
export function lookOf(wallet: Wallet): Look {
  return { velcro: wornIn(wallet, 'velcro').value, accent: wornIn(wallet, 'accent').value };
}
