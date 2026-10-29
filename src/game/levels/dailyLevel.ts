// The cabinet of the day: drawn from the date, so that every player gets the
// same one on the same day, small early in the week and bigger towards the
// weekend, when incidents come too, and a cord broken inside from Friday.

import type { DailyLevel } from './levelDef';
import { freeLevel } from './freeLevel';
import { drawIncidents } from '../incidents';
import { rng } from '../../lib/random';

/** the day of the first cabinet of the day (number 1) */
const FIRST_DAY = Date.UTC(2026, 9, 29);
const DAY_MS = 86_400_000;
/** cords by day of the week, Monday first: a gentle start, a bigger cabinet at the weekend */
const CORDS_BY_WEEKDAY = [8, 10, 12, 14, 16, 20, 24];

/** a calendar day as YYYY-MM-DD, in the player's own time zone */
export function dayKey(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** the day before, as YYYY-MM-DD */
export function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** a seed from a text: the same text, the same seed (FNV-1a) */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function dailyLevel(date: string): DailyLevel {
  const [y, m, d] = date.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  // getUTCDay: Sunday 0; the table starts on Monday
  const weekday = (new Date(utc).getUTCDay() + 6) % 7;
  const cables = CORDS_BY_WEEKDAY[weekday];
  const seed = seedOf(`brassage-${date}`);
  const weekend = weekday >= 5;
  return {
    ...freeLevel(cables, seed),
    incidents: weekend ? drawIncidents(2, rng(seed ^ 0x51ed)) : undefined,
    faults: weekday >= 4 ? 1 : 0,
    id: `daily-${date}`,
    kind: 'daily',
    date,
    number: Math.round((utc - FIRST_DAY) / DAY_MS) + 1,
  };
}
