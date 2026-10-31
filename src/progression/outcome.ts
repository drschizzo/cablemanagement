// What a signed-off cabinet leaves behind, by kind of level: its record (the
// progress, the career, the rules met), the link to share a free cabinet, and
// the level that comes next. The result screen shows it.

import type { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import { UNLOCK_STARS } from '../game/levels/training';
import { cabinetOf } from '../game/cabinetState';
import { assertNever } from '../lib/assertNever';
import { endsTheTraining, levelAfter, recordResult, withMet, type LevelResult } from './progress';
import { levelRules } from '../game/levels/levelRules';
import { currentTicket, recordTicket } from './career';
import { load, save, type Progress } from './storage';
import type { FreeSpec } from '../game/levels/freeLevel';

/** what a signed-off cabinet left in the record */
export interface Outcome {
  result: LevelResult;
  /** a free cabinet to share by its link, or null */
  share: FreeSpec | null;
  /** the level after this one, and whether it is open yet (null: none) */
  next: { level: LevelDef; open: boolean } | null;
}

/** a signed-off cabinet `w` of `level`, after `time` s: kept where its kind keeps it */
export function recordOutcome(level: LevelDef, ev: Evaluation, w: World, time: number, progress: Progress): Outcome {
  // whatever the kind, its rules are met: the next briefs leave them out
  save('rules', withMet(load('rules'), levelRules(level)));
  switch (level.kind) {
    case 'training': {
      const result = recordResult(progress, level, ev.stars, time);
      save('progress', progress);
      // after the training, the career (the ticket where it stands)
      const after = levelAfter(level) ?? (endsTheTraining(level) ? currentTicket(load('career')) : null);
      // the next level opens on a tidy cabinet, not on a merely connected one
      const next = after && { level: after, open: Math.max(result.previousStars, ev.stars) >= UNLOCK_STARS };
      return { result, share: null, next };
    }
    // a big cabinet keeps its record, and leads nowhere
    case 'bigBay':
    case 'tutorial': {
      const result = recordResult(progress, level, ev.stars, time);
      save('progress', progress);
      return { result, share: null, next: null };
    }
    case 'ticket': {
      const career = load('career');
      recordTicket(career, level.ticket, ev.stars, cabinetOf(w));
      save('career', career);
      const result = recordResult(progress, level, ev.stars, time);
      save('progress', progress);
      const after = currentTicket(career);
      const next = after && after.ticket === level.ticket + 1 ? { level: after, open: true } : null;
      return { result, share: null, next };
    }
    // a free cabinet is kept nowhere (it could be made as easy as anything), but its link is to share
    case 'free':
      return { ...unrecorded(ev, time), share: level.spec };
    // the title screen and the benches are never signed off
    case 'showcase':
    case 'bench':
      return unrecorded(ev, time);
    default: return assertNever(level);
  }
}

/** a result kept nowhere */
function unrecorded(ev: Evaluation, time: number): Outcome {
  return { result: { stars: ev.stars, time, previousStars: 0 }, share: null, next: null };
}
