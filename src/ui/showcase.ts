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
import { RackView, buildRoom } from '../render/rackView';
import { CableView } from '../render/cableView';
import { World, type Evaluation } from '../game/world';
import { SHOWCASE_SETTLE, showcaseRack, type FibreType } from '../game/levels';
import { U } from '../game/rack';
import { resample } from '../game/tidy';
import { sfx } from '../audio/sfx';

interface FlightOpts {
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

class Bay {
  world: World;
  rackView: RackView;
  cableView: CableView;
  group = new THREE.Group();
  flight: Flight | null = null;
  private moved: Uint8Array;

  constructor(stage: Stage, state: 'mess' | 'tidy', seed: number) {
    this.world = new World(showcaseRack(state, seed));
    const types = new Map<number, FibreType>();
    this.world.circuits.forEach((c) => types.set(this.world.rack.port(c.a).unit, c.type));
    this.rackView = new RackView(this.world.rack, types, { roomFloor: false });
    this.cableView = new CableView(this.world);
    this.group.add(this.rackView.group, this.cableView.group);
    stage.scene.add(this.group);
    this.rackView.syncItems(this.world.itemsVersion);
    this.cableView.update(true);
    this.moved = new Uint8Array(this.world.cables.length);
    this.leds();
  }

  dispose(stage: Stage): void {
    this.world.dispose();
    stage.scene.remove(this.group);
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
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
      this.world.sim.advance(dt >= 1 / 90 ? 1 : 0);
      this.cableView.update();
    }
    this.rackView.syncItems(this.world.itemsVersion);
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
  tidyShapes(tidy: World): Float64Array {
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
    const ev = this.world.evaluate();
    const ok = new Set<string>();
    ev.circuits.forEach((s, i) => { if (s.connected) { ok.add(this.world.circuits[i].a); ok.add(this.world.circuits[i].b); } });
    for (const p of this.world.rack.ports) this.rackView.setLed(p, p.plug < 0 ? 'off' : ok.has(p.id) ? 'ok' : 'wrong');
  }
}

export class Showcase {
  private mess!: Bay;
  private tidy!: Bay;
  private messPos!: Float64Array;
  /** the cords of the mess laid along the tidy routes */
  private tidyShapes!: Float64Array;
  private el: HTMLElement;
  private state: 'before' | 'after' | 'moving' = 'before';
  private timers: number[] = [];
  private disposed = false;
  private last = performance.now();
  private floor: THREE.Group;

  /** builds a closet at random and lets its mess fall (in the worker), reporting progress */
  static async create(stage: Stage, threaded: boolean, actions: { play(): void; tutorial(): void }, progress: (f: number) => void, seed = Math.floor(Math.random() * 1e9)): Promise<Showcase> {
    const sc = new Showcase(stage, actions);
    sc.mess = new Bay(stage, 'mess', seed);
    sc.tidy = new Bay(stage, 'tidy', seed);
    // the mess only falls once: a cheap solver will do
    Object.assign(sc.mess.world.sim.P, SHOWCASE_SETTLE.solver);
    if (threaded) sc.mess.world.sim.startWorker();
    // one rack on screen: the tidy bay draws it with its managers, the mess bay only its cords
    sc.mess.rackView.group.visible = false;
    sc.tidy.rackView.itemsGroup.visible = false;
    // the tidy closet is shown exactly on its routes: a demonstration, perfect every time
    const tw = sc.tidy.world;
    tw.sim.hold = true;
    tw.sim.teleport(tw.tidyTargets());
    sc.tidy.cordsVisible = false;
    const chunks = 5;
    for (let i = 0; i < chunks; i++) {
      await sc.mess.world.sim.settle(Math.ceil(SHOWCASE_SETTLE.frames / chunks));
      progress((i + 1) / chunks);
      sc.mess.cableView.update(true);
      stage.render();
    }
    // frozen as it fell
    sc.mess.world.sim.hold = true;
    sc.messPos = Float64Array.from(sc.mess.world.sim.x);
    sc.tidyShapes = sc.mess.tidyShapes(tw);
    sc.mess.cableView.update(true);
    sc.start();
    return sc;
  }

  private constructor(private stage: Stage, private actions: { play(): void; tutorial(): void }) {
    this.el = document.getElementById('showcase')!;
    this.floor = buildRoom(0);
    stage.scene.add(this.floor);
  }

