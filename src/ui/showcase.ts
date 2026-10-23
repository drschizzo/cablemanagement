// Before / after: one packed wiring closet. Before, 100 long patch cords
// spill out of an open rack down to the floor; after, each one has been
// replaced by a short cord on its tidy route, labelled and strapped.
//
// The two states are two worlds sharing the same rack and patching schedule:
// the mess (long cords, nothing managed) and the tidy cabinet (short cords,
// managers and ducts). The mess is settled once, in its worker, then frozen;
// the switch from one to the other is a choreography: each cord flies from
// its shape in one world to its shape in the other, shrinking on the way.

import * as THREE from 'three';
import type { Stage } from '../render/stage';
import { RackView, buildRoom } from '../render/rackView';
import { CableView } from '../render/cableView';
import { World, type Evaluation } from '../game/world';
import { showcaseRack, type FibreType } from '../game/levels';
import { sfx } from '../audio/sfx';

interface Flight {
  from: Float64Array;
  to: Float64Array;
  t: number;
  starts: number[];
  dur: number;
  lift: number;
  end: number;
  landed: Set<number>;
  land: (c: number, k: number) => void;
  done: () => void;
}

class Bay {
  world: World;
  rackView: RackView;
  cableView: CableView;
  group = new THREE.Group();
  flight: Flight | null = null;

  constructor(stage: Stage, state: 'mess' | 'tidy') {
    this.world = new World(showcaseRack(state));
    const types = new Map<number, FibreType>();
    this.world.circuits.forEach((c) => types.set(this.world.rack.port(c.a).unit, c.type));
    this.rackView = new RackView(this.world.rack, types, { roomFloor: false });
    this.cableView = new CableView(this.world);
    this.group.add(this.rackView.group, this.cableView.group);
    stage.scene.add(this.group);
    this.rackView.syncItems(this.world.itemsVersion);
    this.cableView.update(true);
    this.leds();
  }

  dispose(stage: Stage): void {
    this.world.dispose();
    stage.scene.remove(this.group);
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }

  /** the cords only: the rack itself is drawn by one of the two bays */
  set cordsVisible(v: boolean) {
    this.cableView.group.visible = v;
  }

  tick(dt: number): void {
    if (this.flight) this.stepFlight(dt);
    else if (!this.world.sim.hold) this.world.sim.advance(dt >= 1 / 90 ? 1 : 0);
    this.cableView.update(!!this.flight);
    this.rackView.syncItems(this.world.itemsVersion);
  }

  fly(from: Float64Array, to: Float64Array, order: number[], o: { stagger: number; dur: number; lift: number; land: (c: number, k: number) => void; done: () => void }): void {
    const starts = new Array(this.world.cables.length).fill(0);
    order.forEach((c, k) => { starts[c] = k * o.stagger; });
    this.world.sim.hold = true;
    this.world.sim.x.set(from);
    this.flight = {
      from, to, t: 0, starts, dur: o.dur, lift: o.lift,
      end: (order.length - 1) * o.stagger + o.dur, landed: new Set(), land: o.land, done: o.done,
    };
  }

  private stepFlight(dt: number): void {
    const m = this.flight!;
    m.t += dt;
    const sim = this.world.sim;
    const x = sim.x;
    this.world.cables.forEach((cb, c) => {
      const u = Math.min(1, Math.max(0, (m.t - m.starts[c]) / m.dur));
      if (u <= 0) return;
      if (u >= 1 && !m.landed.has(c)) { m.landed.add(c); m.land(c, m.landed.size); }
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const arc = Math.sin(Math.PI * u) * m.lift;
      for (let k = 0; k < cb.count; k++) {
        const i = cb.start + k;
        if (sim.pinned[i]) continue;
        const along = Math.sin((Math.PI * k) / (cb.count - 1));
        for (let d = 0; d < 3; d++) x[3 * i + d] = m.from[3 * i + d] + (m.to[3 * i + d] - m.from[3 * i + d]) * e;
        x[3 * i + 2] += arc * along;
      }
    });
    if (m.t >= m.end) {
      this.flight = null;
      m.done();
    }
  }

