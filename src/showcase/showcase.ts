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

/** where a closet is drawn out of sight once, before it shows (see Showcase.warm) */
const warmTarget = new THREE.WebGLRenderTarget(1, 1);

/** delay between two racks of the aisle, when they are tidied up or messed up (ms) */
const WAVE = 700;

export class Showcase {
  private closets: Closet[] = [];
  private el: HTMLElement;
  private state: 'before' | 'after' | 'moving' = 'before';
  private timers: number[] = [];
  private disposed = false;
  private started = false;
  private last = performance.now();
  private floor: THREE.Group;
  /** before it is tidied, cords keep falling from above and pile up in the middle of the room */
  private rain!: CableRain;
  /** the top of the tallest rack (m): the racks of an aisle may be of any height */
  private get topY(): number {
    return Math.max(...this.closets.map((c) => c.tidy.world.rack.topY));
  }

  /** where the camera rests, relative to the framing of the aisle (see Stage.view); set before start() */
  view: Stage['view'] = null;

  /**
   * Builds an aisle of `bays` closets from `seed` (drawn if not given), of
   * `pairs` panel / switch pairs (one for all, or one each; drawn if not given), and lets their mess
   * fall (each in its worker; or puts it where `baked` says it fell), reporting
   * progress. Nothing shows until start(): the caller may throw it away first.
   * `background`: built while another is on screen, one closet at a time, the
   * frames going on between them.
   */
  static async create(stage: Stage, threaded: boolean, actions: { another(): void }, progress: (f: number) => void,
    o: { seed?: number; bays?: number; pairs?: number | number[]; baked?: BakedBay[] | null; background?: boolean } = {}): Promise<Showcase> {
    const sc = new Showcase(stage, actions);
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
    const falls = threaded && !o.baked ? places.map((_, k) => fallInWorker(seed + k, pairs(k), chunks, step)) : null;
    for (let k = 0; k < places.length; k++) {
      const fallen = falls ? await falls[k] : undefined;
      sc.closets.push(await Closet.make(stage, seed + k, places[k], threaded, pairs(k), pause, fallen, o.baked?.[k]));
      // baked, nothing falls: the bar follows the closets as they are built
      if (o.baked) {
        progress((k + 1) / bays);
        if (!o.background) await frame();
      }
    }
    const rack = sc.closets[0].mess.world.rack;
    // the heap in the middle of the half circle, a little ahead of the racks
    sc.rain = new CableRain({
      floorY: rack.floorY, topY: sc.topY, racks: places, seed,
      centre: { x: 0, z: bays > 1 ? 0.75 : 0.45 }, spread: bays > 1 ? 0.2 : 0.12,
    });
    sc.rain.group.visible = false;
    stage.scene.add(sc.rain.group);
    await Promise.all(sc.closets.map((c) => c.settle(chunks, step, pause)));
    // drawn once out of sight, so that its first image on screen does not stall on them
    for (const c of sc.closets) {
      await pause();
      sc.warm(c);
    }
    // the cords fall on the mess spilt on the floor
    const p = new THREE.Vector3();
    for (const c of sc.closets) {
      const x = Float64Array.from(c.messPos);
      c.mess.group.updateMatrixWorld();
      for (let i = 0; i < x.length; i += 3) {
        p.set(x[i], x[i + 1], x[i + 2]).applyMatrix4(c.mess.group.matrixWorld);
        x[i] = p.x; x[i + 1] = p.y; x[i + 2] = p.z;
      }
      sc.rain.support(x, c.mess.world.radius);
    }
    return sc;
  }

  private constructor(private stage: Stage, private actions: { another(): void }) {
    this.el = document.getElementById('showcase')!;
    this.floor = buildRoom(0);
    // hidden until start(): an aisle made ready in the background must not lay its floor over the one on screen
    this.floor.visible = false;
    stage.scene.add(this.floor);
  }

