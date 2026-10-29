// The result screen, once the cabinet is validated: the stars and the time,
// the cabinet before and after, the checks one by one, the readability note
// and its record, and the way on (next level, back to work, menu, home).

import type { Controller } from '../play/controller';
import type { Evaluation } from '../game/evaluation';
import { UNLOCK_STARS } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { levelAfter, type LevelResult } from './progress';
import { readabilityText } from './messages';

export interface ResultActions {
  start(level: LevelDef): void;
  showMenu(): void;
  /** the title screen */
  home(): void;
}

export function showResult(ctl: Controller, level: LevelDef, ev: Evaluation, result: LevelResult, challengeWonBefore: boolean, actions: ResultActions): void {
  $('#result-stars').innerHTML = starsHtml(ev.stars, true);
  $('#result-time').textContent = `Temps : ${formatTime(result.time)}`;
  $<HTMLImageElement>('#ba-before').src = ctl.before ?? '';
  $<HTMLImageElement>('#ba-after').src = ctl.capture();
  $('#result-lines').innerHTML = resultLines(level, ev, result, challengeWonBefore).map((l) => `<li>${l}</li>`).join('');
  $('#result-note').innerHTML = noteHtml(ctl.startNote, ev, result);

  const next = levelAfter(level);
  const nextButton = $<HTMLButtonElement>('#result-next');
  nextButton.style.display = next ? '' : 'none';
  // the next level opens on a tidy cabinet, not on a merely connected one
  const open = Math.max(result.previousStars, ev.stars) >= UNLOCK_STARS;
  nextButton.disabled = !open;
  nextButton.textContent = open ? 'Niveau suivant →' : `${'★'.repeat(UNLOCK_STARS)} pour le niveau suivant`;
  if (next && open) nextButton.onclick = () => { hide('#result'); actions.start(next); };
  $('#result-again').onclick = () => { hide('#result'); ctl.resume(); };
  $('#result-menu').onclick = () => { hide('#result'); actions.showMenu(); };
  $('#result-home').onclick = () => { hide('#result'); actions.home(); };
  show('#result');
}

/** the checks one by one, and what the next star needs */
function resultLines(level: LevelDef, ev: Evaluation, result: LevelResult, challengeWonBefore: boolean): string[] {
  const lines = [
    `Liaisons branchées : ${ev.connected}/${ev.total}`,
    `Liaisons rangées : ${ev.routed}/${ev.total}`,
    `Façade dégagée : ${ev.clear}/${ev.total}`,
    `Ni tendus ni pliés : ${ev.relaxed}/${ev.total}`,
  ];
  if (ev.bundlesNeeded) lines.push(`Faisceaux : ${Math.min(ev.bundles, ev.bundlesNeeded)}/${ev.bundlesNeeded}`);
  if (level.downtime !== undefined) {
    lines.push(ev.downtime > ev.budget
      ? `<span class="bad">Incident : ${Math.round(ev.downtime)} pts d'interruption pour un budget de ${ev.budget}.</span>`
      : `Interruption : ${Math.round(ev.downtime)} pts sur ${ev.budget}.`);
  }
  if (ev.stars < 3) {
    lines.push(ev.stars === 1
      ? '★★ : rangez au moins 70 % des liaisons, façade dégagée à 85 %.'
      : '★★★ : tout rangé, façade entièrement dégagée, aucun cordon tendu ni plié' + (ev.bundlesNeeded ? `, ${ev.bundlesNeeded} faisceaux` : '') + (level.downtime !== undefined ? ', budget d\'interruption tenu' : '') + '.');
  }
  if (level.kind === 'campaign') {
    lines.push(result.challengeWon
      ? `⏱ Défi chrono réussi : ★★★ en moins de ${formatTime(level.par)} !`
      : `⏱ Défi chrono : ★★★ en moins de ${formatTime(level.par)}${challengeWonBefore ? ' (déjà réussi)' : ''}.`);
  }
  return lines;
}

/** the readability note: from where the cabinet started, to now, and the record */
function noteHtml(startNote: number, ev: Evaluation, result: LevelResult): string {
  const { note, previousNote } = result;
  const record = previousNote !== undefined ? ` · record ${Math.max(previousNote, note)}${note > previousNote ? ' — nouveau record !' : ''}` : '';
  return `<div class="grade"><s>${startNote}</s><span class="to">→</span><b>${note}</b><span>Lisibilité${record}</span></div>`
    + ev.readability.parts.map((p) => { const t = readabilityText(p); return `<div class="part"><span>${t.name}</span><div class="bar"><div class="fill" style="width:${Math.round(p.value * 100)}%"></div></div><i>${t.tip}</i></div>`; }).join('');
}
