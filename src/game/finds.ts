// The finds: odd things the technicians before left in the cabinets. A level
// says which one it hides (LevelBase.find); where it lies is drawn with the
// level, on the floor of the cabinet under the cords, on its roof, or in the
// crate. Picking it up is the player's (a click); keeping it, the workshop's.

import type { Rack } from './rack';
import { FRONT_Z } from './rack';
import type { V3 } from '../lib/vec3';
import { pick } from '../lib/random';

export const FINDS = ['postit', 'usb', 'mug', 'duck', 'floppy', 'screwdriver', 'badge', 'sandwich', 'keys', 'manual'] as const;
export type FindId = (typeof FINDS)[number];

/** a find lying in the cabinet */
export interface Find {
  id: FindId;
  /** where it lies (m): the middle of its base */
  at: V3;
}

/** where a find may lie: the floor of the cabinet (under the cords), its roof, the crate */
type Spot = 'floor' | 'roof' | 'crate';
const SPOTS: Spot[] = ['floor', 'floor', 'roof', 'crate'];

/** the find a level hides, laid in a spot drawn with `random` (null: it hides none; an open rack has no floor nor roof) */
export function placeFind(id: FindId | undefined, rack: Rack, random: () => number): Find | null {
  if (!id || rack.open) return null;
  const spot = pick(SPOTS, random);
  const along = random() - 0.5;
  switch (spot) {
    // far enough from the front edge (FRONT_Z) for the biggest, the manual, to lie inside
    case 'floor': return { id, at: [along * 0.5, rack.floorY, 0.04 + random() * 0.08] };
    case 'roof': return { id, at: [along * 0.6, rack.topY + 0.16, FRONT_Z - 0.12] };
    case 'crate': {
      const c = rack.crate();
      return { id, at: [(c.min[0] + c.max[0]) / 2 + along * 0.15, c.min[1] + 0.01, (c.min[2] + c.max[2]) / 2] };
    }
  }
}