  /**
   * Draws a closet once, alone, into a pixel: its shaders, buffers and
   * textures go to the GPU then. Left to its first image on screen, that took
   * a tenth of a second or more, and the title screen stalled as it appeared.
   */
  private warm(c: Closet): void {
    const scene = this.stage.scene, r = this.stage.renderer;
    const shown = scene.children.filter((o) => o.visible && !(o as THREE.Light).isLight);
    for (const o of shown) o.visible = false;
    // all of it, its managers too (hidden until it is tidied), wherever the camera looks
    const items = c.tidy.rackView!.itemsGroup;
    c.visible = items.visible = true;
    const culled: THREE.Object3D[] = [];
    for (const g of [c.mess.group, c.tidy.group]) g.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    const prev = r.getRenderTarget();
    r.setRenderTarget(warmTarget);
    r.render(scene, this.stage.camera);
    r.setRenderTarget(prev);
    // and the light of its LEDs on the cords (its map, drawn before each image)
    c.tidy.rackView!.glow.render(r);
    for (const o of culled) o.frustumCulled = true;
    c.visible = items.visible = false;
    for (const o of shown) o.visible = true;
  }

  /** puts the aisle on screen: its panel, the camera sway (the title screen around it is the caller's) */
  start(): void {
    this.started = true;
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
    this.stage.frame((bounds.topY + bounds.floorY) / 2 + 0.02, bounds.topY - bounds.floorY + 0.1, side + (n > 1 ? 0.15 : 0.6), n > 1 ? 0 : 0.03, side + 0.6, near);
    document.body.classList.add('demo');
    this.el.classList.add('on');
    (this.el.querySelector('#sc-before') as HTMLElement).onclick = () => { if (this.state === 'after') this.toggle(); };
    (this.el.querySelector('#sc-after') as HTMLElement).onclick = () => { if (this.state === 'before') this.toggle(); };
    (this.el.querySelector('#sc-new') as HTMLElement).onclick = () => this.actions.another();
    this.stage.sway(true);
    this.stage.dragPans(true);
    this.render();
    this.rain.start();
    requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    for (const c of this.closets) c.dispose(this.stage);
    this.stage.scene.remove(this.floor);
    disposeTree(this.floor);
    this.stage.scene.remove(this.rain.group);
    this.rain.dispose();
    // one made ready in the background and never shown leaves the screen as it is
    if (!this.started) return;
    this.el.classList.remove('on');
    document.body.classList.remove('demo');
    delete document.body.dataset.sc;
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

  private frame = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);
    const now = performance.now();
    if (!this.stage.due(now)) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  private toggle(): void {
    if (this.state === 'moving') return;
    const tidy = this.state === 'before';
    this.state = 'moving';
    this.render(tidy ? 'after' : 'before');
    if (tidy) this.rain.stop();
    else this.rain.start();
    // a wave down the aisle: left to right to tidy up, back the other way to mess up
    const order = tidy ? this.closets : [...this.closets].reverse();
    let left = order.length;
    const done = () => {
      if (--left) return;
      this.state = tidy ? 'after' : 'before';
      this.render();
      if (tidy) sfx.win();
    };
    const later = (ms: number, f: () => void) => this.later(ms, f);
    order.forEach((c, k) => this.later(k * WAVE, () => (tidy ? c.tidyUp(later, k === 0, done) : c.messUp(later, done))));
  }

  private later(ms: number, f: () => void): void {
    this.timers.push(window.setTimeout(() => { if (!this.disposed) f(); }, ms));
  }

  /** the switch and its caption; while it moves, the switch is already on its way to `to` */
  private render(to?: 'before' | 'after'): void {
    const sw = this.el.querySelector('#sc-switch') as HTMLElement;
    const many = this.closets.length > 1;
    // the title screen follows the state too (its LEDs, its play button)
    document.body.dataset.sc = this.state;
    sw.className = this.state === 'moving' ? `to-${to}` : this.state;
    for (const side of ['before', 'after'] as const) {
      const b = this.el.querySelector(`#sc-${side}`) as HTMLButtonElement;
      b.disabled = this.state !== (side === 'before' ? 'after' : 'before');
      b.setAttribute('aria-pressed', String(this.state === side || to === side));
    }
    const what = many ? `${this.closets.length} baies` : 'Une baie';
    (this.el.querySelector('#sc-caption') as HTMLElement).textContent =
      this.state === 'before' ? `${what}, et le technicien précédent est passé par là.`
      : this.state === 'after' ? 'Chaque cordon à sa longueur, rangé, étiqueté.'
      : to === 'after' ? 'Rangement en cours…' : 'Retour au désordre…';
  }
}
