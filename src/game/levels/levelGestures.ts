// The gestures a level calls for beyond the tutorial's (grab, plug, route
// through a cable manager): the ducts it gives to place. (The velcro is
// optional: its help is on its button and in the tutorial.) The brief explains a gesture the first time the player
// needs it, and only recalls it after (ui/levelBrief.ts).

import type { LevelDef } from './levelDef';
import { assertNever } from '../../lib/assertNever';

/** every gesture a brief may explain, in the order it tells them */
export const GESTURES = ['duct'] as const;

export type Gesture = typeof GESTURES[number];

/** the gestures this level calls for, in the order of GESTURES */
export function levelGestures(level: LevelDef): Gesture[] {
  return GESTURES.filter((gesture) => callsFor(level, gesture));
}

function callsFor(level: LevelDef, gesture: Gesture): boolean {
  const has = (kind: 'duct') => (level.inventory[kind] ?? 0) > 0 || level.preinstalled.some((p) => p.kind === kind);
  switch (gesture) {
    case 'duct': return has('duct');
    default: return assertNever(gesture);
  }
}
