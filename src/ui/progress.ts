// The player's progress, level by level: best stars, best time, challenge
// won (the time challenge of the campaign, the gestures challenge of the
// puzzles); and the rules and gestures already met. Pure
// functions over the saved record: saving it is the caller's business
// (storage.ts).

import type { Career, Progress } from './storage';
import { BIG_BAYS, LEVELS, UNLOCK_STARS, nextLevelToPlay } from '../game/levels/campaign';
import { currentTicket } from './career';
import type { CampaignLevel } from '../game/levels/levelDef';
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
  /** stars recorded before this result */
  previousStars: number;
  /** three stars within the gestures of a puzzle */
  challengeWon: boolean;
}

/** three stars within the gestures of a puzzle (the only levels with a challenge) */
export function isChallengeWon(level: LevelDef, stars: number, moves: number): boolean {
  return stars === 3 && level.kind === 'puzzle' && moves <= level.moves;
}

/** keeps the best of each in the record, and tells what it held before */
export function recordResult(progress: Progress, level: LevelDef, stars: number, time: number, moves: number): LevelResult {
  const id = level.id;
  const previousStars = progress.stars[id] ?? 0;
  progress.stars[id] = Math.max(previousStars, stars);
  if (!progress.times[id] || time < progress.times[id]) progress.times[id] = time;
  const challengeWon = isChallengeWon(level, stars, moves);
  if (challengeWon) progress.challenges[id] = true;
  return { stars, time, moves, previousStars, challengeWon };
}

/** level `index` of `levels` (the training, the big cabinets) can be played: the first one, one after a tidy enough level, or one already played */
export function isUnlocked(progress: Progress, levels: readonly CampaignLevel[], index: number): boolean {
  const level = levels[index];
  return index === 0 || (progress.stars[levels[index - 1].id] ?? 0) >= UNLOCK_STARS || (progress.stars[level.id] ?? 0) > 0;
}

/** the level after this one in the training or among the big cabinets, if any */
export function levelAfter(level: LevelDef): LevelDef | null {
  for (const levels of [LEVELS, BIG_BAYS]) {
    const index = levels.findIndex((l) => l.id === level.id);
    if (index >= 0) return index + 1 < levels.length ? levels[index + 1] : null;
  }
  return null;
}

/** where the story stands: the first level of the training not tidy enough yet, then the ticket of the career (undefined: both done) */
export function nextInStory(progress: Progress, career: Career): LevelDef | undefined {
  return nextLevelToPlay(progress.stars) ?? currentTicket(career) ?? undefined;
}

/** the last cabinet of the training: the career comes after it */
export function endsTheTraining(level: LevelDef): boolean {
  return level.id === LEVELS[LEVELS.length - 1].id;
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
  for (const level of [...LEVELS, ...BIG_BAYS, ...PUZZLES]) {
    if ((progress.stars[level.id] ?? 0) > 0) for (const item of of(level)) known.add(item);
  }
  return known;
}

/** the rules (or gestures) met, with those just met, each once */
export function withMet<T>(saved: readonly T[], met: readonly T[]): T[] {
  return [...new Set([...saved, ...met])];
}
