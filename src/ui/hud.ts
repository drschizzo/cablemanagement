// The interface around the cabinet, put together from its panels: the
// toolbar and the stock (toolbar.ts, stockMenu.ts), the patching schedule and
// its scores (schedulePanel.ts), the brief (levelBrief.ts), the result screen
// and its timelapse (resultScreen.ts, timelapsePlayer.ts), the pause menu
// (pauseMenu.ts), the game modes and what they open (modesPanel.ts,
// levelMenu.ts, careerPanel.ts, editorPanel.ts), the workshop (shopPanel.ts),
// the settings (settingsPanel.ts); and the small things (hint, tooltip, toast,
// timer, call, sound, a find picked up) and the interface's keys. It reads the
// Controller's state and calls its actions; the Controller tells it what
// changed through ControllerEvents.

import type { Controller, Tool } from '../play/controller';
import type { Evaluation } from '../game/evaluation';
import type { LevelDef } from '../game/levels/levelDef';
import type { QualityChoice } from '../render/quality';
import { isMuted, setMuted, sfx } from '../audio/sfx';
import { ambient } from '../audio/ambient';
import { load, save } from './storage';
import { formatTime } from './format';
import { hide, isDialogOpen, show } from './dom';
import { $ } from '../lib/page';
import { STOCK_KEY, Toolbar, toolForKey } from './toolbar';
import { keysFor, keysHtml } from './keyHints';
import { cordTooltipHtml, hintHtml } from './messages';
import type { CordInfo, Hint, HoverNote } from '../play/messages';
import { StockMenu } from './stockMenu';
import { SchedulePanel } from './schedulePanel';
import { LevelBrief } from './levelBrief';
import { fileName, showResult } from './resultScreen';
import { recordOutcome } from './outcome';
import { TimelapsePlayer } from './timelapsePlayer';
import { ShopPanel } from './shopPanel';
import { collectFind } from './shop';
import { CareerPanel } from './careerPanel';
import { ModesPanel } from './modesPanel';
import { EditorPanel } from './editorPanel';
import { FINDS, type FindId } from '../game/finds';
import { findName, findStory } from './names';
import { LevelMenu } from './levelMenu';
import { PauseMenu } from './pauseMenu';
import { SettingsPanel, type QualityControl } from './settingsPanel';
import { confirmLeaving } from './confirmDialog';
import { levelTitle } from './levelTexts';
import { onLanguageChange, tr } from './language';

