// The levels menu: the tutorial, then one card per level of the campaign with
// its stars, its best time, and what opens it while it is locked; and a free
// game of as many cords as asked.

import { LEVELS, TUTORIAL, UNLOCK_STARS } from '../game/levels/campaign';
import { freeLevel } from '../game/levels/freeLevel';
import type { LevelDef } from '../game/levels/levelDef';
import { load, type Progress } from './storage';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { isUnlocked } from './progress';

export class LevelMenu {
  private start: (level: LevelDef) => void = () => {};
  private back: () => void = () => {};

  constructor() {
    $('#menu-back').onclick = () => { hide('#menu'); this.back(); };
    const cordCount = $<HTMLInputElement>('#free-n');
    const cordCountLabel = $('#free-n-val');
    cordCount.oninput = () => { cordCountLabel.textContent = `${cordCount.value} câbles`; };
    $('#free-go').onclick = () => this.choose(freeLevel(Number(cordCount.value), Math.floor(Math.random() * 1e9)));
  }

  /** `start`: what a chosen level does; `back`: where the Back button returns */
  show(progress: Progress, start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    const box = $('#menu-levels');
    box.innerHTML = '';
    box.appendChild(this.tutorialCard());
    LEVELS.forEach((level, i) => box.appendChild(this.levelCard(progress, level, i)));
    show('#menu');
  }

  private choose(level: LevelDef): void {
    hide('#menu');
    this.start(level);
  }

  private tutorialCard(): HTMLElement {
    const card = document.createElement('button');
    card.className = 'level-card tutorial';
    card.innerHTML = `<div class="num">0</div><div class="t">Tutoriel</div>
      <div class="meta">Les équipements, les gestes, le score</div>${load('tutorialDone') ? '<div class="best">✓ suivi</div>' : ''}`;
    card.onclick = () => this.choose(TUTORIAL);
    return card;
  }

  private levelCard(progress: Progress, level: LevelDef, index: number): HTMLElement {
    const unlocked = isUnlocked(progress, index);
    const stars = progress.stars[level.id] ?? 0;
    const best = progress.times[level.id];
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked');
    card.innerHTML = `<div class="num">${index + 1}</div><div class="t">${level.title}</div>
      <div class="meta">${level.cables} câbles${level.labels ? ' · étiquettes' : ''}</div>
      <div class="stars">${starsHtml(stars)}${progress.challenges[level.id] ? '<span class="par" title="Défi chrono réussi">⏱</span>' : ''}</div>${best ? `<div class="best">${formatTime(best)}</div>` : ''}
      ${unlocked ? '' : `<div class="lock">${'★'.repeat(UNLOCK_STARS)} au niveau ${index} pour l'ouvrir</div>`}`;
    if (unlocked) card.onclick = () => this.choose(level);
    return card;
  }
}
