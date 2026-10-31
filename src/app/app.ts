// The game as a whole: which scene is on screen — a level (a Controller, with
// the tutorial over it or not) or the title screen over the before/after
// aisle (a Showcase) — and how to go from one to the other.

import type { Stage } from '../render/stage';
import { Controller } from '../play/controller';
import { warmLevel } from '../play/levelViews';
import { Showcase } from '../showcase/showcase';
import { Hud } from '../ui/hud';
import { Tutorial } from '../ui/tutorial';
import { freeErrorText, statsText, toastText } from '../ui/messages';
import { isDialogOpen } from '../ui/dom';
import { unitLabel } from '../ui/names';
import { lookOf, ticksWon } from '../progression/notebook';
import { load } from '../progression/storage';
import { nextInStory } from '../progression/progress';
import type { LevelDef } from '../game/levels/levelDef';
import { SHOWCASE_DEFAULT } from '../game/levels/showcaseRack';
import { TUTORIAL } from '../game/levels/training';
import { freeLevel, decodeSpec } from '../game/levels/freeLevel';
import type { BakedBay } from '../game/mess/baked';
import { SceneLoader } from './sceneLoader';
import { TitleScreen, type LoadStep } from '../ui/titleScreen';
import { onPanelsResized, panelMargins } from '../ui/panelMargins';
import type { AisleSettings } from '../showcase/aisleSettings';
import { $ } from '../lib/page';
import { ShowcaseSwitch } from '../ui/showcaseSwitch';

/** the title's bar: the aisle falling, then its shaders and the next level's (see settleShaders) */
const AISLE_SHARE = 0.6;

/** `n` frames drawn, or a moment each if the page draws none */
const frames = async (n: number) => {
  for (let k = 0; k < n; k++) {
    await new Promise<void>((r) => {
      let gone = false;
      const go = () => { if (!gone) { gone = true; r(); } };
      requestAnimationFrame(go);
      setTimeout(go, 100);
    });
  }
};

/**
 * The next aisle, built and fallen in the background while this one is on
 * screen: "another" then shows it at once (or as soon as it has fallen).
 */
interface NextAisle {
  aisle: Promise<Showcase>;
  /** where its progress goes (the title's bar, once it is the one awaited) */
  onProgress: (fraction: number) => void;
  done: number;
  ready: boolean;
  /** gives it up while it is built */
  stop: AbortController;
}

export class App {
  readonly hud: Hud;
  ctl: Controller | null = null;
  showcase: Showcase | null = null;
  /** what runs over the scene (tutorial) or is the scene (showcase) */
  private mode: { dispose(): void } | null = null;
  private loader: SceneLoader;
  private title: TitleScreen;
  private showcaseSwitch: ShowcaseSwitch;
  private nextAisle: NextAisle | null = null;
  /** the title screen's aisle, set aside while a level is played: back home, it shows again as it was */
  private keptAisle: Showcase | null = null;
  /** the shaders of a level built under the title screen, under way or done: what keeps them (see warmLevel) */
  private levelWarm: Promise<{ dispose(): void } | null> | null = null;
  /** the seed of the next aisle to show, only for the first one */
  private pendingSeed: number | undefined;

  /** `baked`: the fallen mess of the default aisle, fetched while the rest starts */
  constructor(private stage: Stage, private aisles: AisleSettings, private threaded: boolean, private baked: Promise<BakedBay[] | null>) {
    this.hud = new Hud({ start: (level) => this.startLevel(level), home: () => this.startShowcase() }, stage);
    stage.onQualityLowered = (choice) => this.hud.qualityLowered(choice);
    this.loader = new SceneLoader(stage, $('#loading'));
    this.title = new TitleScreen({
      start: (level) => this.startLevel(level),
      playNext: () => this.playNext(),
      showModes: () => this.hud.showModes(),
      showSettings: () => this.hud.showSettings(),
      showNotebook: () => this.hud.showNotebook(),
      nextLevel: () => nextInStory(this.hud.progress, load('career')),
      hasProgress: () => Object.keys(this.hud.progress.levels).length > 0,
    });
    this.showcaseSwitch = new ShowcaseSwitch({
      toggle: () => this.showcase?.toggle(),
      another: () => this.startShowcase(),
      state: () => this.showcase?.state ?? 'moving',
    });
    this.pendingSeed = aisles.firstSeed;
    onPanelsResized(() => this.reframe());
    setInterval(() => this.hud.tick(), 250);
  }

