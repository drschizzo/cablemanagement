// A CableSim whose stepping can run in a Web Worker. The local instance keeps
// the topology and a mirror of the positions, so the game reads it as before;
// every edit is applied here and forwarded to the worker, in order. Rendering
// never waits for the physics: one step request is in flight at a time, and
// if the worker falls behind, time is dropped rather than queued.

import { CableSim, type CableInit, type Pinch, type StaticShape } from './cableSim';
import type { FromWorker, ToWorker } from './sim.worker';

export class ThreadedSim extends CableSim {
  private worker: Worker | null = null;
  private defs: CableInit[] = [];
  /** a regular step request is in flight (its id) */
  private inFlight = false;
  private flushId = 0;
  private lastId = 0;
  /** settle() requests waiting for their answer, by id */
  private settling = new Map<number, () => void>();
  private owed = 0;
  /** bumps whenever new positions arrived */
  version = 0;
  /** frames of physics given up because the worker was behind (read and reset by the game) */
  dropped = 0;
  /** while set, nobody steps and the worker's answers are ignored (scripted motion) */
  hold = false;
  private gen = 0;

  get threaded(): boolean {
    return this.worker !== null;
  }

  build(defs: CableInit[]): number[] {
    this.defs = defs;
    return super.build(defs);
  }

  /** moves the stepping to a worker, from the current state */
  startWorker(): void {
    if (this.worker || typeof Worker === 'undefined') return;
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker = w;
    const pins: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.pinned[i]) pins.push(i);
    this.post({ type: 'init', params: this.P, defs: this.defs, x: this.x, v: this.v, pins, statics: this.statics, pinches: this.pinches });
    for (const b of this.bundles) if (b.alive) this.post({ type: 'addBundle', nodes: b.nodes, r: b.r });
    w.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    w.onerror = (e) => console.error('physics worker', e);
  }

  private receive(m: FromWorker): void {
    // answers computed before a teleport are stale
    const fresh = m.gen === this.gen;
    // the worker sends the pinches once, when they change: kept even from a stale answer
    if (m.pinches) this.adoptPinches(m.pinches, m.held ?? -1);
    const settled = this.settling.get(m.id);
    if (settled) {
      this.settling.delete(m.id);
      if (fresh) this.apply(m);
      settled();
      return;
    }
    if (m.id === this.flushId) this.inFlight = false;
    // during scripted motion, nobody steps: the answer is ignored too
    if (fresh && !this.hold) this.apply(m);
    this.flush();
  }

  /** the worker's pinches, as they are (nothing to wake or forward) */
  private adoptPinches(list: Pinch[], held: number): void {
    this.pinches = list;
    this.pinchHeld = held >= 0 ? list[held] : null;
    this.pinchOf.fill(-1);
    list.forEach((p, k) => { for (let i = p.a; i < p.a + p.n; i++) this.pinchOf[i] = k; });
  }

  private apply(m: FromWorker): void {
    this.x.set(m.x);
    m.asleep.forEach((a, c) => { this.cables[c].asleep = a === 1; });
    this.stats = m.stats;
    this.version++;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    // nobody will answer them any more (and nothing must run on a disposed sim)
    this.settling.clear();
  }

  /** runs `frames` frames at once (in the worker when there is one) and resolves when done */
  settle(frames: number): Promise<void> {
    if (!this.worker) {
      for (let i = 0; i < frames; i++) this.step();
      return Promise.resolve();
    }
    // its own request: a regular step still in flight is answered first, and on its own
    return new Promise((done) => {
      const id = ++this.lastId;
      this.settling.set(id, done);
      this.post({ type: 'step', id, k: frames, target: [this.grabTarget[0], this.grabTarget[1], this.grabTarget[2]], gen: this.gen });
    });
  }

  /** runs k frames of physics: here, or in the worker without waiting */
  advance(k: number): void {
    if (this.hold) return;
    if (!this.worker) {
      for (let i = 0; i < k; i++) this.step();
      return;
    }
    this.dropped += Math.max(0, this.owed + k - 2);
    this.owed = Math.min(2, this.owed + k);
    this.flush();
  }

  private flush(): void {
    if (!this.worker || this.inFlight || this.owed <= 0) return;
    this.inFlight = true;
    const k = this.owed;
    this.owed = 0;
    this.flushId = ++this.lastId;
    this.post({ type: 'step', id: this.flushId, k, target: [this.grabTarget[0], this.grabTarget[1], this.grabTarget[2]], gen: this.gen });
  }

  private post(m: ToWorker): void {
    this.worker?.postMessage(m);
  }

  // ------------------------------------------------ edits, mirrored

  teleport(pos: ArrayLike<number>): void {
    super.teleport(pos);
    this.gen++;
    this.post({ type: 'teleport', x: Float64Array.from(this.x) });
  }

  moveNodes(start: number, pos: ArrayLike<number>): void {
    super.moveNodes(start, pos);
    // positions computed before the move would put the cord back
    this.gen++;
    this.post({ type: 'move', start, pos: Float64Array.from(pos) });
  }

  pin(i: number, x: number, y: number, z: number): void {
    super.pin(i, x, y, z);
    this.post({ type: 'pin', i, p: [x, y, z] });
  }

  unpin(i: number): void {
    super.unpin(i);
    this.post({ type: 'unpin', i });
  }

  grab(i: number): void {
    super.grab(i);
    this.post({ type: 'grab', i });
  }

  release(): void {
    super.release();
    this.post({ type: 'release' });
  }

  holdStill(i: number, x: number, y: number, z: number): void {
    super.holdStill(i, x, y, z);
    this.post({ type: 'holdStill', i, p: [x, y, z] });
  }

  letGoStill(): void {
    super.letGoStill();
    this.post({ type: 'letGoStill' });
  }

  pinch(on: boolean): void {
    super.pinch(on);
    this.post({ type: 'pinch', on });
  }

  firmPinch(s: number): void {
    super.firmPinch(s);
    this.post({ type: 'firmPinch', s });
  }

  unpinch(i: number): boolean {
    const done = super.unpinch(i);
    this.post({ type: 'unpinch', i });
    return done;
  }

  loadPinches(list: Pinch[]): void {
    super.loadPinches(list);
    this.post({ type: 'pinches', list: this.pinches });
  }

  setGoals(start: number, pos: ArrayLike<number>, w: ArrayLike<number>): void {
    super.setGoals(start, pos, w);
    this.post({ type: 'goals', start, pos: Float64Array.from(pos), w: Float64Array.from(w) });
  }

  setStatics(shapes: StaticShape[]): void {
    super.setStatics(shapes);
    this.post({ type: 'statics', statics: shapes });
  }

  addBundle(nodes: number[], r: number): number {
    const id = super.addBundle(nodes, r);
    // the worker filters the nodes the same way, so ids stay in step
    this.post({ type: 'addBundle', nodes, r });
    return id;
  }

  removeBundle(id: number): void {
    super.removeBundle(id);
    this.post({ type: 'removeBundle', id });
  }
}
