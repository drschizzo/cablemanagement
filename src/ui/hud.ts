// The interface around the cabinet, put together from its panels: the
// toolbar and the stock (toolbar.ts, stockMenu.ts), the patching schedule and
// its scores (schedulePanel.ts), the brief (levelBrief.ts), the result screen
// (resultScreen.ts), the levels menu (levelMenu.ts); and the small things
// (hint, tooltip, toast, timer) and the interface's keys. It reads the
// Controller's state and calls its actions; the Controller tells it what
// changed through ControllerEvents.

import type { Controller, Tool } from '../play/controller';
import type { Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { load, save } from '../storage';
import { formatTime } from '../format';
import { $, hide } from './dom';
import { STOCK_KEY, TOOLS, Toolbar, toolHelp } from './toolbar';
import { StockMenu } from './stockMenu';
import { SchedulePanel } from './schedulePanel';
import { LevelBrief } from './levelBrief';
import { showResult } from './resultScreen';
import { showLevelMenu } from './levelMenu';
import { recordResult } from './progress';

/** how long a toast stays (ms) */
const TOAST_MS = 2200;

export class Hud {
  ctl: Controller | null = null;
  level: LevelDef | null = null;
  progress = load('progress');
  private toolbar: Toolbar;
  private stockMenu: StockMenu;
  private schedule = new SchedulePanel();
  private brief: LevelBrief;
  private toastTimer = 0;

  constructor(private start: (level: LevelDef) => void) {
    this.toolbar = new Toolbar((tool) => this.selectTool(tool), () => this.toggleStock());
    this.stockMenu = new StockMenu((message) => this.toast(message));
    this.brief = new LevelBrief((tool) => this.selectTool(tool));
    $('#btn-menu').onclick = () => this.showMenu();
    $('#btn-restart').onclick = () => this.level && this.start(this.level);
    $('#btn-view').onclick = () => this.ctl?.stage.resetView();
    $('#btn-sound').onclick = () => this.toggleSound();
    $('#btn-help').onclick = () => this.level && this.showBrief(this.level);
    $('#btn-validate').onclick = () => this.validate();
    window.addEventListener('keydown', (e) => this.onKey(e));
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

  showMenu(): void {
    showLevelMenu(this.progress, this.start);
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
    this.toolbar.showStock(ctl.world.inventory, this.level, ctl.world.rack.items.some((i) => !i.locked));
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
    ctl.running = false;
    const result = recordResult(this.progress, level, ev.stars, ctl.elapsed, ev.readability.note);
    save('progress', this.progress);
    sfx.win();
    showResult(ctl, level, ev, result, !!this.progress.challenges[level.id], { start: this.start, showMenu: () => this.showMenu() });
  }

  private toggleSound(): void {
    setMuted(!isMuted());
    $('#btn-sound').classList.toggle('off', isMuted());
  }

  /** the interface's keys: the tools, the stock, the view, the sound, the debug line */
  private onKey(e: KeyboardEvent): void {
    if (!this.ctl || document.querySelector('.overlay.on')) return;
    const tool = TOOLS.find((t) => t.key === e.key.toLowerCase());
    if (tool) { this.selectTool(tool.tool); return; }
    if (e.key === STOCK_KEY) { this.toggleStock(); return; }
    if (e.key === 'Escape') this.selectTool('hand');
    else if (e.key === 'r' || e.key === 'R') this.ctl.stage.resetView();
    else if (e.key === 'm' || e.key === 'M') this.toggleSound();
    else if (e.key === 'F3' || e.key === '`') {
      e.preventDefault();
      this.ctl.debug = !this.ctl.debug;
      $('#stats').style.display = this.ctl.debug ? 'block' : 'none';
    }
  }
}
