// The game as a whole: which scene is on screen — a level (a Controller, with
// the tutorial over it or not) or the title screen over the before/after
// aisle (a Showcase) — and how to go from one to the other.

import type { Stage } from '../render/stage';
import { Controller } from '../play/controller';
import { Showcase } from '../showcase/showcase';
import { Hud } from '../ui/hud';
import { Tutorial } from '../ui/tutorial';
import { statsText, toastText } from '../ui/messages';
import { isDialogOpen } from '../ui/dom';
import { unitLabel } from '../ui/names';
import { lookOf } from '../ui/shop';
import { load } from '../ui/storage';
import { nextLevelToPlay } from '../game/levels/campaign';
import type { LevelDef } from '../game/levels/levelDef';
import { SHOWCASE_DEFAULT } from '../game/levels/showcaseRack';
import { dailyLevel, dayKey } from '../game/levels/dailyLevel';
import type { BakedBay } from '../game/mess/baked';
import { SceneLoader } from './sceneLoader';
import { TitleScreen } from '../ui/titleScreen';
import { onPanelsResized, panelMargins } from '../ui/panelMargins';
import type { AisleSettings } from './urlOptions';
import { $ } from '../lib/page';
import { ShowcaseSwitch } from '../ui/showcaseSwitch';

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
      showMenu: () => this.hud.showMenu(),
      showSettings: () => this.hud.showSettings(),
      showShop: () => this.hud.showShop(),
      nextLevel: () => nextLevelToPlay(this.hud.progress.stars),
      hasProgress: () => Object.keys(this.hud.progress.stars).length > 0,
      playDaily: () => this.startLevel(dailyLevel(dayKey(new Date()))),
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
      }, this.threaded, lookOf(load('wallet')));
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
      if (!this.keptAisle && !this.nextAisle?.ready) document.body.classList.add('booting');
      this.title.refresh();
      this.title.showProgress(0);
      const showcase = await this.takeNextAisle();
      // overtaken while it was falling: thrown away before it ever showed
      if (this.loader.isStale(token)) { showcase.dispose(); return; }
      this.mode = this.showcase = showcase;
      document.body.classList.remove('booting');
      showcase.view = this.aisles.view;
      showcase.onStateChange = (state, to) => this.showcaseSwitch.render(state, to, showcase.bayCount);
      this.showcaseSwitch.show();
      showcase.start();
      this.reframe();
      this.prepareNextAisle();
    });
  }

  /** frames the cabinet in the screen the panels leave free (they change with the scene) */
  private reframe(): void {
    this.stage.setPanelMargins(panelMargins());
  }

  /** the first level not yet tidy enough to open the next one, or the menu once they all are */
  playNext(): void {
    const next = nextLevelToPlay(this.hud.progress.stars);
    if (next) this.startLevel(next);
    else this.hud.showMenu();
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
      next.onProgress = (f) => this.title.showProgress(f);
      this.title.showProgress(next.done);
      return next.aisle;
    }
    const seed = this.pendingSeed;
    this.pendingSeed = undefined;
    return Showcase.create(this.stage, this.threaded, (f) => this.title.showProgress(f), {
      seed,
      labelOf: unitLabel,
      bays: this.aisles.bays,
      pairs: seed === undefined ? this.aisles.anotherPairs() : this.aisles.firstPairs,
      baked: seed === SHOWCASE_DEFAULT.seed ? await this.baked : null,
    });
  }

  private prepareNextAisle(): void {
    if (this.nextAisle) return;
    const next: NextAisle = { aisle: null!, onProgress: () => {}, done: 0, ready: false };
    next.aisle = Showcase.create(this.stage, this.threaded, (f) => { next.done = f; next.onProgress(f); },
      { bays: this.aisles.bays, pairs: this.aisles.anotherPairs(), background: true, labelOf: unitLabel });
    // its pieces are built between the frames, which come late meanwhile (see Stage.busy)
    this.stage.busy++;
    const done = () => { this.stage.busy--; };
    next.aisle.then(done, done);
    void next.aisle.then(() => { next.ready = true; });
    this.nextAisle = next;
  }

  /** a level leaves the title screen: the aisle made ready for it goes */
  private dropNextAisle(): void {
    if (!this.nextAisle) return;
    void this.nextAisle.aisle.then((sc) => sc.dispose());
    this.nextAisle = null;
  }
}
