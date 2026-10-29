// The result screen, once the cabinet is validated: the stars and the time,
// the cabinet before and after, the checks one by one, and the way on (next
// level, back to work, menu, home).

import type { Controller } from '../play/controller';
import { nextStar, type Evaluation } from '../game/evaluation';
import { UNLOCK_STARS } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import type { LevelResult } from './progress';
import type { Outcome } from './outcome';
import { starNeedText } from './messages';
import { tr } from './language';
import { levelTitle } from './levelTexts';
import { levelRules } from '../game/levels/levelRules';
import { saveBeforeAfter } from './beforeAfterImage';

export interface ResultActions {
  start(level: LevelDef): void;
  /** the timelapse of the work; back to the result after */
  replay(): void;
  /** the game modes; back to the result after */
  showModes(): void;
  /** the title screen */
  home(): void;
}

export function showResult(ctl: Controller, level: LevelDef, ev: Evaluation, outcome: Outcome, actions: ResultActions): void {
  const { result, challengeWonBefore, share } = outcome;
  $('#result-stars').innerHTML = starsHtml(ev.stars, true);
  $('#result-time').textContent = tr({ fr: `Temps : ${formatTime(result.time)}`, en: `Time: ${formatTime(result.time)}` });
  $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
  $<HTMLImageElement>('#ba-after').src = ctl.capture();
  $('#result-lines').innerHTML = resultLines(level, ev, result, challengeWonBefore).map((l) => `<li>${l}</li>`).join('');

  showNext(level, outcome.next, actions);
  $('#result-again').onclick = () => { hide('#result'); ctl.resume(); };
  $('#result-menu').onclick = () => { hide('#result'); actions.showModes(); };
  $('#result-home').onclick = () => { hide('#result'); actions.home(); };
  showShare(share);
  $<HTMLButtonElement>('#result-replay').disabled = !ctl.timelapse.frames.length;
  $('#result-replay').onclick = () => { hide('#result'); actions.replay(); };
  const after = $<HTMLImageElement>('#ba-after').src;
  $('#result-image').onclick = () => void saveBeforeAfter(ctl.before ?? after, after,
    { title: levelTitle(level), stars: ev.stars }, `${fileName(level)}.png`);
  show('#result');
}

/** the checks one by one, and what the next star needs */
function resultLines(level: LevelDef, ev: Evaluation, result: LevelResult, challengeWonBefore: boolean): string[] {
  const of = (n: number) => `${n}/${ev.total}`;
  const lines = [
    tr({ fr: `Liaisons branchées : ${of(ev.connected)}`, en: `Links plugged: ${of(ev.connected)}` }),
    tr({ fr: `Liaisons rangées : ${of(ev.routed)}`, en: `Links routed: ${of(ev.routed)}` }),
    tr({ fr: `Façade dégagée : ${of(ev.clear)}`, en: `Front clear: ${of(ev.clear)}` }),
    tr({ fr: `Ni tendus ni pliés : ${of(ev.relaxed)}`, en: `Neither taut nor kinked: ${of(ev.relaxed)}` }),
  ];
  const bundles = `${Math.min(ev.bundles, ev.bundlesNeeded)}/${ev.bundlesNeeded}`;
  if (ev.bundlesNeeded) lines.push(tr({ fr: `Faisceaux : ${bundles}`, en: `Bundles: ${bundles}` }));
  if (levelRules(level).includes('separation')) lines.push(ev.mixedSupports
    ? tr({ fr: `Goulottes ou anneaux mêlés : ${ev.mixedSupports}`, en: `Mixed ducts or rings: ${ev.mixedSupports}` })
    : tr({ fr: 'Chaque famille dans son couloir', en: 'Each family down its own channel' }));
  if (level.downtime !== undefined) {
    const spent = Math.round(ev.downtime);
    lines.push(ev.downtime > ev.budget
      ? `<span class="bad">${tr({ fr: `Incident : ${spent} pts d'interruption pour un budget de ${ev.budget}.`, en: `Incident: ${spent} pts of downtime for a budget of ${ev.budget}.` })}</span>`
      : tr({ fr: `Interruption : ${spent} pts sur ${ev.budget}.`, en: `Downtime: ${spent} pts of ${ev.budget}.` }));
  }
  const next = nextStar(ev);
  if (next) lines.push(`${'★'.repeat(next.stars)} : ${next.needs.map(starNeedText).join(' · ')}.`);
  if (level.kind === 'puzzle') {
    const most = level.moves, done = result.moves;
    lines.push(result.challengeWon
      ? tr({ fr: `✋ Défi gestes réussi : ★★★ en ${done} geste${done > 1 ? 's' : ''} !`, en: `✋ Gestures challenge won: ★★★ in ${done} gesture${done > 1 ? 's' : ''}!` })
      : tr({ fr: `✋ Défi gestes : ★★★ en ${most} gestes au plus (${done} cette fois)${challengeWonBefore ? ', déjà réussi' : ''}.`, en: `✋ Gestures challenge: ★★★ in ${most} gestures at most (${done} this time)${challengeWonBefore ? ', won already' : ''}.` }));
  }
  if (level.kind === 'campaign') lines.push(timeChallengeLine(level.par, result, challengeWonBefore));
  return lines;
}

