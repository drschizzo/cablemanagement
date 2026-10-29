// Which game modes are open: the training from the start, the others one by
// one as the story goes (the puzzles and the cabinet of the day along the
// training, the career at its end, the big cabinets and free play along the
// career), so that the first screens offer one way only. Pure functions over
// the saved records, and those records as storage.ts keeps them.

import { BIG_BAYS } from '../game/levels/campaign';
import { PUZZLES } from '../game/levels/puzzles';
import { load, type Career, type DailyResult, type Progress } from './storage';
import { assertNever } from '../lib/assertNever';

export type Mode = 'campaign' | 'puzzles' | 'daily' | 'career' | 'big' | 'free';

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

/** what opens a mode: a level of the training signed off, or tickets of the career done */
export type Opener = { level: string } | { tickets: number };

/** what opens each mode (null: open from the start) */
const OPENS_AFTER: Record<Mode, Opener | null> = {
  campaign: null,
  puzzles: { level: 'l2' },
  daily: { level: 'l3' },
  // the career is the game once the training is done
  career: { level: 'l5' },
  big: { tickets: 2 },
  free: { tickets: 4 },
};

/** what opens a mode (null: open from the start) */
export function modeOpensAfter(mode: Mode): Opener | null {
  return OPENS_AFTER[mode];
}

/** a mode is open: what opens it done, or the mode played already (a save from before the locks keeps its modes) */
export function isModeOpen(mode: Mode, r: ModeRecords): boolean {
  const after = OPENS_AFTER[mode];
  if (after === null) return true;
  if ('level' in after ? (r.progress.stars[after.level] ?? 0) > 0 : r.career.done >= after.tickets) return true;
  const played = (ids: string[]) => ids.some((id) => (r.progress.stars[id] ?? 0) > 0);
  switch (mode) {
    case 'campaign': return true;
    case 'puzzles': return played(PUZZLES.map((p) => p.id));
    case 'daily': return Object.keys(r.daily).length > 0;
    // a save from when the career opened earlier, and the big cabinets were the end of the campaign
    case 'career': return r.career.done > 0 || r.career.cabinet !== null;
    case 'big': return played(BIG_BAYS.map((l) => l.id));
    case 'free': return r.freeOpen || r.editorDraft !== '' || played(['l8']) || Object.keys(r.progress.stars).some((id) => id.startsWith('free-'));
    default: return assertNever(mode);
  }
}

/** the records the open modes are read from, as saved */
export function savedModeRecords(): ModeRecords {
  return { progress: load('progress'), career: load('career'), daily: load('daily'), freeOpen: load('freeOpen'), editorDraft: load('editorDraft') };
}
