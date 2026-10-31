// Where a level takes place: the room round its cabinet is drawn from it
// (render/serverRoom/). Every ticket of the career is at the one client's;
// any other level has a room of its own, the same each time it is played.

import { assertNever } from '../../lib/assertNever';
import type { LevelDef } from './levelDef';

/** the place a level is played in: two levels with the same place stand in the same room */
export function levelSite(level: LevelDef): string {
  switch (level.kind) {
    // the client's premises, visit after visit
    case 'ticket': return 'career';
    case 'campaign':
    case 'tutorial':
    case 'showcase':
    case 'bench': return `${level.kind}:${level.id}`;
    // a cabinet drawn at random: a room drawn with it
    case 'free': return `free:${level.seed}`;
    default: return assertNever(level);
  }
}
