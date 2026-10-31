// The career, as the player goes along: the ticket to play next, built from
// the client's cabinet as the last one left it, and the record of a ticket
// signed off. Pure functions over the saved career (storage.ts).

import { TICKETS, ticketLevel } from '../game/levels/career';
import type { TicketLevel } from '../game/levels/levelDef';
import type { CabinetState } from '../game/cabinetState';
import type { Career, LevelRecord } from './storage';
import { bestRecord } from './levelRecord';

/** the ticket to play now (null: the career is over) */
export function currentTicket(career: Career): TicketLevel | null {
  return career.done < TICKETS.length ? ticketLevel(career.done, career.cabinet) : null;
}

/**
 * A ticket signed off: the cabinet is kept as it is now, with the ticket's
 * record, and the next ticket opens. The last ticket signed off again (the
 * player went on tidying) keeps the cabinet as it is now; an older one
 * changes nothing.
 */
export function recordTicket(career: Career, ticket: number, record: LevelRecord, cabinet: CabinetState): void {
  if (ticket === career.done) career.done++;
  if (ticket !== career.done - 1) return;
  career.cabinet = cabinet;
  career.records[ticket] = bestRecord(career.records[ticket], record);
}
