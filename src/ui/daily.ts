// The cabinets of the day the player has signed off: the best result of each
// day, the run of days in a row, and the result as a few lines to share (a
// grid of the links, like the word games). Pure functions over the saved
// record: saving it is the caller's business (storage.ts).

import type { Evaluation } from '../game/evaluation';
import type { DailyLevel } from '../game/levels/levelDef';
import { dayBefore } from '../game/levels/dailyLevel';
import type { DailyResult } from './storage';
import type { LevelResult } from './progress';
import { formatTime } from './format';
import { tr } from './language';

/** where the game is played, at the end of a shared result */
export const GAME_URL = 'https://drschizzo.github.io/cablemanagement/';

/** each line of the schedule: 2 tidy (plugged, routed, clear, relaxed), 1 plugged only, 0 not plugged */
export function linesOf(ev: Evaluation): number[] {
  return ev.circuits.map((s) => (s.connected && s.routed && s.clear && s.relaxed ? 2 : s.connected ? 1 : 0));
}

/** is `a` better than `b`: more stars, then a better note, then less time */
function isBetter(a: DailyResult, b: DailyResult): boolean {
  if (a.stars !== b.stars) return a.stars > b.stars;
  if (a.note !== b.note) return a.note > b.note;
  return a.time < b.time;
}

/** keeps the day's best result in the record, and tells what it held before */
export function recordDaily(record: Record<string, DailyResult>, level: DailyLevel, ev: Evaluation, time: number, moves: number): LevelResult {
  const before = record[level.date];
  // no budget (Infinity) is kept as 0: JSON has no Infinity
  const now: DailyResult = { stars: ev.stars, time, note: ev.readability.note, downtime: Math.round(ev.downtime), budget: Number.isFinite(ev.budget) ? ev.budget : 0, lines: linesOf(ev) };
  if (!before || isBetter(now, before)) record[level.date] = now;
  return { stars: ev.stars, time, moves, note: now.note, previousStars: before?.stars ?? 0, previousNote: before?.note, challengeWon: false };
}

/** days in a row with a cabinet signed off, up to today (or to yesterday, while today's is still to do) */
export function streak(record: Record<string, DailyResult>, today: string): number {
  let day = record[today] ? today : dayBefore(today);
  let n = 0;
  while (record[day]?.stars) {
    n++;
    day = dayBefore(day);
  }
  return n;
}

const SQUARES = ['⬛', '🟨', '🟩'];

/** the result as a few lines to paste anywhere: the cabinet's number, the stars and the time, the grid of its links */
export function shareText(level: DailyLevel, result: DailyResult, days: number): string {
  const stars = '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars);
  const grid: string[] = [];
  for (let i = 0; i < result.lines.length; i += 8) grid.push(result.lines.slice(i, i + 8).map((l) => SQUARES[l]).join(''));
  const budget = result.budget ? ` · ⚡ ${result.downtime}/${result.budget}` : '';
  return [
    tr({ fr: `Brassage — baie du jour n° ${level.number}`, en: `Brassage — cabinet of the day #${level.number}` }),
    `${stars} · ⏱ ${formatTime(result.time)} · ${tr({ fr: 'lisibilité', en: 'readability' })} ${result.note}${budget}`,
    ...grid,
    days > 1 ? tr({ fr: `🔥 ${days} jours de suite`, en: `🔥 ${days} days in a row` }) : '',
    GAME_URL,
  ].filter((line) => line).join('\n');
}
