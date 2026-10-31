// Which game modes are open, by one rule: the training and free play from the
// start, the career once the training is done. The first screens offer the
// training as the way in; free play is there to try things. A pure function
// over the saved progress.

import type { Progress } from './storage';
import { isTrainingDone } from './progress';

export type Mode = 'training' | 'career' | 'free';

/** the modes open from the start; the others open with the last level of the training */
const OPEN_FROM_START: readonly Mode[] = ['training', 'free'];

/** a mode is open: one of the start, or the training signed off */
export function isModeOpen(mode: Mode, progress: Progress): boolean {
  return OPEN_FROM_START.includes(mode) || isTrainingDone(progress);
}
