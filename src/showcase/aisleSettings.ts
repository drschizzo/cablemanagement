// What the title screen's aisles look like: the one it opens on, those that
// come after, and where the camera rests (the page's options may change them).

import { SHOWCASE_DEFAULT } from '../game/levels/showcaseRack';

/**
 * The aisle as it opens, seen closer than it is framed and from above,
 * looking low: the cords fill the screen and the floor where they heap up
 * shows (see CameraRig.view).
 */
const TITLE_VIEW = { zoom: 0.61, elevation: 0.28, lower: 0.48 };

export interface AisleSettings {
  bays: number;
  /** the first aisle is the default one, whose mess is baked */
  isDefault: boolean;
  /** the seed of the first aisle (undefined: drawn at random) */
  firstSeed: number | undefined;
  /** the heights of the racks of the first aisle: as asked, or those of the default one */
  firstPairs: number | number[];
  /** the heights of the racks of another aisle: as asked, or each drawn between 5 and 12 pairs */
  anotherPairs: () => number | number[];
  /**
   * Where the camera rests: TITLE_VIEW for an aisle of the default width,
   * whatever its height; null for another one, which keeps the framing that fits it.
   */
  view: { zoom: number; elevation: number; lower: number } | null;
}

/** `o`: the page's options (app/urlOptions.ts), pairs and seed 0 when not given */
export function aisleSettings(o: { bays: number; pairs: number; seed: number }): AisleSettings {
  const isDefault = o.bays === SHOWCASE_DEFAULT.bays && !o.pairs;
  return {
    bays: o.bays,
    isDefault,
    firstSeed: o.seed || (isDefault ? SHOWCASE_DEFAULT.seed : undefined),
    firstPairs: o.pairs || (isDefault ? SHOWCASE_DEFAULT.pairs : 10),
    anotherPairs: () => o.pairs || Array.from({ length: o.bays }, () => 5 + Math.floor(Math.random() * 8)),
    view: o.bays === SHOWCASE_DEFAULT.bays ? TITLE_VIEW : null,
  };
}
