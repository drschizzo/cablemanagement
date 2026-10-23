// A CableSim whose stepping can run in a Web Worker. The local instance keeps
// the topology and a mirror of the positions, so the game reads it as before;
// every edit is applied here and forwarded to the worker, in order. Rendering
// never waits for the physics: one step request is in flight at a time, and
// if the worker falls behind, time is dropped rather than queued.

import { CableSim, type CableInit, type StaticShape } from './cableSim';
import type { FromWorker, ToWorker } from './sim.worker';

export class ThreadedSim extends CableSim {
  private worker: Worker | null = null;
  private defs: CableInit[] = [];
  private inFlight = false;
  private owed = 0;
  /** bumps whenever new positions arrived */
  version = 0;
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
    this.post({ type: 'init', params: this.P, defs: this.defs, x: this.x, v: this.v, pins, statics: this.statics });
    for (const b of this.bundles) if (b.alive) this.post({ type: 'addBundle', nodes: b.nodes, r: b.r });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      this.inFlight = false;
      // answers computed before a teleport, or during scripted motion, are stale
      if (m.gen !== this.gen || this.hold) { this.flush(); return; }
      this.x.set(m.x);
      m.asleep.forEach((a, c) => { this.cables[c].asleep = a === 1; });
      this.stats = m.stats;
      this.version++;
      this.flush();
    };
    w.onerror = (e) => console.error('physics worker', e);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  /** runs `frames` frames at once (in the worker when there is one) and resolves when done */
  settle(frames: number): Promise<void> {
    if (!this.worker) {
      for (let i = 0; i < frames; i++) this.step();
      return Promise.resolve();
    }
    return new Promise((done) => {
      const w = this.worker!;
      const prev = w.onmessage;
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        w.onmessage = prev;
        this.inFlight = false;
        this.x.set(e.data.x);
        e.data.asleep.forEach((a, c) => { this.cables[c].asleep = a === 1; });
        this.stats = e.data.stats;
        this.version++;
        done();
      };
      this.inFlight = true;
      this.post({ type: 'step', k: frames, target: [this.grabTarget[0], this.grabTarget[1], this.grabTarget[2]], gen: this.gen });
    });
  }

  /** runs k frames of physics: here, or in the worker without waiting */
  advance(k: number): void {
    if (this.hold) return;
    if (!this.worker) {
      for (let i = 0; i < k; i++) this.step();
      return;
    }
    this.owed = Math.min(2, this.owed + k);
    this.flush();
  }

  private flush(): void {
    if (!this.worker || this.inFlight || this.owed <= 0) return;
    this.inFlight = true;
    const k = this.owed;
    this.owed = 0;
    this.post({ type: 'step', k, target: [this.grabTarget[0], this.grabTarget[1], this.grabTarget[2]], gen: this.gen });
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