  private start(): void {
    const r = this.tidy.world.rack;
    this.floor.position.y = r.floorY;
    this.stage.frame((r.topY + r.floorY) / 2 + 0.02, r.topY - r.floorY + 0.1, 0.6);
    document.body.classList.add('demo');
    document.getElementById('level-title')!.textContent = 'Avant / Après';
    this.el.classList.add('on');
    (this.el.querySelector('#sc-play') as HTMLElement).onclick = () => this.actions.play();
    (this.el.querySelector('#sc-tuto') as HTMLElement).onclick = () => this.actions.tutorial();
    (this.el.querySelector('#sc-toggle') as HTMLElement).onclick = () => this.toggle();
    this.stage.sway(true);
    this.render(this.mess.world.evaluate());
    requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.mess?.dispose(this.stage);
    this.tidy?.dispose(this.stage);
    this.stage.scene.remove(this.floor);
    this.floor.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.el.classList.remove('on');
    document.body.classList.remove('demo');
    this.stage.sway(false);
  }

  /** advances by dt and draws (also called by the automated checks) */
  tick(dt: number): void {
    this.mess.tick(dt);
    this.tidy.tick(dt);
    this.stage.render();
  }

  private frame = (): void => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  private toggle(): void {
    if (this.state === 'moving') return;
    if (this.state === 'before') this.tidyUp();
    else this.messUp();
  }

  /** swaps one cord of a bay for the same cord of the other */
  private swap(c: number, show: Bay, hide: Bay): void {
    hide.cableView.setVisible(c, false);
    show.cableView.setVisible(c, true);
  }

  private tidyUp(): void {
    this.state = 'moving';
    this.render(null);
    const w = this.tidy.world;
    // the managers and ducts go in, then every cord is pulled out of the heap and dressed into its route
    this.tidy.rackView.itemsGroup.visible = true;
    sfx.place();
    for (const cb of w.cables) for (const e of cb.ends) e.label = null;
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
        for (const e of w.cables[c].ends) e.label = w.circuits[c].service;
        if (k % 2 === 0) sfx.land(k);
      },
      done: () => {
        this.later(250, () => {
          // velcro all along the ducts
          const ducts = w.rack.items.filter((it) => it.kind === 'duct' && it.side === 1);
          const top = w.rack.topY - Math.min(...ducts.map((d) => d.unit)) * U;
          const bottom = w.rack.topY - Math.max(...ducts.map((d) => d.unit + d.span)) * U;
          for (const side of [-1, 1]) {
            for (let y = top - 0.04; y > bottom + 0.02; y -= 0.09) w.addStrap(side * 0.318, y, 0.006, 0.08);
          }
          sfx.velcro();
        });
        this.later(1100, () => { this.state = 'after'; this.render(w.evaluate()); sfx.win(); });
      },
    });
  }

  private messUp(): void {
    this.state = 'moving';
    this.render(null);
    const tw = this.tidy.world;
    tw.clearStraps();
    for (const cb of tw.cables) for (const e of cb.ends) e.label = null;
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
        this.tidy.rackView.itemsGroup.visible = false;
        sfx.remove();
        this.later(500, () => { this.state = 'before'; this.render(this.mess.world.evaluate()); });
      },
    });
  }

  private later(ms: number, f: () => void): void {
    this.timers.push(window.setTimeout(() => { if (!this.disposed) f(); }, ms));
  }

  private render(ev: Evaluation | null): void {
    const title = this.el.querySelector('#sc-title') as HTMLElement;
    const stats = this.el.querySelector('#sc-stats') as HTMLElement;
    const btn = this.el.querySelector('#sc-toggle') as HTMLButtonElement;
    title.className = this.state;
    title.textContent = this.state === 'before' ? 'AVANT' : this.state === 'after' ? 'APRÈS' : '…';
    btn.disabled = this.state === 'moving';
    btn.textContent = this.state === 'after' ? '↺ Remettre le désordre' : '✨ Ranger la baie';
    stats.style.visibility = ev ? 'visible' : 'hidden';
    if (!ev) return;
    const n = ev.total;
    stats.innerHTML = `<span><b>${n}</b> cordons</span><span>Rangés <b>${ev.routed}/${n}</b></span><span>Façade dégagée <b>${ev.clear}/${n}</b></span><span>Étiquetés <b>${ev.labelled}/${n}</b></span><span class="st">${'★'.repeat(ev.stars)}${'☆'.repeat(3 - ev.stars)}</span>`;
  }
}
