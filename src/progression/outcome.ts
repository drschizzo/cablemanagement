// What a signed-off cabinet leaves behind, by kind of level: its record (the
// progress, the career, the rules met), the free cabinet to share, and
// the level that comes next. The result screen shows it.

import type { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import { cabinetOf } from '../game/cabinetState';
import { assertNever } from '../lib/assertNever';
import { endsTheTraining, levelAfter, recordLevel, withMet } from './progress';
import { levelRules } from '../game/levels/levelRules';
import { currentTicket, recordTicket } from './career';
import { recordOf } from './levelRecord';
import { load, save, type LevelRecord, type Progress } from './storage';
import type { FreeSpec } from '../game/levels/freeLevel';

/** what a signed-off cabinet left in the record */
export interface Outcome {
  /** the record of this game (the one kept is the best of all) */
  record: LevelRecord;
  /** a free cabinet to share by its link, or null */
  share: FreeSpec | null;
  /** the level after this one (null: none) */
  next: LevelDef | null;
}

/** a signed-off cabinet `w` of `level`, after `time` s: kept where its kind keeps it */
export function recordOutcome(level: LevelDef, ev: Evaluation, w: World, time: number, progress: Progress): Outcome {
  // whatever the kind, its rules are met: the next briefs leave them out
  save('rules', withMet(load('rules'), levelRules(level)));
  const record = recordOf(ev, time);
  switch (level.kind) {
    case 'training': {
      recordLevel(progress, level, record);
      save('progress', progress);
      // after the training, the career (the ticket where it stands)
      const next = levelAfter(level) ?? (endsTheTraining(level) ? currentTicket(load('career')) : null);
      return { record, share: null, next };
    }
    // a big cabinet keeps its record, and leads nowhere
    case 'bigBay':
    case 'tutorial':
      recordLevel(progress, level, record);
      save('progress', progress);
      return { record, share: null, next: null };
    case 'ticket': {
      const career = load('career');
      recordTicket(career, level.ticket, record, cabinetOf(w));
      save('career', career);
      const after = currentTicket(career);
      return { record, share: null, next: after && after.ticket === level.ticket + 1 ? after : null };
    }
    // a free cabinet is kept nowhere (it could be made as easy as anything), but its link is to share
    case 'free':
      return { record, share: level.spec, next: null };
    // the title screen and the benches are never signed off
    case 'showcase':
    case 'bench':
      return { record, share: null, next: null };
    default: return assertNever(level);
  }
}
