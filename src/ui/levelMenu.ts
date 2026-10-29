// The levels menu, a section at a time: the campaign (the tutorial, then one
// card per level with its stars, its best time, and what opens it while it
// is locked), or the puzzles (always open, their gestures challenge).

import { LEVELS, TUTORIAL, UNLOCK_STARS } from '../game/levels/campaign';
import { PUZZLES } from '../game/levels/puzzles';
import type { LevelDef, PuzzleLevel } from '../game/levels/levelDef';
import { load, type Progress } from './storage';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { isUnlocked } from './progress';
import { levelTitle } from './levelTexts';
import { tr } from './language';

/** a section of the levels menu */
export type LevelSection = 'campaign' | 'puzzles';

export class LevelMenu {
  private start: (level: LevelDef) => void = () => {};
  private back: () => void = () => {};

  constructor() {
    $('#menu-back').onclick = () => { hide('#menu'); this.back(); };
  }

  /** `section`: the campaign or the puzzles; `start`: what a chosen level does; `back`: where the Back button returns */
  show(progress: Progress, section: LevelSection, start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const box = $('#menu-levels');
    box.innerHTML = '';
    if (section === 'campaign') {
      $('#menu-title').textContent = tr({ fr: 'Campagne', en: 'Campaign' });
      $('#menu-sub').textContent = tr({ fr: 'Deux étoiles à un niveau ouvrent le suivant.', en: 'Two stars on a level open the next one.' });
      box.appendChild(this.tutorialCard());
      LEVELS.forEach((level, i) => box.appendChild(this.levelCard(progress, level, i)));
    } else {
      $('#menu-title').textContent = tr({ fr: 'Puzzles express', en: 'Express puzzles' });
      $('#menu-sub').textContent = tr({
        fr: 'Une idée par baie, tous ouverts. Le défi : ★★★ en peu de gestes (brancher, débrancher, poser un support ou un velcro, le bac, le Stock). Ranger un câble, à la main, au Chemin ou au peigne, ne compte pas.',
        en: 'One idea per cabinet, all open. The challenge: ★★★ in few gestures (plugging, unplugging, a support or a velcro, the crate, the Stock). Tidying a cord, by hand, with the Route or the comb, does not count.',
      });
      PUZZLES.forEach((level, i) => box.appendChild(this.puzzleCard(progress, level, i)));
    }
    show('#menu');
  }

  private choose(level: LevelDef): void {
    hide('#menu');
    this.start(level);
  }

  private tutorialCard(): HTMLElement {
    const card = document.createElement('button');
    card.className = 'level-card tutorial';
    card.innerHTML = `<div class="num">0</div><div class="t">${tr({ fr: 'Tutoriel', en: 'Tutorial' })}</div>
      <div class="meta">${tr({ fr: 'Les équipements, les gestes, le score', en: 'The equipment, the gestures, the score' })}</div>${load('tutorialDone') ? `<div class="best">${tr({ fr: '✓ terminé', en: '✓ done' })}</div>` : ''}`;
    card.onclick = () => this.choose(TUTORIAL);
    return card;
  }

  /** a puzzle: always open, its stars, and the hand once its gestures challenge is won */
  private puzzleCard(progress: Progress, level: PuzzleLevel, index: number): HTMLElement {
    const card = document.createElement('button');
    card.className = 'level-card puzzle';
    const won = progress.challenges[level.id];
    card.innerHTML = `<div class="num">P${index + 1}</div><div class="t">${levelTitle(level)}</div>
      <div class="meta">${tr({ fr: `${level.cables} câble${level.cables > 1 ? 's' : ''} · défi : ${level.moves} geste${level.moves > 1 ? 's' : ''}`, en: `${level.cables} cord${level.cables > 1 ? 's' : ''} · challenge: ${level.moves} gesture${level.moves > 1 ? 's' : ''}` })}</div>
      <div class="stars">${starsHtml(progress.stars[level.id] ?? 0)}${won ? `<span class="par" title="${tr({ fr: 'Défi gestes réussi', en: 'Gestures challenge won' })}">✋</span>` : ''}</div>`;
    card.onclick = () => this.choose(level);
    return card;
  }

  private levelCard(progress: Progress, level: LevelDef, index: number): HTMLElement {
    const unlocked = isUnlocked(progress, index);
    const stars = progress.stars[level.id] ?? 0;
    const best = progress.times[level.id];
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked');
    card.innerHTML = `<div class="num">${index + 1}</div><div class="t">${levelTitle(level)}</div>
      <div class="meta">${tr({ fr: `${level.cables} câbles${level.labels ? ' · étiquettes' : ''}`, en: `${level.cables} cords${level.labels ? ' · labels' : ''}` })}</div>
      <div class="stars">${starsHtml(stars)}${progress.challenges[level.id] ? `<span class="par" title="${tr({ fr: 'Défi chrono réussi', en: 'Time challenge won' })}">⏱</span>` : ''}</div>${best ? `<div class="best">${formatTime(best)}</div>` : ''}
      ${unlocked ? '' : `<div class="lock">${tr({ fr: `${'★'.repeat(UNLOCK_STARS)} au niveau ${index} pour l'ouvrir`, en: `${'★'.repeat(UNLOCK_STARS)} on level ${index} to open it` })}</div>`}`;
    if (unlocked) card.onclick = () => this.choose(level);
    return card;
  }
}
