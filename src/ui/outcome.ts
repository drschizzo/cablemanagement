// What a signed-off cabinet leaves behind, by kind of level: its record (the
// progress, the cabinets of the day, the career, the rules and gestures
// met), the lines to share, and the level that comes next. The result screen
// shows it.

import type { World } from '../game/world';
import type { Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import { UNLOCK_STARS } from '../game/levels/campaign';
import { cabinetOf } from '../game/cabinetState';
import { assertNever } from '../lib/assertNever';
import { levelAfter, recordResult, withMet, type LevelResult } from './progress';
import { levelRules } from '../game/levels/levelRules';
import { levelGestures } from '../game/levels/levelGestures';
import { recordDaily, shareText, streak } from './daily';
import { currentTicket, recordTicket } from './career';
import { load, save, type Progress } from './storage';
import { customLink } from './share';
import { tr } from './language';

/** what a signed-off cabinet left in the record */
export interface Outcome {
  result: LevelResult;
  /** the time challenge was won before this result */
  challengeWonBefore: boolean;
  /** the result as lines to share (the cabinet of the day), or null */
  share: string | null;
  /** the level after this one, and whether it is open yet (null: none) */
  next: { level: LevelDef; open: boolean } | null;
}

/** a signed-off cabinet `w` of `level`, after `time` s and `moves` gestures: kept where its kind keeps it */
export function recordOutcome(level: LevelDef, ev: Evaluation, w: World, time: number, moves: number, progress: Progress): Outcome {
  // whatever the kind, its rules and gestures are met: the next briefs only recall them
  save('rules', withMet(load('rules'), levelRules(level)));
  save('gestures', withMet(load('gestures'), levelGestures(level)));
  switch (level.kind) {
    case 'campaign':
    case 'puzzle':
    case 'free': {
      const challengeWonBefore = !!progress.challenges[level.id];
      const result = recordResult(progress, level, ev.stars, time, moves);
      save('progress', progress);
      const after = levelAfter(level);
      // the next level opens on a tidy cabinet, not on a merely connected one
      const next = after && { level: after, open: Math.max(result.previousStars, ev.stars) >= UNLOCK_STARS };
      return { result, challengeWonBefore, share: null, next };
    }
    case 'tutorial': {
      const result = recordResult(progress, level, ev.stars, time, moves);
      save('progress', progress);
      return { result, challengeWonBefore: false, share: null, next: null };
    }
    case 'daily': {
      const days = load('daily');
      const result = recordDaily(days, level, ev, time, moves);
      save('daily', days);
      return { result, challengeWonBefore: false, share: shareText(level, days[level.date], streak(days, level.date)), next: null };
    }
    case 'ticket': {
      const career = load('career');
      recordTicket(career, level.ticket, ev.stars, cabinetOf(w));
      save('career', career);
      const result = recordResult(progress, level, ev.stars, time, moves);
      save('progress', progress);
      const after = currentTicket(career);
      const next = after && after.ticket === level.ticket + 1 ? { level: after, open: true } : null;
      return { result, challengeWonBefore: false, share: null, next };
    }
    // a cabinet of the editor is kept nowhere (it could be made as easy as anything), but its link is to share
    case 'custom':
      return { ...unrecorded(ev, time, moves), share: tr({ fr: `Ma baie sur Brassage, à vous de la ranger : ${customLink(level.spec)}`, en: `My cabinet on Brassage, your turn to tidy it: ${customLink(level.spec)}` }) };
    // nothing kept: the zen keeps no score; the title screen and the benches are never signed off
    case 'zen':
    case 'showcase':
    case 'bench':
      return unrecorded(ev, time, moves);
    default: return assertNever(level);
  }
}

/** a result kept nowhere */
function unrecorded(ev: Evaluation, time: number, moves: number): Outcome {
  return { result: { stars: ev.stars, time, moves, previousStars: 0, challengeWon: false }, challengeWonBefore: false, share: null, next: null };
}