/** how long a toast stays (ms), and one that tells a story (a find) */
const TOAST_MS = 2200;
const STORY_MS = 6500;
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
  private editor = new EditorPanel();
  private levelMenu = new LevelMenu();
  private modes: ModesPanel;
  private settings: SettingsPanel;
  private timelapse = new TimelapsePlayer();
  private shop = new ShopPanel();
  private career = new CareerPanel();
  private toastTimer = 0;
  /** the hint of the gesture under way, and the notes of the cord under the pointer (null: none) */
  private liveHint: Hint | null = null;
  private hoverNotes: HoverNote[] | null = null;

  constructor(private actions: HudActions, quality: QualityControl) {
    this.toolbar = new Toolbar((tool) => this.selectTool(tool), () => this.toggleStock());
    this.stockMenu = new StockMenu((message) => this.toast(message));
    this.brief = new LevelBrief((tool) => this.selectTool(tool));
    this.modes = new ModesPanel({
      levels: (section, start, back) => this.levelMenu.show(this.progress, section, start, back),
      career: (start, back) => this.career.show(start, back),
      editor: (start, back) => this.editor.show(start, back),
    }, () => this.progress);
    this.settings = new SettingsPanel(quality, { isOn: () => !isMuted(), toggle: () => this.toggleSound() }, {
      isOn: () => !load('musicOff'),
      toggle: () => { save('musicOff', !load('musicOff')); this.followMusic(); },
    });
    this.pause = new PauseMenu({
      help: () => this.level && this.showBrief(this.level),
      restart: (back) => this.leaveLevel(tr({ fr: 'Recommencer le niveau ?', en: 'Restart the level?' }), tr({ fr: 'Recommencer', en: 'Restart' }), () => this.level && actions.start(this.level), back),
      levels: (back) => this.showModesOverLevel(back),
      settings: (back) => this.settings.show(back),
      home: (back) => this.leaveLevel(tr({ fr: 'Quitter le niveau ?', en: 'Leave the level?' }), tr({ fr: 'Quitter', en: 'Leave' }), actions.home, back),
    });
    $('#btn-menu').onclick = () => this.openPause();
    $('#btn-view').onclick = () => this.ctl?.stage.resetView();
    $('#btn-sound').onclick = () => this.toggleSound();
    $('#btn-help').onclick = () => this.level && this.showBrief(this.level);
    $('#btn-validate').onclick = () => this.validate();
    window.addEventListener('keydown', (e) => this.onKey(e));
    setMuted(load('muted'));
    this.showSound();
    onLanguageChange(() => this.rewrite());
  }

  /** the language changed: what the panels wrote once is written again */
  private rewrite(): void {
    this.toolbar.rewrite();
    const ctl = this.ctl, level = this.level;
    if (!ctl || !level) return;
    $('#level-title').textContent = levelTitle(level);
    this.schedule.build(ctl, level);
    this.refreshInventory();
    this.hint(null);
    this.onEval(ctl.lastEval);
  }

  /** a level starts: every panel follows it */
  attach(ctl: Controller, level: LevelDef): void {
    this.brief.reset();
    this.ctl = ctl;
    this.level = level;
    this.hoverNotes = null;
    document.body.dataset.level = level.kind;
    this.followMusic();
    $('#level-title').textContent = levelTitle(level);
    hide('#result');
    this.schedule.build(ctl, level);
    this.refreshInventory();
    this.selectTool('hand');
    this.onEval(ctl.lastEval);
  }

  /** the level is left: the panels let go of it */
  detach(): void {
    this.ctl = null;
    this.level = null;
    delete document.body.dataset.level;
    this.followMusic();
  }

  /** the ambient music plays in a zen level, unless the player turned it (or the sound) off */
  private followMusic(): void {
    if (this.level?.kind === 'zen' && !load('musicOff') && !isMuted()) ambient.start();
    else ambient.stop();
  }

  /** the game modes, out of a level or of the title screen; `back`: where its Back button returns */
  showModes(back: () => void = () => {}): void {
    this.modes.show(this.actions.start, back);
  }

  /** the game modes over the level under way: the level chosen replaces it, asked first */
  private showModesOverLevel(back: () => void): void {
    const choose = (level: LevelDef) => this.leaveLevel(tr({ fr: 'Changer de niveau ?', en: 'Change level?' }), tr({ fr: 'Changer', en: 'Change' }), () => this.actions.start(level), () => this.showModesOverLevel(back));
    this.modes.show(choose, back);
  }

  /** the player picked up a find: kept in the workshop, its story told */
  found(find: FindId): void {
    const workshop = load('workshop');
    const isNew = collectFind(workshop, find);
    save('workshop', workshop);
    const count = `${workshop.finds.length}/${FINDS.length}`;
    this.toast(isNew
      ? tr({ fr: `Trouvaille : ${findName(find)} ! ${findStory(find)} (${count})`, en: `Found: ${findName(find)}! ${findStory(find)} (${count})` })
      : tr({ fr: `${findName(find)}, encore. Il est déjà dans votre collection.`, en: `${findName(find)} again. It is in your collection already.` }), STORY_MS);
  }

  /** the workshop, from the title screen */
  showShop(): void {
    this.shop.show(() => {});
  }

  /** the settings, from the title screen */
  showSettings(): void {
    this.settings.show(() => {});
  }

  /** the image stepped down by itself to keep up */
  qualityLowered(choice: QualityChoice): void {
    this.settings.qualityLowered(choice);
    this.toast(tr({ fr: 'Image allégée pour rester fluide (Paramètres pour la régler)', en: 'Image lightened to stay smooth (Settings to adjust it)' }));
  }

  showBrief(level: LevelDef): void {
    this.brief.show(level, this.ctl);
  }

  selectTool(tool: Tool): void {
    this.ctl?.setTool(tool);
    this.toolbar.showChosen(tool);
    this.hint(null);
  }

  refreshInventory(): void {
    const ctl = this.ctl;
    if (!ctl || !this.level) return;
    this.toolbar.showStock(ctl.world.stock, this.level, hasPlacedSupports(ctl));
  }

  onEval(ev: Evaluation): void {
    this.schedule.show(ev, this.ctl, this.level);
  }

  /** a hint for the gesture under way; null: back to the keys that matter now */
  hint(hint: Hint | null): void {
    this.liveHint = hint;
    this.showHint();
  }

  /** the gesture's hint, or the keys of the tool and of the cord under the pointer */
  private showHint(): void {
    const el = $('#hint');
    const tool = this.ctl?.tool;
    el.innerHTML = this.liveHint ? hintHtml(this.liveHint) : tool ? keysHtml(keysFor({ tool, hover: this.hoverNotes })) : '';
    el.classList.toggle('live', !!this.liveHint);
    el.classList.toggle('keys', !this.liveHint);
  }

  /** the cord under the pointer (null: none) and its notes, at the pointer (px of the page) */
  onHover(cord: CordInfo | null, notes: HoverNote[], x: number, y: number): void {
    this.hoverNotes = cord ? notes : null;
    if (!this.liveHint) this.showHint();
    const tip = $('#tooltip');
    if (!cord) { tip.style.display = 'none'; return; }
    tip.innerHTML = cordTooltipHtml(cord, notes);
    tip.style.display = 'block';
    tip.style.left = `${x + 16}px`;
    tip.style.top = `${y + 14}px`;
  }

  toast(text: string, ms = TOAST_MS): void {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('on'), ms);
  }

  stats(text: string): void {
    $('#stats').textContent = text;
  }

  /** the timer, the call under way, and the gestures of a puzzle, a few times a second */
  tick(): void {
    if (!this.ctl) return;
    $('#timer').textContent = formatTime(this.ctl.elapsed);
    this.showCall();
    if (this.level?.kind === 'puzzle') {
      const moves = this.ctl.counters.moves, most = this.level.moves;
      $('#moves').textContent = tr({ fr: `Gestes ${moves}/${most}`, en: `Gestures ${moves}/${most}` });
      $('#moves').classList.toggle('over', moves > most);
    }
  }

  /** a user waiting for a link: which one, and how long they still wait */
  private showCall(): void {
    const incidents = this.ctl!.world.incidents;
    const left = incidents.callLeft(), el = $('#call');
    el.classList.toggle('on', left !== null);
    if (left === null || !incidents.call) return;
    const n = incidents.call.link + 1;
    el.textContent = tr({ fr: `📞 Liaison ${n} · ${formatTime(left)}`, en: `📞 Link ${n} · ${formatTime(left)}` });
    el.classList.toggle('late', left < 15);
  }

  private toggleStock(): void {
    if (this.ctl && this.level) this.stockMenu.toggle(this.ctl, this.level);
  }

  /** the cabinet is validated: the progress is saved, and the result shows */
  private validate(): void {
    const ctl = this.ctl, level = this.level;
    if (!ctl || !level) return;
    const ev = ctl.world.evaluate();
    if (ev.stars < 1 || document.body.classList.contains('touring')) return;
    const outcome = recordOutcome(level, ev, ctl.world, ctl.elapsed, ctl.counters.moves, this.progress);
    sfx.win();
    // the panels step aside while the camera flies round the work
    document.body.classList.add('touring');
    void ctl.finish().then(() => {
      document.body.classList.remove('touring');
      // left meanwhile (the menu, another level): nothing more to show
      if (this.ctl !== ctl) return;
      showResult(ctl, level, ev, outcome, {
        start: this.actions.start,
        replay: () => this.timelapse.show(ctl, fileName(level), () => show('#result')),
        showModes: () => this.showModes(() => show('#result')),
        home: this.actions.home,
      });
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
    this.followMusic();
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
