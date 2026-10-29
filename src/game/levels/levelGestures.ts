// The gestures a level calls for beyond the tutorial's (grab, plug, route
// through a cable manager): the supports it gives to place, the velcro once
// bundles count. The brief explains a gesture the first time the player
// needs it, and only recalls it after (ui/levelBrief.ts).

import type { LevelDef } from './levelDef';
import { assertNever } from '../../lib/assertNever';

/** every gesture a brief may explain, in the order it tells them */
export const GESTURES = ['duct', 'ring', 'velcro'] as const;

export type Gesture = typeof GESTURES[number];

/** the gestures this level calls for, in the order of GESTURES */
export function levelGestures(level: LevelDef): Gesture[] {
  return GESTURES.filter((gesture) => callsFor(level, gesture));
}

function callsFor(level: LevelDef, gesture: Gesture): boolean {
  const has = (kind: 'duct' | 'ring') => (level.inventory[kind] ?? 0) > 0 || level.preinstalled.some((p) => p.kind === kind);
  switch (gesture) {
    case 'duct': return has('duct');
    case 'ring': return has('ring');
    // velcros help any cabinet read better; they count once the level asks for bundles
    case 'velcro': return (level.bundles ?? 0) > 0;
    default: return assertNever(gesture);
  }
}
