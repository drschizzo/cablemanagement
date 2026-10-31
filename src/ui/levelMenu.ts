// The training's menu: the tutorial, then one card per level with its stars
// and its best time, and what opens it while it is locked.

import { TRAINING, TUTORIAL, UNLOCK_STARS } from '../game/levels/training';
import type { LevelDef } from '../game/levels/levelDef';
import { load, type Progress } from '../progression/storage';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { isUnlocked } from '../progression/progress';
import { levelTitle } from './levelTexts';
import { tr } from '../lib/language';

export class LevelMenu {
  private start: (level: LevelDef) => void = () => {};
  private back: () => void = () => {};

  constructor() {
    $('#menu-back').onclick = () => { hide('#menu'); this.back(); };
  }

  /** `start`: what a chosen level does; `back`: where the Back button returns */
  show(progress: Progress, start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const box = $('#menu-levels');
    box.innerHTML = '';
    $('#menu-title').textContent = tr({ fr: 'Formation', en: 'Training' });
    $('#menu-sub').textContent = tr({ fr: 'Un niveau tout rangé (★★) ouvre le suivant. La carrière commence après le dernier.', en: 'A level all tidy (★★) opens the next one. The career begins after the last.' });
    box.style.setProperty('--n', String(TRAINING.length));
    box.appendChild(this.tutorialCard());
    TRAINING.forEach((_, i) => box.appendChild(this.levelCard(progress, i)));
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
      <div class="meta">${tr({ fr: 'Les équipements, les gestes, les étoiles', en: 'The equipment, the gestures, the stars' })}</div>${load('tutorialDone') ? `<div class="best">${tr({ fr: '✓ terminé', en: '✓ done' })}</div>` : ''}`;
    card.onclick = () => this.choose(TUTORIAL);
    return card;
  }

  /** level `index` of the training: its stars and its best time */
  private levelCard(progress: Progress, index: number): HTMLElement {
    const level = TRAINING[index];
    const unlocked = isUnlocked(progress, index);
    const stars = progress.stars[level.id] ?? 0;
    const time = progress.times[level.id];
    const best = time ? formatTime(time) : '';
    // the level to play now: the last one open, while it lacks the stars that open the one after
    const next = unlocked && stars < UNLOCK_STARS && (index + 1 === TRAINING.length || !isUnlocked(progress, index + 1));
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked') + (next ? ' next' : '');
    card.innerHTML = `<div class="num">${index + 1}</div><div class="t">${levelTitle(level)}</div>
      <div class="meta">${tr({ fr: `${level.cables} câbles`, en: `${level.cables} cords` })}</div>
      <div class="stars">${starsHtml(stars)}</div>${best ? `<div class="best">${best}</div>` : next ? `<div class="best">${tr({ fr: 'à jouer', en: 'up next' })}</div>` : ''}
      ${unlocked ? '' : `<div class="lock">${tr({ fr: `${'★'.repeat(UNLOCK_STARS)} au niveau ${index} pour l'ouvrir`, en: `${'★'.repeat(UNLOCK_STARS)} on level ${index} to open it` })}</div>`}`;
    if (unlocked) card.onclick = () => this.choose(level);
    return card;
  }
}
