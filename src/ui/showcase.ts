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
import { disposeTree } from '../render/dispose';
import { CableRain } from '../render/cableRain';
import { World } from '../game/world';
import { SHOWCASE_SETTLE, showcaseRack, type FibreType } from '../game/levels';
import { U } from '../game/rack';
import { resample } from '../game/tidy';
import { rng } from '../game/tangle';
import { printOf, type BakedBay } from '../game/baked';
import { fall } from '../game/fall';
import type { CableStart } from '../game/tangle';

/** waits a little, so that the page may draw (or not at all) */
type Pause = () => Promise<void>;
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
  /** the rack on screen, for the tidy bay only (the mess draws its cords in front of it) */
  rackView: RackView | null = null;
  cableView!: CableView;
  group = new THREE.Group();
  flight: Flight | null = null;
  private moved!: Uint8Array;
  /** time not yet stepped by the physics (s) */
  private acc = 0;

  private constructor(public world: World) {}

  /**
   * Builds a bay (hidden), a piece at a time, with `pause` between them; `starts`:
   * the tangle of the mess, already drawn.
   */
  static async make(stage: Stage, state: 'mess' | 'tidy', seed: number, at: Place, pairs: number | undefined, pause: Pause, starts?: CableStart[]): Promise<Bay> {
    const b = new Bay(new World(showcaseRack(state, seed, pairs), starts));
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
    this.rackView?.showLeds(this.world.okPorts());
  }
}

/** where a closet stands on the floor (m), and which way it faces (rad) */
interface Place { x: number; z: number; yaw: number }

/** distance between two neighbouring racks, at their front (m): their side ducts (0.77 m) nearly touch */
const PITCH = 0.78;
/** the front of the ducts, ahead of the rails (m) */
const FRONT = 0.08;
/** the whole arc of racks, end to end (rad): nearly a half circle */
const SWEEP = Math.PI * 0.85;

/**
 * A packed wiring room rather than a showroom line: the racks stand in a half
 * circle around the viewer, all facing in, each a little out of line (pushed
 * back or forward, turned, never quite square to its neighbours). Their messes
 * spill towards the middle and pile up on the floor there.
 */
function layout(n: number, seed: number): Place[] {
  if (n === 1) return [{ x: 0, z: 0, yaw: 0 }];
  const r = rng(seed ^ 0x5bd1e995);
  const jitter = (a: number) => (r() * 2 - 1) * a;
  // a few racks close the half circle, many open it wider
  const step = SWEEP / Math.max(4, n - 1);
  // turned towards the middle, they come closer at the front: that is where they must not overlap
  const radius = PITCH / (2 * Math.sin(step / 2)) + FRONT;
  const out: Place[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k - (n - 1) / 2) * step;
    // pushed back only: one pulled forward would run its ducts into its neighbours'
    const rr = radius + 0.015 + jitter(0.015);
    out.push({ x: Math.sin(a) * rr, z: radius - Math.cos(a) * rr, yaw: -a + jitter(0.025) });
  }
  return out;
}

/** where a closet is drawn out of sight once, before it shows (see Showcase.warm) */
const warmTarget = new THREE.WebGLRenderTarget(1, 1);

/** delay between two racks of the aisle, when they are tidied up or messed up (ms) */
const WAVE = 700;

/** one closet of the aisle: its mess and its tidy self, drawn on the same rack */
class Closet {
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
    tw.sim.teleport(tw.tidyTargets());
    this.tidy.cordsVisible = false;
    // nothing on screen until the mess has fallen: only its end state is shown
    this.visible = false;
  }

  set visible(v: boolean) {
    this.mess.group.visible = this.tidy.group.visible = v;
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
    this.tidyShapes = this.mess.tidyShapes(this.tidy.world);
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
        this.tidy.rackView!.itemsGroup.visible = false;
        sfx.remove();
        later(500, done);
      },
    });
  }
}

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
    const places = layout(bays, seed);
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
    const falls = threaded && !o.baked ? places.map((_, k) => fall(seed + k, pairs(k), chunks, step)) : null;
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
    const r = { floorY: this.closets[0].tidy.world.rack.floorY, topY: this.topY };
    this.floor.position.y = r.floorY;
    const n = this.closets.length;
    // the whole half circle, as close as it fits: the racks at its ends come towards the camera
    const ends = this.closets.map((c) => c.mess.group.position);
    const side = Math.max(...ends.map((p) => Math.abs(p.x)));
    const near = Math.max(...ends.map((p) => p.z));
    this.stage.view = this.view;
    this.stage.frame((r.topY + r.floorY) / 2 + 0.02, r.topY - r.floorY + 0.1, side + (n > 1 ? 0.15 : 0.6), n > 1 ? 0 : 0.03, side + 0.6, near);
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
