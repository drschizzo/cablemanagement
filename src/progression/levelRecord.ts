// The record a cabinet signed off leaves: the client's requirements it met,
// of those it asks, and the time; and the better of two records. Pure
// functions: the training and the big cabinets keep theirs in the progress,
// the career with its tickets (storage.ts).

import type { LevelRecord } from './storage';
import { isGoalMet, requirementsOf, type Evaluation } from '../game/evaluation';

/** the record of a cabinet signed off after `time` s */
export function recordOf(ev: Evaluation, time: number): LevelRecord {
  const requirements = requirementsOf(ev);
  return { met: requirements.filter(isGoalMet).length, asked: requirements.length, time };
}

/** the better of the record kept and a new one: the most requirements met, the shortest time */
export function bestRecord(kept: LevelRecord | undefined, record: LevelRecord): LevelRecord {
  if (!kept) return record;
  return { met: Math.max(kept.met, record.met), asked: record.asked, time: Math.min(kept.time, record.time) };
}

/** a record's tally in the notebook: one tick for the cabinet signed off, one per requirement met */
export function ticksOf(record: LevelRecord): number {
  return 1 + record.met;
}
