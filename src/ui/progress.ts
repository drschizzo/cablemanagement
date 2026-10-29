// The player's progress, level by level: best stars, best time, best
// readability note, time challenge won. Pure functions over the saved record:
// saving it is the caller's business (storage.ts).

import type { Progress } from '../storage';
import { LEVELS } from '../game/levels/campaign';
import { UNLOCK_STARS, type LevelDef } from '../game/levels/levelDef';

/** a level just validated, and what the record said before it */
export interface LevelResult {
  stars: number;
  /** seconds of play */
  time: number;
  note: number;
  /** stars and note recorded before this result (note: undefined if never validated) */
  previousStars: number;
  previousNote: number | undefined;
  /** three stars within the level's time challenge */
  challengeWon: boolean;
}

/** keeps the best of each in the record, and tells what it held before */
export function recordResult(progress: Progress, level: LevelDef, stars: number, time: number, note: number): LevelResult {
  const id = level.id;
  const previousStars = progress.stars[id] ?? 0;
  const previousNote = progress.notes[id];
  progress.stars[id] = Math.max(previousStars, stars);
  if (!progress.times[id] || time < progress.times[id]) progress.times[id] = time;
  progress.notes[id] = Math.max(previousNote ?? 0, note);
  const challengeWon = level.kind === 'campaign' && stars === 3 && time <= level.par;
  if (challengeWon) progress.challenges[id] = true;
  return { stars, time, note, previousStars, previousNote, challengeWon };
}

/** a level can be played: the first one, one after a tidy enough level, or one already played */
export function isUnlocked(progress: Progress, index: number): boolean {
  const level = LEVELS[index];
  return index === 0 || (progress.stars[LEVELS[index - 1].id] ?? 0) >= UNLOCK_STARS || (progress.stars[level.id] ?? 0) > 0;
}

/** the level after this one in the campaign, if any */
export function levelAfter(level: LevelDef): LevelDef | null {
  const index = LEVELS.findIndex((l) => l.id === level.id);
  return index >= 0 && index + 1 < LEVELS.length ? LEVELS[index + 1] : null;
}
