// What the player is given to tidy a cabinet: the supports, items placed in
// the rack that guide the cords (finger managers, ducts, rings), and the
// velcros, straps closed round several cords. Everything known about each
// sort lives here; the types are derived from this list, so that a new sort
// is added in one place and the compiler points at every switch to complete.
//
// The bypasses are no supply: they belong to the maintenance window
// (maintenanceWindow.ts).

interface SupplyInfo {
  /** a support is an item of the rack; a strap closes round cords */
  category: 'support' | 'strap';
  /** what the player reads, one and several */
  singular: string;
  plural: string;
}

export const SUPPLIES = {
  fingerManager: { category: 'support', singular: 'guide-câbles', plural: 'guide-câbles' },
  duct: { category: 'support', singular: 'goulotte', plural: 'goulottes' },
  ring: { category: 'support', singular: 'anneau', plural: 'anneaux' },
  velcro: { category: 'strap', singular: 'velcro', plural: 'velcros' },
} as const satisfies Record<string, SupplyInfo>;

export type Supply = keyof typeof SUPPLIES;

/** the supports: the supplies placed in the rack as items */
export type ItemKind = { [K in Supply]: (typeof SUPPLIES)[K]['category'] extends 'support' ? K : never }[Supply];

export const ALL_SUPPLIES = Object.keys(SUPPLIES) as Supply[];
export const ITEM_KINDS = ALL_SUPPLIES.filter((s): s is ItemKind => SUPPLIES[s].category === 'support');

/** how many of each supply are left */
export type Stock = Record<Supply, number>;

/** a stock with what is given, and none of the rest */
export function stockOf(given: Partial<Stock> = {}): Stock {
  const stock = Object.fromEntries(ALL_SUPPLIES.map((s) => [s, 0])) as Stock;
  return { ...stock, ...given };
}

/** `count` of a supply, as the player reads it: "2 goulottes", "1 anneau" */
export function countOf(supply: Supply, count: number): string {
  return `${count} ${count > 1 ? SUPPLIES[supply].plural : SUPPLIES[supply].singular}`;
}
