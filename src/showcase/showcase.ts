// Before / after: one packed wiring closet, drawn at random each time. Before,
// long patch cords spill out of an open rack down to the floor; after, each
// one has been replaced by a short cord on its tidy route, labelled and strapped.
//
// The two states are two worlds sharing the same rack and patching schedule:
// the mess (long cords, nothing managed) and the tidy cabinet (short cords,
// managers and ducts). The mess falls once, in its worker, then is frozen;
// the switch from one to the other is a choreography played by the dense
// cords of the mess: each one is dressed into its tidy route from one end to
// the other (or slumps back to the floor), and is swapped for the short cord
// of the other world where the two shapes coincide.

import * as THREE from 'three';
import type { Stage } from '../render/stage';
import { buildRoom } from '../render/room';
import { disposeTree } from '../render/dispose';
import { CableRain } from './cableRain';
import type { BakedBay } from '../game/mess/baked';
import { fallInWorker } from '../game/mess/fallWorkerClient';
import { sfx } from '../audio/sfx';
import { Closet } from './closet';
import { aisleLayout } from './aisleLayout';
import type { Pause } from './bay';
import type { UnitLabeller } from '../render/rackView';

/** delay between two racks of the aisle, when they are tidied up or messed up (ms) */
const WAVE = 700;

export type ShowcaseState = 'before' | 'after' | 'moving';

/** what an aisle is made of, and how (see Showcase.create) */
interface AisleOptions {
  seed?: number;
  bays?: number;
  pairs?: number | number[];
  baked?: BakedBay[] | null;
  background?: boolean;
  labelOf?: UnitLabeller;
  signal?: AbortSignal;
}

export class Showcase {
  private closets: Closet[] = [];
  private currentState: ShowcaseState = 'before';
  private timers: number[] = [];
  private disposed = false;
  /** between start() and stop(): on screen, its frames running */
  private onScreen = false;
  /** counts the starts and stops: the frame loop of an earlier start ends */
  private loop = 0;
  private last = performance.now();
  private floor: THREE.Group;
  /** before it is tidied, cords keep falling from above and pile up in the middle of the room (made once the closets are) */
  private rain!: CableRain;
  /** the top of the tallest rack (m): the racks of an aisle may be of any height */
  private get topY(): number {
    return Math.max(...this.closets.map((c) => c.tidy.world.rack.topY));
  }

  /** the aisle changed state; `to`: where it is going while it moves (the interface's switch follows) */
  onStateChange: (state: ShowcaseState, to?: 'before' | 'after') => void = () => {};

  get state(): ShowcaseState {
    return this.currentState;
  }

  get bayCount(): number {
    return this.closets.length;
  }

  /** where the camera rests, relative to the framing of the aisle (see Stage.view); set before start() */
  view: Stage['view'] = null;

  /**
   * Builds an aisle of `bays` closets from `seed` (drawn if not given), of
   * `pairs` panel / switch pairs (one for all, or one each; drawn if not given), and lets their mess
   * fall (each in its worker; or puts it where `baked` says it fell), reporting
   * progress. Nothing shows until start(): the caller may throw it away first.
   * `background`: built while another is on screen, one closet at a time, the
   * frames going on between them. `labelOf`: the words on the face plates.
   * `signal`: given up (a level begins meanwhile), what is built goes, the falls
   * stop in their workers, and the promise fails with the signal's reason.
   */
  static async create(stage: Stage, threaded: boolean, progress: (f: number) => void,
    o: AisleOptions = {}): Promise<Showcase> {
    const sc = new Showcase(stage);
    try {
      return await sc.build(threaded, progress, o);
    } catch (e) {
      sc.dispose();
      throw e;
    }
  }

