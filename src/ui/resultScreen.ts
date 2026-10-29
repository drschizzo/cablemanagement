// The result screen, once the cabinet is validated: the stars and the time,
// the cabinet before and after, the checks one by one, the readability note
// and its record, and the way on (next level, back to work, menu, home).

import type { Controller } from '../play/controller';
import { nextStar, type Evaluation } from '../game/evaluation';
import { UNLOCK_STARS } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { formatMoney, formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import type { LevelResult } from './progress';
import type { Outcome, Pay } from './outcome';
import { readabilityText, starNeedText } from './messages';
import { tr } from './language';
import type { PayItem } from '../game/pay';
import { assertNever } from '../lib/assertNever';
import { levelTitle } from './levelTexts';
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
  const { result, challengeWonBefore, share, pay } = outcome;
  $('#result-stars').innerHTML = starsHtml(ev.stars, true);
  $('#result-time').textContent = tr({ fr: `Temps : ${formatTime(result.time)}`, en: `Time: ${formatTime(result.time)}` });
  $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
  $<HTMLImageElement>('#ba-after').src = ctl.capture();
  $('#result-lines').innerHTML = resultLines(level, ev, result, challengeWonBefore).map((l) => `<li>${l}</li>`).join('');
  $('#result-pay').innerHTML = pay ? payHtml(pay) : '';
  $('#result-note').innerHTML = noteHtml(ctl.startNote, ev, result);

  showNext(outcome.next, actions);
  $('#result-again').onclick = () => { hide('#result'); ctl.resume(); };
  $('#result-menu').onclick = () => { hide('#result'); actions.showModes(); };
  $('#result-home').onclick = () => { hide('#result'); actions.home(); };
  showShare(share);
  $<HTMLButtonElement>('#result-replay').disabled = !ctl.timelapse.frames.length;
  $('#result-replay').onclick = () => { hide('#result'); actions.replay(); };
  const after = $<HTMLImageElement>('#ba-after').src;
  $('#result-image').onclick = () => void saveBeforeAfter(ctl.before ?? after, after,
    { title: levelTitle(level), stars: ev.stars, noteBefore: ctl.startNote, noteAfter: ev.readability.note }, `${fileName(level)}.png`);
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

/** the way on: the next level (or ticket), open or what opens it */
function showNext(next: Outcome['next'], actions: ResultActions): void {
  const button = $<HTMLButtonElement>('#result-next');
  button.style.display = next ? '' : 'none';
  if (!next) return;
  button.disabled = !next.open;
  button.textContent = !next.open
    ? tr({ fr: `${'★'.repeat(UNLOCK_STARS)} pour le niveau suivant`, en: `${'★'.repeat(UNLOCK_STARS)} for the next level` })
    : next.level.kind === 'ticket' ? tr({ fr: 'Ticket suivant →', en: 'Next ticket →' }) : tr({ fr: 'Niveau suivant →', en: 'Next level →' });
  button.onclick = () => { if (next.open) { hide('#result'); actions.start(next.level); } };
}

/** the payslip: what each line earned, what was paid, the € on hand */
function payHtml(pay: Pay): string {
  const lines = pay.slip.lines.map((l) => `<span>${payItemName(l.item)} <b>${formatMoney(l.amount)}</b></span>`).join('');
  const paid = pay.paid === pay.slip.total
    ? tr({ fr: `Salaire : <b>+${formatMoney(pay.paid)}</b>`, en: `Pay: <b>+${formatMoney(pay.paid)}</b>` })
    : tr({ fr: `Salaire : <b>+${formatMoney(pay.paid)}</b> (déjà payé ${formatMoney(pay.slip.total - pay.paid)} pour ce niveau)`, en: `Pay: <b>+${formatMoney(pay.paid)}</b> (${formatMoney(pay.slip.total - pay.paid)} paid already for this level)` });
  return `<div class="paid">${paid}<span class="coins">${tr({ fr: 'Solde', en: 'Balance' })} ${formatMoney(pay.coins)}</span></div><div class="slip">${lines}</div>`;
}

function payItemName(item: PayItem): string {
  switch (item) {
    case 'links': return tr({ fr: 'Liaisons', en: 'Links' });
    case 'tidy': return tr({ fr: 'Rangement', en: 'Tidiness' });
    case 'readability': return tr({ fr: 'Lisibilité', en: 'Readability' });
    case 'budget': return tr({ fr: 'Interruption évitée', en: 'Downtime avoided' });
    case 'challenge': return tr({ fr: 'Défi réussi', en: 'Challenge won' });
    default: return assertNever(item);
  }
}

/** the readability note: from where the cabinet started, to now, and the record */
function noteHtml(startNote: number, ev: Evaluation, result: LevelResult): string {
  const { note, previousNote } = result;
  const best = previousNote !== undefined ? Math.max(previousNote, note) : 0;
  const isNew = previousNote !== undefined && note > previousNote;
  const record = previousNote !== undefined ? tr({ fr: ` · record ${best}${isNew ? ' — nouveau record !' : ''}`, en: ` · best ${best}${isNew ? ' — new best!' : ''}` }) : '';
  return `<div class="grade"><s>${startNote}</s><span class="to">→</span><b>${note}</b><span>${tr({ fr: 'Lisibilité', en: 'Readability' })}${record}</span></div>`
    + ev.readability.parts.map((p) => { const t = readabilityText(p); return `<div class="part"><span>${t.name}</span><div class="bar"><div class="fill" style="width:${Math.round(p.value * 100)}%"></div></div><i>${t.tip}</i></div>`; }).join('');
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
