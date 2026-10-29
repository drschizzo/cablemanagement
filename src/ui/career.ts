// The career, as the player goes along: the ticket to play next, built from
// the client's cabinet as the last one left it, and the record of a ticket
// signed off. Pure functions over the saved career (storage.ts).

import { TICKETS, ticketLevel } from '../game/levels/career';
import type { TicketLevel } from '../game/levels/levelDef';
import type { CabinetState } from '../game/cabinetState';
import type { Career } from './storage';

/** the ticket to play now (null: the career is over) */
export function currentTicket(career: Career): TicketLevel | null {
  return career.done < TICKETS.length ? ticketLevel(career.done, career.cabinet) : null;
}

/**
 * A ticket signed off: the cabinet is kept as it is now, and the next ticket
 * opens. The last ticket signed off again (the player went on tidying) keeps
 * the cabinet as it is now; an older one changes nothing.
 */
export function recordTicket(career: Career, ticket: number, stars: number, cabinet: CabinetState): void {
  if (ticket === career.done) career.done++;
  if (ticket !== career.done - 1) return;
  career.cabinet = cabinet;
  career.stars[ticket] = Math.max(career.stars[ticket] ?? 0, stars);
}