  /** what create() does, the aisle given up or not */
  private async build(threaded: boolean, progress: (f: number) => void, o: AisleOptions): Promise<Showcase> {
    const stage = this.stage;
    const given = () => o.signal?.throwIfAborted();
    const seed = o.seed ?? Math.floor(Math.random() * 1e9), bays = o.bays ?? 1;
    const places = aisleLayout(bays, seed);
    // one height for all, or one each
    const pairs = (k: number) => (Array.isArray(o.pairs) ? o.pairs[k] : o.pairs);
    const chunks = 5;
    let steps = 0;
    const step = () => progress(++steps / (chunks * bays));
    // a frame (or a moment, if the page draws none)
    const frame: Pause = () => new Promise((r) => {
      let gone = false;
      const go = () => { if (!gone) { gone = true; setTimeout(r, 0); } };
      requestAnimationFrame(go);
      setTimeout(go, 100);
    });
    // in the background, between any two pieces; otherwise only between two closets (the bar moves)
    const pause: Pause = o.background ? frame : () => Promise.resolve();
    // nothing baked: every mess is drawn and falls in a worker of its own, all at once, and the
    // page builds each closet around it as soon as it is down
    const falls = threaded && !o.baked ? places.map((_, k) => fallInWorker(seed + k, pairs(k), chunks, step, o.signal)) : null;
    // given up: those not awaited yet fail quietly
    for (const f of falls ?? []) f.catch(() => {});
    for (let k = 0; k < places.length; k++) {
      const fallen = falls ? await falls[k] : undefined;
      given();
      this.closets.push(await Closet.make(stage, seed + k, places[k], threaded, pairs(k), pause, o.labelOf, fallen, o.baked?.[k]));
      // baked, nothing falls: the bar follows the closets as they are built
      if (o.baked) {
        progress((k + 1) / bays);
        if (!o.background) await frame();
      }
    }
    const rack = this.closets[0].mess.world.rack;
    // the heap in the middle of the half circle, a little ahead of the racks
    this.rain = new CableRain({
      floorY: rack.floorY, topY: this.topY, racks: places, seed,
      centre: { x: 0, z: bays > 1 ? 0.75 : 0.45 }, spread: bays > 1 ? 0.2 : 0.12,
    });
    this.rain.group.visible = false;
    stage.scene.add(this.rain.group);
    given();
    await Promise.all(this.closets.map((c) => c.settle(chunks, step, pause)));
    // drawn once out of sight, so that its first image on screen does not stall on them
    for (const c of this.closets) {
      await pause();
      given();
      await this.warm(c);
    }
    // the cords fall on the mess spilt on the floor
    const p = new THREE.Vector3();
    for (const c of this.closets) {
      const x = Float64Array.from(c.messPos);
      c.mess.group.updateMatrixWorld();
      for (let i = 0; i < x.length; i += 3) {
        p.set(x[i], x[i + 1], x[i + 2]).applyMatrix4(c.mess.group.matrixWorld);
        x[i] = p.x; x[i + 1] = p.y; x[i + 2] = p.z;
      }
      this.rain.support(x, c.mess.world.radius);
    }
    return this;
  }

  private constructor(private stage: Stage) {
    this.floor = buildRoom(0);
    // hidden until start(): an aisle made ready in the background must not lay its floor over the one on screen
    this.floor.visible = false;
    stage.scene.add(this.floor);
  }

  /**
   * Compiles a closet's shaders in the background before it shows, and
   * sends its buffers and textures to the GPU. Left to its first image on
   * screen, that stalled the title screen for half a second at a time.
   */
  private async warm(c: Closet): Promise<void> {
    // all of it, its managers too (hidden until it is tidied), wherever the camera looks
    const items = c.tidy.rackView!.itemsGroup;
    c.visible = items.visible = true;
    const culled: THREE.Object3D[] = [];
    for (const g of c.groups) g.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    // (the closet is looked through at once: it may go back as it was before the compiling ends)
    const ready = Promise.all(c.groups.map((g) => this.stage.compile(g)));
    for (const o of culled) o.frustumCulled = true;
    c.visible = items.visible = false;
    // and the light of its LEDs on the cords (its map, drawn before each image)
    c.tidy.rackView!.glow.render(this.stage.renderer);
    await ready;
  }

  /** what the aisle puts in the scene */
  private get objects(): THREE.Object3D[] {
    return [this.floor, this.rain.group, ...this.closets.flatMap((c) => c.groups)];
  }

