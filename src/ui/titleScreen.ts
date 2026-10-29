// The buttons of the title screen, and its progress bar while the aisle
// falls. A first visit offers one way only, Start; the game modes, the
// cabinet of the day and the workshop show once they are open.

import { LEVELS, TUTORIAL } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { load } from './storage';
import { isWorkshopOpen } from './shop';
import { isModeOpen, savedModeRecords } from './modeLocks';
import { $ } from '../lib/page';
import { levelTitle } from './levelTexts';
import { dayKey } from '../game/levels/dailyLevel';
import { streak } from './daily';
import { onLanguageChange, tr } from './language';

export interface TitleActions {
  start(level: LevelDef): void;
  playNext(): void;
  showModes(): void;
  showSettings(): void;
  showShop(): void;
  /** the next level the player has to tidy (undefined: all are done) */
  nextLevel(): LevelDef | undefined;
  /** the player has stars in some level */
  hasProgress(): boolean;
  /** the cabinet of the day */
  playDaily(): void;
}

const byId = (id: string) => $('#' + id);

export class TitleScreen {
  private progressFill = $('#title-load .fill');

  constructor(private actions: TitleActions) {
    byId('title-play').onclick = () => { if (this.firstVisit()) actions.start(TUTORIAL); else actions.playNext(); };
    byId('title-tuto').onclick = () => actions.start(TUTORIAL);
    byId('title-daily').onclick = () => actions.playDaily();
    byId('title-modes').onclick = () => actions.showModes();
    byId('title-settings').onclick = () => actions.showSettings();
    byId('title-shop').onclick = () => actions.showShop();
    onLanguageChange(() => this.refresh());
  }

  /** how far the aisle has fallen (0..1) */
  showProgress(fraction: number): void {
    this.progressFill.style.width = `${Math.round(fraction * 100)}%`;
  }

  /** the main button says where the player left off */
  refresh(): void {
    const next = this.actions.nextLevel();
    const play = byId('title-play');
    play.textContent = this.firstVisit() ? tr({ fr: 'Commencer →', en: 'Start →' })
      : next && next !== LEVELS[0] ? tr({ fr: `Continuer · ${levelTitle(next)} →`, en: `Continue · ${levelTitle(next)} →` })
      : tr({ fr: 'Jouer →', en: 'Play →' });
    play.title = this.firstVisit() ? tr({ fr: 'Le tutoriel, puis le niveau 1', en: 'The tutorial, then level 1' }) : '';
    byId('title-shop').style.display = isWorkshopOpen(load('progress'), load('career')) ? '' : 'none';
    byId('title-modes').style.display = this.firstVisit() ? 'none' : '';
    byId('title-daily').style.display = isModeOpen('daily', savedModeRecords()) ? '' : 'none';
    this.refreshDaily();
  }

  /** the cabinet of the day: done today or not, and the run of days */
  private refreshDaily(): void {
    const today = dayKey(new Date());
    const days = load('daily');
    const run = streak(days, today);
    const done = days[today] ? ` ${'★'.repeat(days[today].stars)}` : '';
    byId('title-daily').textContent = tr({ fr: `Baie du jour${done}`, en: `Cabinet of the day${done}` }) + (run > 1 ? ` · 🔥 ${run}` : '');
    byId('title-daily').title = run > 1 ? tr({ fr: `${run} jours de suite`, en: `${run} days in a row` }) : tr({ fr: 'La même baie pour tout le monde, chaque jour', en: 'The same cabinet for everyone, every day' });
  }

  /** a first visit starts with the tutorial; afterwards, where the player left off */
  private firstVisit(): boolean {
    return !load('tutorialDone') && !this.actions.hasProgress();
  }
}
