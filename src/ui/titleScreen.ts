// The buttons of the title screen, and its progress bar while the aisle
// falls.

import { LEVELS, TUTORIAL } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { load } from './storage';
import { $ } from '../lib/page';
import { levelTitle } from './levelTexts';

export interface TitleActions {
  start(level: LevelDef): void;
  playNext(): void;
  showMenu(): void;
  showSettings(): void;
  /** the next level the player has to tidy (undefined: all are done) */
  nextLevel(): LevelDef | undefined;
  /** the player has stars in some level */
  hasProgress(): boolean;
}

const byId = (id: string) => $('#' + id);

export class TitleScreen {
  private progressFill = $('#title-load .fill');

  constructor(private actions: TitleActions) {
    byId('title-play').onclick = () => { if (this.firstVisit()) actions.start(TUTORIAL); else actions.playNext(); };
    byId('title-tuto').onclick = () => actions.start(TUTORIAL);
    byId('title-levels').onclick = () => actions.showMenu();
    byId('title-settings').onclick = () => actions.showSettings();
  }

  /** how far the aisle has fallen (0..1) */
  showProgress(fraction: number): void {
    this.progressFill.style.width = `${Math.round(fraction * 100)}%`;
  }

  /** the main button says where the player left off */
  refresh(): void {
    const next = this.actions.nextLevel();
    const play = byId('title-play');
    play.textContent = this.firstVisit() ? 'Commencer →' : next && next !== LEVELS[0] ? `Continuer · ${levelTitle(next)} →` : 'Jouer →';
    play.title = this.firstVisit() ? 'Le tutoriel, puis le niveau 1' : '';
  }

  /** a first visit starts with the tutorial; afterwards, where the player left off */
  private firstVisit(): boolean {
    return !load('tutorialDone') && !this.actions.hasProgress();
  }
}