  startLevel(level: LevelDef, brief = true): void {
    this.loader.load(() => {
      this.leaveScene(true);
      this.dropNextAisle();
      const hud = this.hud;
      const ctl = new Controller(this.stage, level, {
        onEval: (ev) => hud.onEval(ev),
        onInventory: () => hud.refreshInventory(),
        onHover: (cord, notes, x, y) => hud.onHover(cord, notes, x, y),
        onToast: (toast) => hud.toast(toastText(toast)),
        onStats: (stats) => hud.stats(statsText(stats)),
        onHint: (hint) => hud.hint(hint),
        isDialogOpen,
        unitLabel,
        onFind: (find) => hud.found(find),
      }, this.threaded, lookOf(load('notebook'), ticksWon(load('progress'), load('career'))));
      this.ctl = ctl;
      hud.attach(ctl, level);
      if (level.kind === 'tutorial') this.mode = new Tutorial(ctl, hud, { home: () => this.startShowcase(), play: () => this.playNext() });
      else if (brief) hud.showBrief(level);
      this.reframe();
    });
  }

  /** the title screen: the before/after aisle, with the game's name and its menu over it */
  startShowcase(): void {
    this.loader.load(async (token) => {
      this.leaveScene();
      // the game's panels stay hidden, the title shows its own progress while the aisle falls
      // (not for an aisle already made ready, behind the last one or set aside: it shows at once)
      document.body.classList.add('demo');
      const booting = !this.keptAisle && !this.nextAisle?.ready;
      if (booting) document.body.classList.add('booting');
      this.title.refresh();
      this.title.showProgress(0);
      const showcase = await this.takeNextAisle();
      // overtaken while it was falling: thrown away before it ever showed
      if (this.loader.isStale(token)) { showcase.dispose(); return; }
      this.mode = this.showcase = showcase;
      showcase.view = this.aisles.view;
      showcase.onStateChange = (state, to) => this.showcaseSwitch.render(state, to, showcase.bayCount);
      showcase.start();
      this.reframe();
      // still behind the title's bar: its first images, the next level's shaders, and the GPU compiling them
      if (booting) {
        await this.settleShaders(showcase);
        if (this.loader.isStale(token)) return;
        document.body.classList.remove('booting');
      } else {
        this.warmLevel();
      }
      this.showcaseSwitch.show();
      this.prepareNextAisle();
    });
  }

  /** the aisle falling, its share of the title's bar */
  private aisleProgress(f: number): void {
    this.title.showProgress(AISLE_SHARE * f);
  }

  /**
   * The aisle just started, out of sight: its first images (the chain of the
   * image built, lit as on screen), the next level's shaders (warmLevel), and
   * the GPU done compiling all of it. The first time a browser runs the game,
   * that froze the title screen for seconds once it showed. The bar goes on
   * from where the fall left it.
   */
  private async settleShaders(showcase: Showcase): Promise<void> {
    const shown = (f: number, step: LoadStep) => this.title.showProgress(AISLE_SHARE + (1 - AISLE_SHARE) * f, step);
    shown(0, 'shaders');
    await frames(3);
    shown(0.1, 'shaders');
    await this.warmLevel((f) => shown(0.1 + 0.7 * f, 'shaders'));
    if (this.showcase !== showcase) return;
    shown(0.8, 'gpu');
    await this.stage.gpuDone();
    shown(1, 'gpu');
    // (an image drawn with all of it before the veil lifts)
    await frames(2);
  }

  /** frames the cabinet in the screen the panels leave free (they change with the scene) */
  private reframe(): void {
    this.stage.setPanelMargins(panelMargins());
  }

