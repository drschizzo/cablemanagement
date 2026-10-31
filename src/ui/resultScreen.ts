// The result screen, once the cabinet is validated: the stars and the time,
// the cabinet before and after, the checks one by one, and the way on (next
// level, back to work, menu, home).

import type { Controller } from '../play/controller';
import { isGoalMet, starGoals, type Evaluation } from '../game/evaluation';
import { UNLOCK_STARS } from '../game/levels/training';
import type { LevelDef } from '../game/levels/levelDef';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import type { Outcome } from '../progression/outcome';
import { starGoalText } from './messages';
import { tr } from '../lib/language';
import { levelTitle } from './levelTexts';
import { saveBeforeAfter } from './beforeAfterImage';
import { freeLink } from './share';

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
  const { result, share } = outcome;
  $('#result-stars').innerHTML = starsHtml(ev.stars, true);
  $('#result-time').textContent = tr({ fr: `Temps : ${formatTime(result.time)}`, en: `Time: ${formatTime(result.time)}` });
  $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
  $<HTMLImageElement>('#ba-after').src = ctl.capture();
  $('#result-lines').innerHTML = resultLines(ev).map((l) => `<li>${l}</li>`).join('');

  showNext(level, outcome.next, actions);
  $('#result-again').onclick = () => { hide('#result'); ctl.resume(); };
  $('#result-menu').onclick = () => { hide('#result'); actions.showModes(); };
  $('#result-home').onclick = () => { hide('#result'); actions.home(); };
  showShare(share && tr({ fr: `Une baie à ranger sur Brassage : ${freeLink(share)}`, en: `A cabinet to tidy on Brassage: ${freeLink(share)}` }));
  $<HTMLButtonElement>('#result-replay').disabled = ctl.timelapse.frames.length < 2;
  $('#result-replay').onclick = () => { hide('#result'); actions.replay(); };
  const after = $<HTMLImageElement>('#ba-after').src;
  $('#result-image').onclick = () => void saveBeforeAfter(ctl.before ?? after, after,
    { title: levelTitle(level), stars: ev.stars }, `${fileName(level)}.png`);
  show('#result');
}

/** the goals of the three stars, one by one: reached, or what was missing */
function resultLines(ev: Evaluation): string[] {
  return starGoals(ev).map((g) => {
    const text = starGoalText(g), met = isGoalMet(g);
    const line = `${'★'.repeat(g.stars)} ${met ? '✓' : '✗'} ${text.label}${text.progress ? ` (${text.progress})` : ''}${text.detail ? ` : ${text.detail}` : ''}`;
    return met ? line : `<span class="bad">${line}</span>`;
  });
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

/** the button that copies the link of a free cabinet, when there is one */
function showShare(share: string | null): void {
  const button = $<HTMLButtonElement>('#result-share');
  button.style.display = share ? '' : 'none';
  button.textContent = tr({ fr: 'Copier le lien de la baie', en: 'Copy the cabinet\'s link' });
  if (!share) return;
  button.title = share;
  button.onclick = () => {
    const copied = () => { button.textContent = tr({ fr: 'Copié ✓', en: 'Copied ✓' }); };
    // the clipboard may be missing or refused (an insecure page, a browser's policy): the text then shows to copy by hand
    const byHand = () => { window.prompt(tr({ fr: 'Lien de la baie', en: 'Link of the cabinet' }), share); };
    if (navigator.clipboard) navigator.clipboard.writeText(share).then(copied, byHand);
    else byHand();
  };
}

/** a file name for what a level shares: brassage-l3, brassage-career-4 */
export function fileName(level: LevelDef): string {
  return `brassage-${level.id}`;
}
