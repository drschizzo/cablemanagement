// Which game modes are open: the campaign from the start, the others one by
// one as it goes (the puzzles, the cabinet of the day, the career, free
// play), so that the first screens offer one way only. Pure functions over
// the saved records, and those records as storage.ts keeps them.

import { LEVELS } from '../game/levels/campaign';
import { PUZZLES } from '../game/levels/puzzles';
import type { CampaignLevel } from '../game/levels/levelDef';
import { load, type Career, type DailyResult, type Progress } from './storage';
import { assertNever } from '../lib/assertNever';

export type Mode = 'campaign' | 'puzzles' | 'daily' | 'career' | 'free';

/** what the open modes are read from */
export interface ModeRecords {
  progress: Progress;
  career: Career;
  daily: Record<string, DailyResult>;
  /** free play was opened ahead of the campaign, on the player's word */
  freeOpen: boolean;
  /** the code of the last cabinet of the editor ('' : none) */
  editorDraft: string;
}

/** the campaign level whose sign-off opens each mode (null: open from the start) */
const OPENS_AFTER: Record<Mode, string | null> = {
  campaign: null,
  puzzles: 'l2',
  daily: 'l3',
  // the career runs in production from its first ticket: after the services are known
  career: 'l4',
  free: 'l8',
};

/** the level that opens a mode (null: open from the start) */
export function modeOpensAfter(mode: Mode): CampaignLevel | null {
  const id = OPENS_AFTER[mode];
  return id === null ? null : LEVELS.find((l) => l.id === id)!;
}

/** a mode is open: its level signed off, or played already (a save from before the locks keeps its modes) */
export function isModeOpen(mode: Mode, r: ModeRecords): boolean {
  const after = OPENS_AFTER[mode];
  if (after === null || (r.progress.stars[after] ?? 0) > 0) return true;
  switch (mode) {
    case 'campaign': return true;
    case 'puzzles': return PUZZLES.some((p) => (r.progress.stars[p.id] ?? 0) > 0);
    case 'daily': return Object.keys(r.daily).length > 0;
    case 'career': return r.career.done > 0 || r.career.cabinet !== null;
    case 'free': return r.freeOpen || r.editorDraft !== '' || Object.keys(r.progress.stars).some((id) => id.startsWith('free-'));
    default: return assertNever(mode);
  }
}

/** the records the open modes are read from, as saved */
export function savedModeRecords(): ModeRecords {
  return { progress: load('progress'), career: load('career'), daily: load('daily'), freeOpen: load('freeOpen'), editorDraft: load('editorDraft') };
}