  /**
   * The shape of every cord of `other` (same schedule, other lengths), sampled
   * at this world's nodes: where each of our cords starts its flight.
   */
  shapesOf(other: World, pos: Float64Array): Float64Array {
    const out = Float64Array.from(this.world.sim.x);
    this.world.cables.forEach((cb, c) => {
      const ob = other.cables[c];
      const cum = [0];
      for (let k = 1; k < ob.count; k++) {
        const i = 3 * (ob.start + k), j = i - 3;
        cum.push(cum[k - 1] + Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2]));
      }
      const L = cum[ob.count - 1];
      let seg = 1;
      for (let k = 0; k < cb.count; k++) {
        const s = (L * k) / (cb.count - 1);
        while (seg < ob.count - 1 && cum[seg] < s) seg++;
        const t = Math.min(1, Math.max(0, (s - cum[seg - 1]) / Math.max(1e-9, cum[seg] - cum[seg - 1])));
        const a = 3 * (ob.start + seg - 1), b = a + 3, o = 3 * (cb.start + k);
        // the connectors stay in their ports
        if (this.world.sim.pinned[cb.start + k]) continue;
        for (let d = 0; d < 3; d++) out[o + d] = pos[a + d] + (pos[b + d] - pos[a + d]) * t;
      }
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
  private tidyPos!: Float64Array;
  private el: HTMLElement;
  private state: 'before' | 'after' | 'moving' = 'before';
  private timers: number[] = [];
  private disposed = false;
  private last = performance.now();
  private floor: THREE.Group;

  /** builds the closet and settles its mess (in the workers), reporting progress */
  static async create(stage: Stage, threaded: boolean, actions: { play(): void; tutorial(): void }, progress: (f: number) => void): Promise<Showcase> {
    const sc = new Showcase(stage, actions);
    sc.mess = new Bay(stage, 'mess');
    sc.tidy = new Bay(stage, 'tidy');
    if (threaded) { sc.mess.world.sim.startWorker(); sc.tidy.world.sim.startWorker(); }
    // one rack on screen: the tidy bay draws it with its managers, the mess bay only its cords
    sc.mess.rackView.group.visible = false;
    sc.tidy.cordsVisible = false;
    sc.tidy.rackView.itemsGroup.visible = false;
    const tidyDone = sc.tidy.world.sim.settle(1);
    const chunks = 8;
    for (let i = 0; i < chunks; i++) {
      await sc.mess.world.sim.settle(10);
      progress((i + 1) / chunks);
      sc.mess.cableView.update(true);
      stage.render();
    }
    await tidyDone;
    sc.messPos = Float64Array.from(sc.mess.world.sim.x);
    // the tidy closet is shown exactly on its routes: a demonstration, perfect every time
    sc.tidyPos = sc.tidy.world.tidyTargets();
    // both frozen: the mess as it fell, the tidy cords where they settled
    sc.mess.world.sim.hold = true;
    sc.tidy.world.sim.hold = true;
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
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };

  private toggle(): void {
    if (this.state === 'moving') return;
    if (this.state === 'before') this.tidyUp();
    else this.messUp();
  }

  private tidyUp(): void {
    this.state = 'moving';
    this.render(null);
    const w = this.tidy.world;
    // the managers and ducts go in, then every long cord flies to its place as a short one
    this.tidy.rackView.itemsGroup.visible = true;
    sfx.place();
    this.mess.cordsVisible = false;
    this.tidy.cordsVisible = true;
    for (const cb of w.cables) for (const e of cb.ends) e.label = null;
    const from = this.tidy.shapesOf(this.mess.world, this.messPos);
    // row after row, left to right: the closet fills up like a printed page
    const order = w.cables.map((_, c) => c).sort((p, q) => {
      const a = w.rack.port(w.circuits[p].a), b = w.rack.port(w.circuits[q].a);
      return a.unit - b.unit || a.x - b.x;
    });
    sfx.whoosh();
    this.tidy.fly(from, this.tidyPos, order, {
      stagger: 0.035, dur: 1.0, lift: 0.18,
      land: (c, k) => {
        for (const e of w.cables[c].ends) e.label = w.circuits[c].service;
        if (k % 2 === 0) sfx.land(k);
      },
      done: () => {
        w.sim.teleport(this.tidyPos);
        w.sim.hold = true;
        this.later(300, () => {
          // velcro along the ducts
          for (const side of [-1, 1]) {
            for (let y = w.rack.topY - 0.13; y > w.rack.unitBottom(17); y -= 0.09) w.addStrap(side * 0.318, y, 0.006, 0.08);
          }
          sfx.velcro();
        });
        this.later(1200, () => { this.state = 'after'; this.render(w.evaluate()); sfx.win(); });
      },
    });
  }

  private messUp(): void {
    this.state = 'moving';
    this.render(null);
    const tw = this.tidy.world;
    tw.clearStraps();
    for (const cb of tw.cables) for (const e of cb.ends) e.label = null;
    this.tidyPos = Float64Array.from(tw.sim.x);
    tw.sim.hold = true;
    const from = this.mess.shapesOf(tw, this.tidyPos);
    this.tidy.cordsVisible = false;
    this.mess.cordsVisible = true;
    sfx.whoosh();
    const order = this.mess.world.cables.map((_, c) => c).reverse();
    this.mess.fly(from, this.messPos, order, {
      stagger: 0.012, dur: 0.9, lift: 0.1,
      land: () => {},
      done: () => {
        this.mess.world.sim.x.set(this.messPos);
        this.tidy.rackView.itemsGroup.visible = false;
        sfx.remove();
        this.later(600, () => { this.state = 'before'; this.render(this.mess.world.evaluate()); });
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
