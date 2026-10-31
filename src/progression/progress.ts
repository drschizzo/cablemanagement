// The player's progress, level by level: the record of each cabinet signed
// off (the client's requirements met, the time), what opens the levels of the
// training, where the story stands; and the rules already met. Pure functions
// over the saved record: saving it is the caller's business (storage.ts).

import type { Career, LevelRecord, Progress } from './storage';
import { TRAINING } from '../game/levels/training';
import { currentTicket } from './career';
import type { LevelDef, TrainingLevel } from '../game/levels/levelDef';
import { bestRecord } from './levelRecord';

/** keeps the best of a level's record and a new one */
export function recordLevel(progress: Progress, level: LevelDef, record: LevelRecord): void {
  progress.levels[level.id] = bestRecord(progress.levels[level.id], record);
}

/** the level `id` was signed off once */
export function isSignedOff(progress: Progress, id: string): boolean {
  return Object.hasOwn(progress.levels, id);
}

/** level `index` of the training can be played: the first one, one after a level signed off, or one already signed off */
export function isUnlocked(progress: Progress, index: number): boolean {
  return index === 0 || isSignedOff(progress, TRAINING[index - 1].id) || isSignedOff(progress, TRAINING[index].id);
}

/** the first level of the training not signed off yet (undefined: all are) */
export function nextTrainingLevel(progress: Progress): TrainingLevel | undefined {
  return TRAINING.find((l) => !isSignedOff(progress, l.id));
}

/** the level after this one in the training, if any */
export function levelAfter(level: LevelDef): LevelDef | null {
  const index = TRAINING.findIndex((l) => l.id === level.id);
  return index >= 0 && index + 1 < TRAINING.length ? TRAINING[index + 1] : null;
}

/** where the story stands: the first level of the training not signed off yet, then the ticket of the career (undefined: both done) */
export function nextInStory(progress: Progress, career: Career): LevelDef | undefined {
  return nextTrainingLevel(progress) ?? currentTicket(career) ?? undefined;
}

/** the last cabinet of the training: the career comes after it */
export function endsTheTraining(level: LevelDef): boolean {
  return level.id === TRAINING[TRAINING.length - 1].id;
}

/** the last cabinet of the training signed off: the career is open */
export function isTrainingDone(progress: Progress): boolean {
  return isSignedOff(progress, TRAINING[TRAINING.length - 1].id);
}

/** the rules met, with those just met, each once */
export function withMet<T>(saved: readonly T[], met: readonly T[]): T[] {
  return [...new Set([...saved, ...met])];
}
