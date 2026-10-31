// The buttons of the title screen, and its progress bar while the aisle
// falls. A first visit offers one way only, Start; the game modes and the
// notebook show once they are open.

import { TRAINING, TUTORIAL } from '../game/levels/training';
import type { LevelDef } from '../game/levels/levelDef';
import { load } from './storage';
import { isWorkshopOpen } from './shop';
import { $ } from '../lib/page';
import { levelTitle } from './levelTexts';
import { onLanguageChange, tr } from './language';

export interface TitleActions {
  start(level: LevelDef): void;
  playNext(): void;
  showModes(): void;
  showSettings(): void;
  showShop(): void;
  /** where the story stands: a level of the training, then a ticket of the career (undefined: both done) */
  nextLevel(): LevelDef | undefined;
  /** the player has stars in some level */
  hasProgress(): boolean;
}

const byId = (id: string) => $('#' + id);

/** what the loading page is doing: the aisle falling, the shaders built, the GPU compiling them */
export type LoadStep = 'fall' | 'shaders' | 'gpu';

const STEP_WORDS = {
  fall: { fr: 'Les câbles tombent', en: 'Cables falling' },
  shaders: { fr: 'Shaders', en: 'Shaders' },
  gpu: { fr: 'Compilation GPU', en: 'GPU compiling' },
} as const;

export class TitleScreen {
  private progress = $('#title-load');
  private progressFill = $('#title-load .fill');
  private progressStep = $('#title-load .step');
  private progressPct = $('#title-load .pct');

  constructor(private actions: TitleActions) {
    byId('title-play').onclick = () => { if (this.firstVisit()) actions.start(TUTORIAL); else actions.playNext(); };
    byId('title-tuto').onclick = () => actions.start(TUTORIAL);
    byId('title-modes').onclick = () => actions.showModes();
    byId('title-settings').onclick = () => actions.showSettings();
    byId('title-shop').onclick = () => actions.showShop();
    onLanguageChange(() => this.refresh());
  }

  /** how far the loading is (0..1), and what it is doing */
  showProgress(fraction: number, step: LoadStep = 'fall'): void {
    const pct = Math.round(fraction * 100);
    this.progressFill.style.transform = `translateX(${pct - 100}%)`;
    this.progress.setAttribute('aria-valuenow', String(pct));
    this.progressStep.textContent = tr(STEP_WORDS[step]);
    this.progressPct.textContent = tr({ fr: `${pct}\u202f%`, en: `${pct}%` });
  }

  /** the main button says where the player left off */
  refresh(): void {
    const next = this.actions.nextLevel();
    const play = byId('title-play');
    play.textContent = this.firstVisit() ? tr({ fr: 'Commencer →', en: 'Start →' })
      : next && next !== TRAINING[0] ? tr({ fr: `Continuer · ${levelTitle(next)} →`, en: `Continue · ${levelTitle(next)} →` })
      : tr({ fr: 'Jouer →', en: 'Play →' });
    play.title = this.firstVisit() ? tr({ fr: 'Le tutoriel, puis le niveau 1', en: 'The tutorial, then level 1' }) : '';
    byId('title-shop').style.display = isWorkshopOpen(load('progress'), load('workshop')) ? '' : 'none';
    byId('title-modes').style.display = this.firstVisit() ? 'none' : '';
  }

  /** a first visit starts with the tutorial; afterwards, where the player left off */
  private firstVisit(): boolean {
    return !load('tutorialDone') && !this.actions.hasProgress();
  }
}