  /**
   * Puts the aisle on screen: its panel, the camera sway (the title screen
   * around it is the caller's); again after stop(), as it was left.
   */
  start(): void {
    if (this.onScreen) return;
    this.onScreen = true;
    this.stage.scene.add(...this.objects);
    for (const c of this.closets) c.visible = true;
    this.floor.visible = this.rain.group.visible = true;
    const bounds = { floorY: this.closets[0].tidy.world.rack.floorY, topY: this.topY };
    this.floor.position.y = bounds.floorY;
    const n = this.closets.length;
    // the whole half circle, as close as it fits: the racks at its ends come towards the camera
    const ends = this.closets.map((c) => c.mess.group.position);
    const side = Math.max(...ends.map((p) => Math.abs(p.x)));
    const near = Math.max(...ends.map((p) => p.z));
    this.stage.view = this.view;
    this.stage.floorY = bounds.floorY;
    this.stage.frame((bounds.topY + bounds.floorY) / 2 + 0.02, bounds.topY - bounds.floorY + 0.1, side + (n > 1 ? 0.15 : 0.6), n > 1 ? 0 : 0.03, side + 0.6, near);
    this.stage.sway(true);
    this.stage.dragPans(true);
    this.onStateChange(this.currentState);
    // tidied up, it no longer rains
    if (this.currentState === 'before') this.rain.start();
    const loop = ++this.loop;
    this.last = performance.now();
    const frame = () => {
      if (this.disposed || loop !== this.loop) return;
      requestAnimationFrame(frame);
      this.frame();
    };
    requestAnimationFrame(frame);
  }

  /**
   * Takes the aisle off screen as it is, to show it again with start() (a
   * level is played meanwhile). Out of the scene, not merely hidden: the
   * ambient occlusion and the reflections go through every object of the
   * scene, hidden or not. Not while it moves: its choreography runs on timers.
   */
  stop(): void {
    if (!this.onScreen) return;
    this.onScreen = false;
    this.loop++;
    this.stage.scene.remove(...this.objects);
    this.leaveStage();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    for (const c of this.closets) c.dispose(this.stage);
    this.stage.scene.remove(this.floor);
    disposeTree(this.floor);
    // (none yet: given up while its closets were built)
    if (this.rain) {
      this.stage.scene.remove(this.rain.group);
      this.rain.dispose();
    }
    // one made ready in the background and never shown (or set aside) leaves the screen as it is
    if (this.onScreen) this.leaveStage();
  }

  /** the camera as the aisle found it */
  private leaveStage(): void {
    this.stage.moving = false;
    this.stage.sway(false);
    this.stage.dragPans(false);
    this.stage.view = null;
  }

  /** advances by dt and draws (also called by the automated checks) */
  tick(dt: number): void {
    for (const c of this.closets) c.tick(dt);
    this.rain.tick(dt);
    this.stage.render();
  }

  /** a frame, when one is due */
  private frame(): void {
    const now = performance.now();
    if (!this.stage.due(now)) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  }

  /** before → after (tidied up, bay after bay), or back to the mess; nothing while it moves */
  toggle(): void {
    if (this.currentState === 'moving') return;
    const tidy = this.currentState === 'before';
    this.currentState = 'moving';
    this.stage.moving = true;
    this.onStateChange('moving', tidy ? 'after' : 'before');
    if (tidy) this.rain.stop();
    else this.rain.start();
    // a wave down the aisle: left to right to tidy up, back the other way to mess up
    const order = tidy ? this.closets : [...this.closets].reverse();
    let left = order.length;
    const done = () => {
      if (--left) return;
      this.currentState = tidy ? 'after' : 'before';
      this.stage.moving = false;
      this.onStateChange(this.currentState);
      if (tidy) sfx.win();
    };
    const later = (ms: number, f: () => void) => this.later(ms, f);
    order.forEach((c, k) => this.later(k * WAVE, () => (tidy ? c.tidyUp(later, k === 0, done) : c.messUp(later, done))));
  }

  private later(ms: number, f: () => void): void {
    this.timers.push(window.setTimeout(() => { if (!this.disposed) f(); }, ms));
  }
}