  /** a free cabinet shared by its link; a code that is none says why, over the title screen */
  openRack(code: string): void {
    const spec = decodeSpec(code);
    if ('kind' in spec) this.hud.toast(freeErrorText(spec));
    else this.startLevel(freeLevel(spec));
  }

  /** where the story stands (the training, then the career), or the game modes once both are done */
  playNext(): void {
    const next = nextInStory(this.hud.progress, load('career'));
    if (next) this.startLevel(next);
    else this.hud.showModes();
  }

  /**
   * Leaves the current scene, whatever it is. `keepAisle`: the title screen's
   * aisle is set aside (keptAisle) rather than thrown away, unless it is on its
   * way from one state to the other.
   */
  private leaveScene(keepAisle = false): void {
    // a title screen still loading is left too
    document.body.classList.remove('demo', 'booting');
    const aisle = this.showcase;
    if (aisle) this.showcaseSwitch.hide();
    if (keepAisle && aisle && aisle.state !== 'moving') {
      aisle.stop();
      this.keptAisle = aisle;
    } else {
      this.mode?.dispose();
    }
    this.mode = null;
    this.showcase = null;
    this.ctl?.dispose();
    this.ctl = null;
    this.hud.detach();
  }

  /** the aisle set aside for a level, the one made ready behind the last one (still falling: its progress shows), or a new one */
  private async takeNextAisle(): Promise<Showcase> {
    const kept = this.keptAisle;
    if (kept) {
      this.keptAisle = null;
      return kept;
    }
    const next = this.nextAisle;
    if (next) {
      this.nextAisle = null;
      next.onProgress = (f) => this.aisleProgress(f);
      this.aisleProgress(next.done);
      return next.aisle;
    }
    const seed = this.pendingSeed;
    this.pendingSeed = undefined;
    return Showcase.create(this.stage, this.threaded, (f) => this.aisleProgress(f), {
      seed,
      labelOf: unitLabel,
      bays: this.aisles.bays,
      pairs: seed === undefined ? this.aisles.anotherPairs() : this.aisles.firstPairs,
      baked: seed === SHOWCASE_DEFAULT.seed ? await this.baked : null,
    });
  }

  private prepareNextAisle(): void {
    if (this.nextAisle) return;
    const next: NextAisle = { aisle: null!, onProgress: () => {}, done: 0, ready: false, stop: new AbortController() };
    next.aisle = Showcase.create(this.stage, this.threaded, (f) => { next.done = f; next.onProgress(f); },
      { bays: this.aisles.bays, pairs: this.aisles.anotherPairs(), background: true, labelOf: unitLabel, signal: next.stop.signal });
    // its pieces are built between the frames, which come late meanwhile (see Stage.busy)
    this.stage.busy++;
    const done = () => { this.stage.busy--; };
    next.aisle.then(done, done);
    // (given up: nothing to be ready)
    next.aisle.then(() => { next.ready = true; }, () => {});
    this.nextAisle = next;
  }

  /**
   * While the title screen shows, the shaders of the next level are built
   * (warmLevel): the first level opened does not stall on them. What
   * was built for it stays for the visit, so that three keeps them for every
   * level after. Again on the next title screen if a level opened first.
   */
  private warmLevel(progress?: (f: number) => void): Promise<unknown> {
    if (this.levelWarm) return this.levelWarm;
    const showcase = this.showcase;
    const level = nextInStory(this.hud.progress, load('career')) ?? TUTORIAL;
    this.levelWarm = warmLevel(this.stage, level, unitLabel, () => this.showcase !== showcase, progress).then((kept) => {
      if (!kept) this.levelWarm = null;
      return kept;
    });
    return this.levelWarm;
  }

  /** a level leaves the title screen: the aisle made ready for it goes, given up if it is still built */
  private dropNextAisle(): void {
    if (!this.nextAisle) return;
    this.nextAisle.stop.abort();
    // built already, it is thrown away; given up, it threw itself away
    this.nextAisle.aisle.then((sc) => sc.dispose(), () => {});
    this.nextAisle = null;
  }
}
