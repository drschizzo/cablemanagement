// The player's progress, level by level: best stars, best time, best
// readability note, challenge won (the time challenge of the campaign, the
// gestures challenge of the puzzles); and the rules and gestures already met. Pure
// functions over the saved record: saving it is the caller's business
// (storage.ts).

import type { Progress } from './storage';
import { LEVELS, UNLOCK_STARS } from '../game/levels/campaign';
import { PUZZLES } from '../game/levels/puzzles';
import type { LevelDef } from '../game/levels/levelDef';
import { levelRules, type Rule } from '../game/levels/levelRules';
import { levelGestures, type Gesture } from '../game/levels/levelGestures';

/** a level just validated, and what the record said before it */
export interface LevelResult {
  stars: number;
  /** seconds of play */
  time: number;
  /** gestures that changed the cabinet */
  moves: number;
  note: number;
  /** stars and note recorded before this result (note: undefined if never validated) */
  previousStars: number;
  previousNote: number | undefined;
  /** three stars within the level's challenge (time, or gestures) */
  challengeWon: boolean;
}

/** three stars within the level's challenge: the time of the campaign, the gestures of a puzzle */
export function isChallengeWon(level: LevelDef, stars: number, time: number, moves: number): boolean {
  if (stars < 3) return false;
  switch (level.kind) {
    case 'campaign': return time <= level.par;
    case 'puzzle': return moves <= level.moves;
    default: return false;
  }
}

/** keeps the best of each in the record, and tells what it held before */
export function recordResult(progress: Progress, level: LevelDef, stars: number, time: number, moves: number, note: number): LevelResult {
  const id = level.id;
  const previousStars = progress.stars[id] ?? 0;
  const previousNote = progress.notes[id];
  progress.stars[id] = Math.max(previousStars, stars);
  if (!progress.times[id] || time < progress.times[id]) progress.times[id] = time;
  progress.notes[id] = Math.max(previousNote ?? 0, note);
  const challengeWon = isChallengeWon(level, stars, time, moves);
  if (challengeWon) progress.challenges[id] = true;
  return { stars, time, moves, note, previousStars, previousNote, challengeWon };
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

/**
 * The rules the player has met: those saved, and those of every campaign
 * level and puzzle signed off (a save from before the rules were kept).
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
  for (const level of [...LEVELS, ...PUZZLES]) {
    if ((progress.stars[level.id] ?? 0) > 0) for (const item of of(level)) known.add(item);
  }
  return known;
}

/** the rules (or gestures) met, with those just met, each once */
export function withMet<T>(saved: readonly T[], met: readonly T[]): T[] {
  return [...new Set([...saved, ...met])];
}

/** the time challenge shows once the level is signed off: the result screen tells it first */
export function isTimeChallengeKnown(progress: Progress, level: LevelDef): boolean {
  return level.kind === 'campaign' && (progress.stars[level.id] ?? 0) > 0;
}
