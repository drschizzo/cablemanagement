// The interface around the cabinet, put together from its panels: the
// toolbar and the stock (toolbar.ts, stockMenu.ts), the patching schedule and
// its scores (schedulePanel.ts), the brief (levelBrief.ts), the result screen
// (resultScreen.ts), the pause menu (pauseMenu.ts), the levels menu
// (levelMenu.ts), the settings (settingsPanel.ts); and the small things
// (hint, tooltip, toast, timer, sound) and the interface's keys. It reads the
// Controller's state and calls its actions; the Controller tells it what
// changed through ControllerEvents.

import type { Controller, Tool } from '../play/controller';
import type { Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import type { QualityChoice } from '../render/quality';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { load, save } from './storage';
import { formatTime } from './format';
import { hide, isDialogOpen, show } from './dom';
import { $ } from '../lib/page';
import { STOCK_KEY, Toolbar, toolForKey, toolHelp } from './toolbar';
import { StockMenu } from './stockMenu';
import { SchedulePanel } from './schedulePanel';
import { LevelBrief } from './levelBrief';
import { showResult } from './resultScreen';
import { LevelMenu } from './levelMenu';
import { PauseMenu } from './pauseMenu';
import { SettingsPanel, type QualityControl } from './settingsPanel';
import { confirmLeaving } from './confirmDialog';
import { recordResult } from './progress';

/** how long a toast stays (ms) */
const TOAST_MS = 2200;
/** s of play under which leaving a level does not ask first: nothing worth keeping yet */
const WORK_WORTH_ASKING_S = 20;

/** where the interface leads out of a level */
export interface HudActions {
  start(level: LevelDef): void;
  /** the title screen */
  home(): void;
}

export class Hud {
  ctl: Controller | null = null;
  level: LevelDef | null = null;
  progress = load('progress');
  private toolbar: Toolbar;
  private stockMenu: StockMenu;
  private schedule = new SchedulePanel();
  private brief: LevelBrief;
  private pause: PauseMenu;
  private levelMenu = new LevelMenu();
  private settings: SettingsPanel;
  private toastTimer = 0;

  constructor(private actions: HudActions, quality: QualityControl) {
    this.toolbar = new Toolbar((tool) => this.selectTool(tool), () => this.toggleStock());
    this.stockMenu = new StockMenu((message) => this.toast(message));
    this.brief = new LevelBrief((tool) => this.selectTool(tool));
    this.settings = new SettingsPanel(quality, { isOn: () => !isMuted(), toggle: () => this.toggleSound() });
    this.pause = new PauseMenu({
      help: () => this.level && this.showBrief(this.level),
      restart: (back) => this.leaveLevel('Recommencer le niveau ?', 'Recommencer', () => this.level && actions.start(this.level), back),
      levels: (back) => this.showMenuOverLevel(back),
      settings: (back) => this.settings.show(back),
      home: (back) => this.leaveLevel('Quitter le niveau ?', 'Quitter', actions.home, back),
    });
    $('#btn-menu').onclick = () => this.openPause();
    $('#btn-view').onclick = () => this.ctl?.stage.resetView();
    $('#btn-sound').onclick = () => this.toggleSound();
    $('#btn-help').onclick = () => this.level && this.showBrief(this.level);
    $('#btn-validate').onclick = () => this.validate();
    window.addEventListener('keydown', (e) => this.onKey(e));
    setMuted(load('muted'));
    this.showSound();
  }

  /** a level starts: every panel follows it */
  attach(ctl: Controller, level: LevelDef): void {
    this.brief.reset();
    this.ctl = ctl;
    this.level = level;
    $('#level-title').textContent = level.title;
    hide('#result');
    this.schedule.build(ctl, level);
    this.refreshInventory();
    this.selectTool('hand');
    this.onEval(ctl.lastEval);
  }

  /** the levels menu, out of a level or of the title screen; `back`: where its Back button returns */
  showMenu(back: () => void = () => {}): void {
    this.levelMenu.show(this.progress, this.actions.start, back);
  }

  /** the levels menu over the level under way: the level chosen replaces it, asked first */
  private showMenuOverLevel(back: () => void): void {
    const choose = (level: LevelDef) => this.leaveLevel('Changer de niveau ?', 'Changer', () => this.actions.start(level), () => this.showMenuOverLevel(back));
    this.levelMenu.show(this.progress, choose, back);
  }

  /** the settings, from the title screen */
  showSettings(): void {
    this.settings.show(() => {});
  }

  /** the image stepped down by itself to keep up */
  qualityLowered(choice: QualityChoice): void {
    this.settings.qualityLowered(choice);
    this.toast('Image allégée pour rester fluide (Paramètres pour la régler)');
  }

  showBrief(level: LevelDef): void {
    this.brief.show(level, this.ctl);
  }

  selectTool(tool: Tool): void {
    this.ctl?.setTool(tool);
    this.toolbar.showChosen(tool);
    $('#hint').innerHTML = toolHelp(tool);
  }

  refreshInventory(): void {
    const ctl = this.ctl;
    if (!ctl || !this.level) return;
    this.toolbar.showStock(ctl.world.stock, this.level, hasPlacedSupports(ctl));
  }

  onEval(ev: Evaluation): void {
    this.schedule.show(ev, this.ctl, this.level);
  }

  /** a hint for the current action, or back to the tool's help */
  hint(text: string | null): void {
    $('#hint').innerHTML = text ?? toolHelp(this.ctl?.tool);
    $('#hint').classList.toggle('live', !!text);
  }

  onHover(text: string | null, x: number, y: number): void {
    const tip = $('#tooltip');
    if (!text) { tip.style.display = 'none'; return; }
    tip.innerHTML = text;
    tip.style.display = 'block';
    tip.style.left = `${x + 16}px`;
    tip.style.top = `${y + 14}px`;
  }

  toast(text: string): void {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('on'), TOAST_MS);
  }

  stats(text: string): void {
    $('#stats').textContent = text;
  }

  /** the timer, a few times a second */
  tick(): void {
    if (this.ctl) $('#timer').textContent = formatTime(this.ctl.elapsed);
  }

  private toggleStock(): void {
    if (this.ctl && this.level) this.stockMenu.toggle(this.ctl, this.level);
  }

  /** the cabinet is validated: the progress is saved, and the result shows */
  private validate(): void {
    const ctl = this.ctl, level = this.level;
    if (!ctl || !level) return;
    const ev = ctl.world.evaluate();
    if (ev.stars < 1) return;
    ctl.pause();
    const result = recordResult(this.progress, level, ev.stars, ctl.elapsed, ev.readability.note);
    save('progress', this.progress);
    sfx.win();
    showResult(ctl, level, ev, result, !!this.progress.challenges[level.id], {
      start: this.actions.start,
      showMenu: () => this.showMenu(() => show('#result')),
      home: this.actions.home,
    });
  }

  private openPause(): void {
    if (!this.ctl || !this.level) return;
    // a gesture under way ends here, not behind the menu
    this.selectTool('hand');
    this.pause.open(this.ctl, this.level);
  }

  /** leaves the level for `leave`, asking first when the player has worked on it; `stay`: back where they were */
  private leaveLevel(question: string, action: string, leave: () => void, stay: () => void): void {
    const ctl = this.ctl;
    const worked = !!ctl && (ctl.elapsed >= WORK_WORTH_ASKING_S || hasPlacedSupports(ctl));
    if (worked) confirmLeaving(question, action, leave, stay);
    else leave();
  }

  private toggleSound(): void {
    setMuted(!isMuted());
    save('muted', isMuted());
    this.showSound();
  }

  private showSound(): void {
    $('#btn-sound').classList.toggle('off', isMuted());
  }

  /** the interface's keys: the tools, the stock, the menu, the view, the sound, the debug line */
  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.pause.isOpen) { this.pause.resume(); return; }
    if (!this.ctl || isDialogOpen()) return;
    const tool = toolForKey(e.key);
    if (tool) { this.selectTool(tool); return; }
    if (e.key === STOCK_KEY) { this.toggleStock(); return; }
    // Escape puts a tool down first, then opens the menu
    if (e.key === 'Escape') {
      if (this.ctl.tool === 'hand') this.openPause();
      else this.selectTool('hand');
    } else if (e.key === 'r' || e.key === 'R') this.ctl.stage.resetView();
    else if (e.key === 'm' || e.key === 'M') this.toggleSound();
    else if (e.key === 'F3' || e.key === '`') {
      e.preventDefault();
      this.ctl.debug = !this.ctl.debug;
      $('#stats').style.display = this.ctl.debug ? 'block' : 'none';
    }
  }
}

/** the player has placed supports in the cabinet (the level's own are locked) */
function hasPlacedSupports(ctl: Controller): boolean {
  return ctl.world.rack.items.some((i) => !i.locked);
}
