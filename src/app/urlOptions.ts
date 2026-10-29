// The options a page address can carry, for testing and for showing the game:
//   ?sync        the physics on the main thread (deterministic, for automated checks)
//   ?bays=N      how many closets stand side by side in the before/after aisle (1..32)
//   ?pairs=N     how many panel / switch pairs each of them holds (1..16)
//   ?seed=N      the same first aisle every time
//   ?quality=N   the image held at that level of quality (0: full, see QUALITY), never adapted nor saved
//   ?rack=CODE   a cabinet of the editor, opened at once (its code: game/levels/customLevel.ts)

import { SHOWCASE_DEFAULT } from '../game/levels/showcaseRack';
import { QUALITY } from '../render/quality';

export interface UrlOptions {
  syncPhysics: boolean;
  bays: number;
  /** 0: not given */
  pairs: number;
  /** 0: not given */
  seed: number;
  /** a level of QUALITY; null: not given */
  quality: number | null;
  /** the code of a cabinet of the editor; null: not given */
  rack: string | null;
}

export function readUrlOptions(search: string): UrlOptions {
  const params = new URLSearchParams(search);
  const int = (name: string) => Number(params.get(name)) || 0;
  return {
    syncPhysics: params.has('sync'),
    bays: Math.max(1, Math.min(32, int('bays') || SHOWCASE_DEFAULT.bays)),
    pairs: Math.max(0, Math.min(16, int('pairs'))),
    seed: int('seed'),
    quality: params.has('quality') ? Math.max(0, Math.min(QUALITY.length - 1, int('quality'))) : null,
    rack: params.get('rack'),
  };
}

/** what the title screen's aisles look like, given the options */
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
   * The aisle as it opens, seen a little closer and lower than it is framed:
   * the cords fill the screen (an aisle of the default width, whatever its
   * height; another one keeps the framing that fits it).
   */
  view: { zoom: number; elevation: number; lower: number } | null;
}

export function aisleSettings(o: UrlOptions): AisleSettings {
  const isDefault = o.bays === SHOWCASE_DEFAULT.bays && !o.pairs;
  return {
    bays: o.bays,
    isDefault,
    firstSeed: o.seed || (isDefault ? SHOWCASE_DEFAULT.seed : undefined),
    firstPairs: o.pairs || (isDefault ? SHOWCASE_DEFAULT.pairs : 10),
    anotherPairs: () => o.pairs || Array.from({ length: o.bays }, () => 5 + Math.floor(Math.random() * 8)),
    view: o.bays === SHOWCASE_DEFAULT.bays ? { zoom: 0.69, elevation: 0.104, lower: 0.13 } : null,
  };
}
