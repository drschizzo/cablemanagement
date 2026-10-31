// The training's menu: the tutorial, then one card per level with its record
// (signed off, the client's requirements met) and its best time, and what
// opens it while it is locked.

import { TRAINING, TUTORIAL } from '../game/levels/training';
import type { LevelDef } from '../game/levels/levelDef';
import { load, type Progress } from '../progression/storage';
import { formatTime } from './format';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { isSignedOff, isUnlocked } from '../progression/progress';
import { recordBadge } from './recordBadge';
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
    $('#menu-sub').textContent = tr({ fr: 'Un niveau validé ouvre le suivant. La carrière commence après le dernier.', en: 'A level signed off opens the next one. The career begins after the last.' });
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
      <div class="meta">${tr({ fr: 'Les équipements, les gestes, la validation', en: 'The equipment, the gestures, signing off' })}</div>${load('tutorialDone') ? `<div class="best">${tr({ fr: '✓ terminé', en: '✓ done' })}</div>` : ''}`;
    card.onclick = () => this.choose(TUTORIAL);
    return card;
  }

  /** level `index` of the training: its record and its best time */
  private levelCard(progress: Progress, index: number): HTMLElement {
    const level = TRAINING[index];
    const unlocked = isUnlocked(progress, index);
    const record = progress.levels[level.id];
    const best = record ? formatTime(record.time) : '';
    // the level to play now: the first one not signed off yet
    const next = unlocked && !isSignedOff(progress, level.id);
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked') + (next ? ' next' : '');
    card.innerHTML = `<div class="num">${index + 1}</div><div class="t">${levelTitle(level)}</div>
      <div class="meta">${tr({ fr: `${level.cables} câbles`, en: `${level.cables} cords` })}</div>
      ${recordBadge(record)}${best ? `<div class="best">${best}</div>` : next ? `<div class="best">${tr({ fr: 'à jouer', en: 'up next' })}</div>` : ''}
      ${unlocked ? '' : `<div class="lock">${tr({ fr: `Validez le niveau ${index} pour l'ouvrir`, en: `Sign off level ${index} to open it` })}</div>`}`;
    if (unlocked) card.onclick = () => this.choose(level);
    return card;
  }
}
