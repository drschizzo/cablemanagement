// The guided tutorial: what the cabinet is, and the gestures the first level
// needs; then, if the player wants them, the finer gestures. A card walks
// through the steps (play/tutorialSteps.ts, their words in tutorialTexts.ts);
// the 3D scene frames the piece being described, and steps with a task tick
// themselves off when the player has done it (any step can be skipped).

import type { Controller, Tool } from '../play/controller';
import { ADVANCED, BASICS } from '../play/tutorialSteps';
import { sfx } from '../audio/sfx';
import { load, save } from '../progression/storage';
import { TUTORIAL } from '../game/levels/training';
import { levelRules } from '../game/levels/levelRules';
import { withMet } from '../progression/progress';
import { $ } from '../lib/page';
import { onLanguageChange, tr } from '../lib/language';
import { STEP_TEXTS } from './tutorialTexts';

export class Tutorial {
  /** the chapter under way: the basics, then the finer gestures */
  private steps = BASICS;
  private i = 0;
  private el: HTMLElement;
  private poll: number;
  /** the move to the next step, a moment after a task is done */
  private advance = 0;
  private doneAt = -1;
  private stopRewriting: () => void;

  constructor(private ctl: Controller, private hud: { selectTool(t: Tool): void }, private actions: { home(): void; play(): void }) {
    this.el = $('#tuto');
    this.el.classList.add('on');
    document.body.classList.add('tutorial');
    (this.el.querySelector('#tuto-prev') as HTMLElement).onclick = () => this.go(this.i - 1);
    (this.el.querySelector('#tuto-next') as HTMLElement).onclick = () => this.next();
    (this.el.querySelector('#tuto-skip') as HTMLElement).onclick = () => { this.markDone(); this.actions.play(); };
    (this.el.querySelector('#tuto-home') as HTMLElement).onclick = () => this.actions.home();
    (this.el.querySelector('#tuto-play') as HTMLElement).onclick = () => this.actions.play();
    (this.el.querySelector('#tuto-more') as HTMLElement).onclick = () => { this.steps = ADVANCED; this.go(0); };
    this.poll = window.setInterval(() => this.check(), 200);
    this.stopRewriting = onLanguageChange(() => this.write());
    this.go(0);
  }

  dispose(): void {
    clearInterval(this.poll);
    this.stopRewriting();
    // a step done just before leaving must not move on in the next level
    clearTimeout(this.advance);
    this.el.classList.remove('on');
    document.body.classList.remove('tutorial');
    document.querySelectorAll('.tool.pulse').forEach((b) => b.classList.remove('pulse'));
    this.ctl.spotlight(null);
    this.ctl.focus(-1);
  }

  /** the next step (go stays on the last one) */
  private next(): void {
    this.go(this.i + 1);
  }

  private go(i: number): void {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    const s = this.steps[this.i];
    clearTimeout(this.advance);
    this.doneAt = -1;
    this.ctl.focus(-1);
    this.ctl.spotlight(s.spot ? s.spot(this.ctl) : null);
    document.querySelectorAll('.tool.pulse').forEach((b) => b.classList.remove('pulse'));
    if (s.tool) {
      this.hud.selectTool(s.tool);
      if (s.tool !== 'hand') document.querySelector(`.tool[data-tool="${s.tool}"]`)?.classList.add('pulse');
    }
    s.enter?.(this.ctl);
    (this.el.querySelector('#tuto-task') as HTMLElement).classList.remove('done');
    (this.el.querySelector('#tuto-prev') as HTMLButtonElement).disabled = this.i === 0;
    const last = this.i === this.steps.length - 1;
    (this.el.querySelector('#tuto-end') as HTMLElement).style.display = last ? '' : 'none';
    // the end of the basics: the tutorial is done, and the finer gestures are offered
    (this.el.querySelector('#tuto-more') as HTMLElement).style.display = last && this.steps === BASICS ? '' : 'none';
    if (last) this.markDone();
    this.write();
  }

  /** the step's words, in the language spoken */
  private write(): void {
    const s = STEP_TEXTS[this.steps[this.i].id];
    const chapter = this.steps === ADVANCED ? tr({ fr: 'Gestes avancés · ', en: 'Finer gestures · ' }) : '';
    (this.el.querySelector('#tuto-n') as HTMLElement).textContent = `${chapter}${this.i + 1} / ${this.steps.length}`;
    (this.el.querySelector('#tuto-title') as HTMLElement).textContent = tr(s.title);
    (this.el.querySelector('#tuto-text') as HTMLElement).innerHTML = tr(s.text);
    const task = this.el.querySelector('#tuto-task') as HTMLElement;
    task.style.display = s.task ? '' : 'none';
    task.textContent = s.task ? tr(s.task) : '';
    this.setNext();
  }

  private setNext(): void {
    const s = this.steps[this.i];
    const b = this.el.querySelector('#tuto-next') as HTMLButtonElement;
    const pending = !!s.done && this.doneAt < 0;
    b.style.display = this.i === this.steps.length - 1 ? 'none' : '';
    b.textContent = pending ? tr({ fr: 'Passer →', en: 'Skip →' }) : tr({ fr: 'Suivant →', en: 'Next →' });
    b.classList.toggle('primary', !pending);
    b.classList.toggle('ghost', pending);
  }

  private check(): void {
    const s = this.steps[this.i];
    if (!s.done || this.doneAt >= 0) return;
    if (!s.done(this.ctl)) return;
    this.doneAt = performance.now();
    (this.el.querySelector('#tuto-task') as HTMLElement).classList.add('done');
    sfx.label();
    this.setNext();
    // move on by itself after a moment (go() and dispose() call it off)
    this.advance = window.setTimeout(() => this.next(), 1600);
  }

  /** the tutorial is done once, and the rules it shows are met (the first level does not tell them again) */
  private markDone(): void {
    save('tutorialDone', true);
    save('rules', withMet(load('rules'), levelRules(TUTORIAL)));
  }
}
