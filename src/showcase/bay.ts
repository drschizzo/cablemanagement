// One rack of the aisle in one of its two states (the mess, or the tidy
// cabinet): its world, its view, and the flight that carries its cords from
// one shape to the other.

import * as THREE from 'three';
import type { Stage } from '../render/stage';
import { RackView } from '../render/rackView';
import { CableView } from '../render/cableView';
import { disposeTree } from '../render/dispose';
import { World } from '../game/world';
import { showcaseRack } from '../game/levels/showcaseRack';
import type { FibreType } from '../game/cordTypes';
import { resample, tidyLayout } from '../game/idealRoutes';
import type { V3 } from '../lib/vec3';
import type { CableStart } from '../game/cables';
import type { Place } from './aisleLayout';

/** waits a little, so that the page may draw (or not at all) */
export type Pause = () => Promise<void>;

export interface FlightOpts {
  stagger: number;
  dur: number;
  /** share of the flight the motion takes to run along the cord */
  wave: number;
  /** when each point of the cord sets off (0..1), by its place along it (0..1) */
  lag: (s: number) => number;
  ease: (p: number) => number;
  /** the cord bows out towards the viewer on its way (m) */
  lift: number;
  takeoff: (c: number) => void;
  land: (c: number, k: number) => void;
  done: () => void;
}

interface Flight extends FlightOpts {
  from: Float64Array;
  to: Float64Array;
  vel: Float64Array;
  t: number;
  starts: number[];
  /** per cord: 0 waiting, 1 on its way, 2 landed */
  phase: Uint8Array;
  landed: number;
}

// the cord follows its moving target like a spring (rad/s, damping ratio): a
// little lag on the way, a little overshoot on landing
const SPRING_W = 22;
const SPRING_Z = 0.5;

export class Bay {
  /** the rack on screen, for the tidy bay only (the mess draws its cords in front of it) */
  rackView: RackView | null = null;
  cableView!: CableView;
  group = new THREE.Group();
  flight: Flight | null = null;
  private moved!: Uint8Array;
  /** time not yet stepped by the physics (s) */
  private acc = 0;

  /** the tidy cabinet: the tidy route of each cord (empty for the mess) */
  tidyPaths: V3[][] = [];

  private constructor(public world: World) {}

  /**
   * Builds a bay (hidden), a piece at a time, with `pause` between them; `starts`:
   * the tangle of the mess, already drawn.
   */
  static async make(stage: Stage, state: 'mess' | 'tidy', seed: number, at: Place, pairs: number | undefined, pause: Pause, starts?: CableStart[]): Promise<Bay> {
    const level = showcaseRack(state, seed, pairs);
    // the tidy cabinet: its cords laid on their tidy routes, cut to length (no tangle to draw)
    const layout = state === 'tidy' ? tidyLayout(level) : null;
    const b = new Bay(new World(level, layout?.starts ?? starts));
    b.tidyPaths = layout?.paths ?? [];
    const w = b.world;
    b.group.visible = false;
    b.group.position.set(at.x, 0, at.z);
    b.group.rotation.y = at.yaw;
    stage.scene.add(b.group);
    if (state === 'tidy') {
      await pause();
      const types = new Map<number, FibreType>();
      w.circuits.forEach((c) => types.set(w.rack.port(c.a).unit, c.type));
      b.rackView = new RackView(w.rack, types, { roomFloor: false });
      b.group.add(b.rackView.group);
      await pause();
      b.rackView.syncItems(w.itemsVersion);
    }
    await pause();
    b.cableView = new CableView(w);
    b.group.add(b.cableView.group);
    b.cableView.update(true);
    b.moved = new Uint8Array(w.cables.length);
    await pause();
    b.leds();
    return b;
  }

  dispose(stage: Stage): void {
    this.world.dispose();
    stage.scene.remove(this.group);
    disposeTree(this.group);
  }

  /** the cords only: the rack itself is drawn by one of the two bays */
  set cordsVisible(v: boolean) {
    for (let c = 0; c < this.world.cables.length; c++) this.cableView.setVisible(c, v);
  }

