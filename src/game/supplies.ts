// What the player is given to tidy a cabinet: the supports, items placed in
// the rack that guide the cords (finger managers, ducts), and the
// velcros, straps closed round several cords. Everything the rules know of
// each sort lives here; the types are derived from this list, so that a new
// sort is added in one place and the compiler points at every switch (and
// every Record of the interface, its names) to complete.
//
// The bypasses are no supply: they belong to the maintenance window
// (maintenanceWindow.ts).

interface SupplyInfo {
  /** a support is an item of the rack; a strap closes round cords */
  category: 'support' | 'strap';
}

export const SUPPLIES = {
  fingerManager: { category: 'support' },
  duct: { category: 'support' },
  velcro: { category: 'strap' },
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
