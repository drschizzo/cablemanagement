// The pause menu of a level (☰ Menu, or Escape): the clock waits while it is
// open. From it, the brief, a restart, another level, the settings, or back
// to the title screen.

import type { Controller } from '../play/controller';
import type { LevelDef } from '../game/levels/levelDef';
import { hide, show } from './dom';
import { $ } from '../lib/page';
import { levelTitle } from './levelTexts';

/** what the menu leads to; `back` reopens the menu */
export interface PauseActions {
  help(): void;
  restart(back: () => void): void;
  levels(back: () => void): void;
  settings(back: () => void): void;
  home(back: () => void): void;
}

export class PauseMenu {
  private ctl: Controller | null = null;

  constructor(actions: PauseActions) {
    const reopen = () => show('#pause');
    const go = (action: (back: () => void) => void) => () => { hide('#pause'); action(reopen); };
    $('#pause-resume').onclick = () => this.resume();
    $('#pause-help').onclick = () => { hide('#pause'); actions.help(); };
    $('#pause-restart').onclick = go(actions.restart);
    $('#pause-levels').onclick = go(actions.levels);
    $('#pause-settings').onclick = go(actions.settings);
    $('#pause-home').onclick = go(actions.home);
  }

  get isOpen(): boolean {
    return $('#pause').classList.contains('on');
  }

  open(ctl: Controller, level: LevelDef): void {
    this.ctl = ctl;
    ctl.pause();
    $('#pause-level').textContent = levelTitle(level);
    show('#pause');
  }

  resume(): void {
    hide('#pause');
    this.ctl?.resume();
  }
}
