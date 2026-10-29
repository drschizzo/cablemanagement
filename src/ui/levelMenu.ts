// The levels menu: the tutorial, the cabinet of the day, then one card per
// level of the campaign with its stars, its best time, and what opens it
// while it is locked; a free game of as many cords as asked, and the zen
// mode.

import { LEVELS, TUTORIAL, UNLOCK_STARS } from '../game/levels/campaign';
import { freeLevel, zenLevel } from '../game/levels/freeLevel';
import { dailyLevel, dayKey } from '../game/levels/dailyLevel';
import type { LevelDef } from '../game/levels/levelDef';
import { load, type Progress } from './storage';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { isUnlocked } from './progress';
import { levelTitle } from './levelTexts';
import { tr } from './language';

export class LevelMenu {
  private start: (level: LevelDef) => void = () => {};
  private back: () => void = () => {};

  constructor() {
    $('#menu-back').onclick = () => { hide('#menu'); this.back(); };
    const cordCount = $<HTMLInputElement>('#free-n');
    const cordCountLabel = $('#free-n-val');
    cordCount.oninput = () => { cordCountLabel.textContent = tr({ fr: `${cordCount.value} câbles`, en: `${cordCount.value} cords` }); };
    $('#free-go').onclick = () => this.choose(freeLevel(Number(cordCount.value), Math.floor(Math.random() * 1e9)));
    $('#zen-go').onclick = () => this.choose(zenLevel(Math.floor(Math.random() * 1e9)));
  }

  /** `start`: what a chosen level does; `back`: where the Back button returns */
  show(progress: Progress, start: (level: LevelDef) => void, back: () => void): void {
    this.start = start;
    this.back = back;
    // its words, in the language spoken now
    $('#free-n').dispatchEvent(new Event('input'));
    const box = $('#menu-levels');
    box.innerHTML = '';
    box.appendChild(this.tutorialCard());
    box.appendChild(this.dailyCard());
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
    card.innerHTML = `<div class="num">0</div><div class="t">${tr({ fr: 'Tutoriel', en: 'Tutorial' })}</div>
      <div class="meta">${tr({ fr: 'Les équipements, les gestes, le score', en: 'The equipment, the gestures, the score' })}</div>${load('tutorialDone') ? `<div class="best">${tr({ fr: '✓ suivi', en: '✓ done' })}</div>` : ''}`;
    card.onclick = () => this.choose(TUTORIAL);
    return card;
  }

  /** the cabinet of the day: its number, its size, and today's best if it is done */
  private dailyCard(): HTMLElement {
    const level = dailyLevel(dayKey(new Date()));
    const best = load('daily')[level.date];
    const card = document.createElement('button');
    card.className = 'level-card daily';
    card.innerHTML = `<div class="num">☀</div><div class="t">${levelTitle(level)}</div>
      <div class="meta">${tr({ fr: `${level.cables} câbles · la même pour tous`, en: `${level.cables} cords · the same for all` })}</div>
      <div class="stars">${starsHtml(best?.stars ?? 0)}</div>${best ? `<div class="best">${formatTime(best.time)}</div>` : ''}`;
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
