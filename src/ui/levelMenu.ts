// The levels menu: one card per level of the campaign, with its stars, its
// best time, and what opens it while it is locked.

import { LEVELS, UNLOCK_STARS } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import type { Progress } from './storage';
import { formatTime } from './format';
import { hide, show, starsHtml } from './dom';
import { $ } from '../lib/page';
import { isUnlocked } from './progress';

export function showLevelMenu(progress: Progress, start: (level: LevelDef) => void): void {
  const box = $('#menu-levels');
  box.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const unlocked = isUnlocked(progress, i);
    const stars = progress.stars[level.id] ?? 0;
    const best = progress.times[level.id];
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked');
    card.innerHTML = `<div class="num">${i + 1}</div><div class="t">${level.title}</div>
      <div class="meta">${level.cables} câbles${level.labels ? ' · étiquettes' : ''}</div>
      <div class="stars">${starsHtml(stars)}${progress.challenges[level.id] ? '<span class="par" title="Défi chrono réussi">⏱</span>' : ''}</div>${best ? `<div class="best">${formatTime(best)}</div>` : ''}
      ${unlocked ? '' : `<div class="lock">${'★'.repeat(UNLOCK_STARS)} au niveau ${i} pour l'ouvrir</div>`}`;
    if (unlocked) card.onclick = () => { hide('#menu'); start(level); };
    box.appendChild(card);
  });
  show('#menu');
}