  tick(dt: number): void {
    if (this.flight) {
      this.stepFlight(dt);
      this.cableView.update((c) => this.moved[c] === 1);
    } else if (this.world.sim.hold) {
      // frozen: nothing to rebuild but the labels and straps
      this.cableView.update(() => false);
    } else {
      // fixed steps, at most two a frame, whatever the rate of the frames
      const h = this.world.sim.P.dt;
      this.acc = Math.min(this.acc + dt, 2 * h);
      const k = Math.floor(this.acc / h);
      this.acc -= k * h;
      this.world.sim.advance(k);
      this.cableView.update();
    }
    this.rackView?.syncItems(this.world.itemsVersion);
  }

  /** moves every cord from one shape to the other, one after the other in `order` */
  fly(from: Float64Array, to: Float64Array, order: number[], o: FlightOpts): void {
    const starts = new Array(this.world.cables.length).fill(0);
    order.forEach((c, k) => { starts[c] = k * o.stagger; });
    this.world.sim.hold = true;
    this.world.sim.x.set(from);
    this.flight = {
      ...o, from, to, vel: new Float64Array(from.length), t: 0, starts,
      phase: new Uint8Array(this.world.cables.length), landed: 0,
    };
  }

  private stepFlight(dt: number): void {
    const m = this.flight!;
    m.t += dt;
    const x = this.world.sim.x, v = m.vel;
    const floor = this.world.rack.floorY + this.world.radius;
    const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    const k2 = SPRING_W * SPRING_W, c2 = 2 * SPRING_Z * SPRING_W;
    this.moved.fill(0);
    this.world.cables.forEach((cb, c) => {
      const u = (m.t - m.starts[c]) / m.dur;
      if (m.phase[c] === 2 || u <= 0) return;
      if (m.phase[c] === 0) { m.phase[c] = 1; m.takeoff(c); }
      this.moved[c] = 1;
      let off = 0;
      for (let k = 0; k < cb.count; k++) {
        const i = 3 * (cb.start + k);
        // each point of the cord has its own progress: the motion runs along it
        const p = Math.min(1, Math.max(0, (u - m.wave * m.lag(k / (cb.count - 1))) / (1 - m.wave)));
        const e = m.ease(p);
        const bow = m.lift * Math.sin(Math.PI * p);
        for (let d = 0; d < 3; d++) {
          const target = m.from[i + d] + (m.to[i + d] - m.from[i + d]) * e + (d === 2 ? bow : 0);
          let xd = x[i + d], vd = v[i + d];
          for (let s = 0; s < steps; s++) {
            vd += (k2 * (target - xd) - c2 * vd) * h;
            xd += vd * h;
          }
          x[i + d] = xd;
          v[i + d] = vd;
          off = Math.max(off, Math.abs(m.to[i + d] - xd), Math.abs(vd) * 0.02);
        }
        if (x[i + 1] < floor) { x[i + 1] = floor; v[i + 1] = Math.max(0, v[i + 1]); }
      }
      // landed once it has come to rest on its target (or a moment after, whatever it does)
      if (u >= 1 && (off < 0.0015 || u > 1 + 0.6 / m.dur)) {
        for (let k = 3 * cb.start; k < 3 * (cb.start + cb.count); k++) { x[k] = m.to[k]; v[k] = 0; }
        m.phase[c] = 2;
        m.land(c, ++m.landed);
      }
    });
    if (m.landed === this.world.cables.length) {
      this.flight = null;
      m.done();
    }
  }

  /**
   * The tidy route of every cord of `tidy` (same schedule, shorter cords),
   * sampled at the nodes of our cords: where they go to be swapped for them.
   */
  tidyShapes(tidy: Bay): Float64Array {
    const out = Float64Array.from(this.world.sim.x);
    const rest = this.world.sim.rest;
    this.world.cables.forEach((cb, c) => {
      // the connector tips are in the same ports; the rest of the cord along the route between them
      const path = tidy.tidyPaths[c];
      const arcs = [0];
      for (let k = 1; k < cb.count - 2; k++) arcs.push(arcs[k - 1] + rest[cb.start + k]);
      resample(path.slice(1, path.length - 1), arcs, out, cb.start + 1);
    });
    return out;
  }

  leds(): void {
    this.rackView?.showLeds(this.world.okPorts());
  }
}