/** the time challenge of a campaign level (its brief told it) */
function timeChallengeLine(par: number, result: LevelResult, challengeWonBefore: boolean): string {
  const time = formatTime(par);
  if (result.challengeWon) return tr({ fr: `⏱ Défi chrono réussi : ★★★ en moins de ${time} !`, en: `⏱ Time challenge won: ★★★ in less than ${time}!` });
  return tr({ fr: `⏱ Défi chrono : ★★★ en moins de ${time}${challengeWonBefore ? ' (déjà réussi)' : ''}.`, en: `⏱ Time challenge: ★★★ in less than ${time}${challengeWonBefore ? ' (won already)' : ''}.` });
}

/** the way on from `level`: the next level (or ticket, or the career after the training), open or what opens it */
function showNext(level: LevelDef, next: Outcome['next'], actions: ResultActions): void {
  const button = $<HTMLButtonElement>('#result-next');
  button.style.display = next ? '' : 'none';
  if (!next) return;
  button.disabled = !next.open;
  button.textContent = !next.open
    ? tr({ fr: `${'★'.repeat(UNLOCK_STARS)} pour le niveau suivant`, en: `${'★'.repeat(UNLOCK_STARS)} for the next level` })
    : next.level.kind !== 'ticket' ? tr({ fr: 'Niveau suivant →', en: 'Next level →' })
    : level.kind === 'ticket' ? tr({ fr: 'Ticket suivant →', en: 'Next ticket →' })
    : tr({ fr: 'La carrière : Radio Pinède →', en: 'The career: Radio Pinède →' });
  button.onclick = () => { if (next.open) { hide('#result'); actions.start(next.level); } };
}

/** the button that copies the result to share, when there is one */
function showShare(share: string | null): void {
  const button = $<HTMLButtonElement>('#result-share');
  button.style.display = share ? '' : 'none';
  button.textContent = tr({ fr: 'Copier le résultat', en: 'Copy the result' });
  if (!share) return;
  button.title = share;
  button.onclick = () => {
    const copied = () => { button.textContent = tr({ fr: 'Copié ✓', en: 'Copied ✓' }); };
    // the clipboard may be missing or refused (an insecure page, a browser's policy): the text then shows to copy by hand
    const byHand = () => { window.prompt(tr({ fr: 'Résultat à partager', en: 'Result to share' }), share); };
    if (navigator.clipboard) navigator.clipboard.writeText(share).then(copied, byHand);
    else byHand();
  };
}

/** a file name for what a level shares: brassage-l3, brassage-daily-2026-11-05 */
export function fileName(level: LevelDef): string {
  return `brassage-${level.id}`;
}
