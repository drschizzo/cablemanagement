// One closet of the aisle: the mess and the tidy cabinet, two worlds on the
// same rack, and the choreography from one to the other.

import type * as THREE from 'three';
import type { Stage } from '../render/stage';
import { SHOWCASE_SETTLE } from '../game/levels/showcaseRack';
import { U } from '../game/rack';
import { printOf, type BakedBay } from '../game/mess/baked';
import type { CableStart } from '../game/cables';
import { sfx } from '../audio/sfx';
import { Bay, type Pause } from './bay';
import type { Place } from './aisleLayout';
import { tidyTargets } from '../game/idealRoutes';

/** one closet of the aisle: its mess and its tidy self, drawn on the same rack */
export class Closet {
  messPos!: Float64Array;
  /** the cords of the mess laid along the tidy routes */
  tidyShapes!: Float64Array;
  /** where the mess comes to rest, if it is known already (baked, or fallen in a worker): it then does not fall here */
  private fallen: Float64Array | null = null;

  private constructor(public mess: Bay, public tidy: Bay) {}

  /**
   * Builds a closet (hidden), a piece at a time, with `pause` between them. Its
   * mess, if not `fallen` already (its tangle and where it came to rest), or
   * `baked` (where it came to rest, if it still is the same mess), falls in
   * settle(): in its worker when `threaded`.
   */
  static async make(stage: Stage, seed: number, at: Place, threaded: boolean, pairs: number | undefined, pause: Pause,
    fallen?: { starts: CableStart[]; x: Float64Array }, baked?: BakedBay): Promise<Closet> {
    const mess = await Bay.make(stage, 'mess', seed, at, pairs, pause, fallen?.starts);
    await pause();
    const c = new Closet(mess, await Bay.make(stage, 'tidy', seed, at, pairs, pause));
    const sim = mess.world.sim;
    c.fallen = fallen?.x ?? (baked && baked.x.length === sim.x.length && baked.print === printOf(sim.x) ? baked.x : null);
    // the mess only falls once: a cheap solver will do
    Object.assign(sim.P, SHOWCASE_SETTLE.solver);
    if (threaded && !c.fallen) sim.startWorker();
    await pause();
    c.dress();
    return c;
  }

  private dress(): void {
    // one rack on screen: the tidy bay draws it with its managers (hidden for now), the mess bay only its cords
    const rack = this.tidy.rackView!;
    rack.itemsGroup.visible = false;
    // so both sets of cords take the light of the rack on screen
    this.mess.cableView.lightBy(rack.glow);
    this.tidy.cableView.lightBy(rack.glow);
    // the tidy closet is shown exactly on its routes: a demonstration, perfect every time
    const tw = this.tidy.world;
    tw.sim.hold = true;
    tw.sim.teleport(tidyTargets(tw, this.tidy.tidyPaths));
    this.tidy.cordsVisible = false;
    // nothing on screen until the mess has fallen: only its end state is shown
    this.visible = false;
  }

  set visible(v: boolean) {
    this.mess.group.visible = this.tidy.group.visible = v;
  }

  /** what the closet puts in the scene: its two states */
  get groups(): THREE.Object3D[] {
    return [this.mess.group, this.tidy.group];
  }

  /** lets the mess fall, in `chunks` steps (or puts it where it is known to come to rest) */
  async settle(chunks: number, step: () => void, pause: Pause): Promise<void> {
    if (this.fallen) {
      await pause();
      this.mess.world.sim.x.set(this.fallen);
    } else {
      for (let i = 0; i < chunks; i++) {
        await this.mess.world.sim.settle(Math.ceil(SHOWCASE_SETTLE.frames / chunks));
        step();
      }
    }
    // frozen as it fell
    this.mess.world.sim.hold = true;
    this.messPos = Float64Array.from(this.mess.world.sim.x);
    this.tidyShapes = this.mess.tidyShapes(this.tidy);
    this.mess.cableView.update(true);
  }

  dispose(stage: Stage): void {
    this.mess.dispose(stage);
    this.tidy.dispose(stage);
  }

  tick(dt: number): void {
    this.mess.tick(dt);
    this.tidy.tick(dt);
  }

  /** swaps one cord of a bay for the same cord of the other */
  private swap(c: number, show: Bay, hide: Bay): void {
    hide.cableView.setVisible(c, false);
    show.cableView.setVisible(c, true);
  }

  /** the managers and ducts go in, then every cord is pulled out of the heap and dressed into its route */
  tidyUp(later: (ms: number, f: () => void) => void, sound: boolean, done: () => void): void {
    const w = this.tidy.world;
    this.tidy.rackView!.itemsGroup.visible = true;
    sfx.place();
    w.cables.forEach((_, c) => w.labelCord(c, null));
    // row after row, left to right: the closet fills up like a printed page
    const order = w.cables.map((_, c) => c).sort((p, q) => {
      const a = w.rack.port(w.circuits[p].a), b = w.rack.port(w.circuits[q].a);
      return a.unit - b.unit || a.x - b.x;
    });
    sfx.whoosh();
    this.mess.fly(this.messPos, this.tidyShapes, order, {
      stagger: 2.8 / order.length, dur: 1.2, wave: 0.5,
      // from the panel to the switch, as a technician would dress it
      lag: (s) => s,
      ease: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
      lift: 0.07,
      takeoff: () => {},
      land: (c, k) => {
        this.swap(c, this.tidy, this.mess);
        w.labelCord(c, w.circuits[c].service);
        if (sound && k % 2 === 0) sfx.land(k);
      },
      done: () => {
        later(250, () => {
          // velcro all along the ducts, round the cords running down them
          const ducts = w.rack.items.filter((it) => it.kind === 'duct' && it.side === 1);
          const top = w.rack.topY - Math.min(...ducts.map((d) => d.unit)) * U;
          const bottom = w.rack.topY - Math.max(...ducts.map((d) => d.unit + d.span)) * U;
          for (const side of [-1, 1]) {
            for (let y = top - 0.04; y > bottom + 0.02; y -= 0.09) w.addStrap(side * 0.318, y, 0.006, 0.08, [0, 1, 0]);
          }
          sfx.velcro();
        });
        later(1100, done);
      },
    });
  }

  messUp(later: (ms: number, f: () => void) => void, done: () => void): void {
    const tw = this.tidy.world;
    tw.clearStraps();
    tw.cables.forEach((_, c) => tw.labelCord(c, null));
    sfx.whoosh();
    // the last cord in is the first one out; each slumps from its middle to the floor
    const order = this.mess.world.cables.map((_, c) => c).reverse();
    this.mess.fly(this.tidyShapes, this.messPos, order, {
      stagger: 1.2 / order.length, dur: 0.9, wave: 0.35,
      lag: (s) => Math.abs(2 * s - 1),
      ease: (p) => p * p,
      lift: 0.03,
      takeoff: (c) => this.swap(c, this.mess, this.tidy),
      land: () => {},
      done: () => {
        this.tidy.rackView!.itemsGroup.visible = false;
        sfx.remove();
        later(500, done);
      },
    });
  }
}
