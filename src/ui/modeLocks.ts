// Which game modes are open, by one rule: the training and free play from the
// start, everything else (the career, the puzzles, the cabinet of the day,
// the big cabinets) once the training is done. The first screens offer the
// training as the way in; free play is there to try things. Pure functions
// over the saved records.

import { LEVELS } from '../game/levels/campaign';
import { load, type Progress } from './storage';

export type Mode = 'campaign' | 'puzzles' | 'daily' | 'career' | 'big' | 'free';

/** what the open modes are read from */
export interface ModeRecords {
  progress: Progress;
}

/** the modes open from the start; the others open with the last level of the training */
const OPEN_FROM_START: readonly Mode[] = ['campaign', 'free'];

/** the level of the training that opens the other modes */
export const TRAINING_END = LEVELS[LEVELS.length - 1].id;

/** a mode is open: one of the start, or the training signed off */
export function isModeOpen(mode: Mode, r: ModeRecords): boolean {
  return OPEN_FROM_START.includes(mode) || (r.progress.stars[TRAINING_END] ?? 0) > 0;
}

/** the records the open modes are read from, as saved */
export function savedModeRecords(): ModeRecords {
  return { progress: load('progress') };
}
