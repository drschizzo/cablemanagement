// The player's progress, level by level: best stars and best time; and the
// rules and gestures already met. Pure functions over the saved record:
// saving it is the caller's business (storage.ts).

import type { Career, Progress } from './storage';
import { BIG_BAYS, LEVELS, UNLOCK_STARS, nextLevelToPlay } from '../game/levels/campaign';
import { currentTicket } from './career';
import type { LevelDef } from '../game/levels/levelDef';
import { levelRules, type Rule } from '../game/levels/levelRules';
import { levelGestures, type Gesture } from '../game/levels/levelGestures';

/** a level just validated, and what the record said before it */
export interface LevelResult {
  stars: number;
  /** seconds of play */
  time: number;
  /** stars recorded before this result */
  previousStars: number;
}

/** keeps the best of each in the record, and tells what it held before */
export function recordResult(progress: Progress, level: LevelDef, stars: number, time: number): LevelResult {
  const id = level.id;
  const previousStars = progress.stars[id] ?? 0;
  progress.stars[id] = Math.max(previousStars, stars);
  if (!progress.times[id] || time < progress.times[id]) progress.times[id] = time;
  return { stars, time, previousStars };
}

/** level `index` of the training can be played: the first one, one after a tidy enough level, or one already played */
export function isUnlocked(progress: Progress, index: number): boolean {
  return index === 0 || (progress.stars[LEVELS[index - 1].id] ?? 0) >= UNLOCK_STARS || (progress.stars[LEVELS[index].id] ?? 0) > 0;
}

/** the level after this one in the training, if any */
export function levelAfter(level: LevelDef): LevelDef | null {
  const index = LEVELS.findIndex((l) => l.id === level.id);
  return index >= 0 && index + 1 < LEVELS.length ? LEVELS[index + 1] : null;
}

/** where the story stands: the first level of the training not tidy enough yet, then the ticket of the career (undefined: both done) */
export function nextInStory(progress: Progress, career: Career): LevelDef | undefined {
  return nextLevelToPlay(progress.stars) ?? currentTicket(career) ?? undefined;
}

/** the last cabinet of the training: the career comes after it */
export function endsTheTraining(level: LevelDef): boolean {
  return level.id === LEVELS[LEVELS.length - 1].id;
}

/** the last cabinet of the training signed off: the career is open */
export function isTrainingDone(progress: Progress): boolean {
  return (progress.stars[LEVELS[LEVELS.length - 1].id] ?? 0) > 0;
}

/**
 * The rules the player has met: those saved, and those of every campaign
 * level signed off (a save from before the rules were kept).
 */
export function knownRules(saved: readonly Rule[], progress: Progress): Set<Rule> {
  return knownOf(saved, progress, levelRules);
}

/** the gestures the player has been shown, as the rules */
export function knownGestures(saved: readonly Gesture[], progress: Progress): Set<Gesture> {
  return knownOf(saved, progress, levelGestures);
}

function knownOf<T>(saved: readonly T[], progress: Progress, of: (level: LevelDef) => T[]): Set<T> {
  const known = new Set(saved);
  for (const level of [...LEVELS, ...BIG_BAYS]) {
    if ((progress.stars[level.id] ?? 0) > 0) for (const item of of(level)) known.add(item);
  }
  return known;
}

/** the rules (or gestures) met, with those just met, each once */
export function withMet<T>(saved: readonly T[], met: readonly T[]): T[] {
  return [...new Set([...saved, ...met])];
}
