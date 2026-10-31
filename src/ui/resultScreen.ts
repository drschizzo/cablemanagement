// The result screen, once the cabinet is signed off: the client's
// requirements met and the time, the cabinet before and after, the
// requirements one by one, and the way on (next level, back to work, menu,
// home).

import type { Controller } from '../play/controller';
import { isGoalMet, requirementsOf, type Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import { formatTime } from './format';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import type { Outcome } from '../progression/outcome';
import { goalText, requirementsMetText } from './messages';
import { tr } from '../lib/language';
import { levelPlace, levelTitle } from './levelTexts';
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
  const { record, share } = outcome;
  $('#result-place').textContent = levelPlace(level);
  $('#result-level').textContent = levelTitle(level);
  const requirements = $('#result-requirements');
  requirements.textContent = requirementsMetText(record.met, record.asked);
  requirements.classList.toggle('all', record.met === record.asked);
  $('#result-time').innerHTML = tr({ fr: `<span>Temps</span> ${formatTime(record.time)}`, en: `<span>Time</span> ${formatTime(record.time)}` });
  $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
  $<HTMLImageElement>('#ba-after').src = ctl.capture();
  $('#result-lines').innerHTML = resultLines(ev).join('');

  showNext(level, outcome.next, actions);
  $('#result-again').onclick = () => { hide('#result'); ctl.resume(); };
  $('#result-menu').onclick = () => { hide('#result'); actions.showModes(); };
  $('#result-home').onclick = () => { hide('#result'); actions.home(); };
  showShare(share && tr({ fr: `Une baie à ranger sur Brassage : ${freeLink(share)}`, en: `A cabinet to tidy on Brassage: ${freeLink(share)}` }));
  $<HTMLButtonElement>('#result-replay').disabled = ctl.timelapse.frames.length < 2;
  $('#result-replay').onclick = () => { hide('#result'); actions.replay(); };
  const after = $<HTMLImageElement>('#ba-after').src;
  $('#result-image').onclick = () => void saveBeforeAfter(ctl.before ?? after, after,
    { title: levelTitle(level), requirements: requirementsMetText(record.met, record.asked) }, `${fileName(level)}.png`);
  show('#result');
}

/** the client's requirements, a line each: met, or what was missing; a line saying so when the level asks none */
function resultLines(ev: Evaluation): string[] {
  const requirements = requirementsOf(ev);
  if (!requirements.length) return [`<li class="none"><span class="l">${tr({ fr: 'Cette baie ne demande rien de plus que d\'être rangée.', en: 'This cabinet asks nothing more than being tidy.' })}</span></li>`];
  return requirements.map((g) => {
    const text = goalText(g);
    return `<li class="${isGoalMet(g) ? 'met' : 'missed'}"><span class="l">${text.label}</span><span class="p">${text.progress}</span>`
      + (text.detail ? `<span class="d">${text.detail}</span>` : '') + '</li>';
  });
}

/** the way on from `level`: the next level (or ticket, or the career after the training) */
function showNext(level: LevelDef, next: LevelDef | null, actions: ResultActions): void {
  const button = $<HTMLButtonElement>('#result-next');
  button.style.display = next ? '' : 'none';
  if (!next) return;
  button.textContent = next.kind !== 'ticket' ? tr({ fr: 'Niveau suivant →', en: 'Next level →' })
    : level.kind === 'ticket' ? tr({ fr: 'Ticket suivant →', en: 'Next ticket →' })
    : tr({ fr: 'La carrière : Radio Pinède →', en: 'The career: Radio Pinède →' });
  button.onclick = () => { hide('#result'); actions.start(next); };
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
