// A simulation whose stepping runs in a Web Worker. The page keeps a full
// copy: the topology, and a mirror of the positions, so that it reads `x` as
// if the physics ran in place. Every change (the methods a class lists in
// `mirrored`) is applied in the page and repeated in the worker, in the same
// order. Rendering never waits for the physics: one step request is in flight
// at a time, and if the worker falls behind, time is dropped rather than
// queued.
//
//   class MySim extends threaded(CableSim, () => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })) {}
//
// and in sim.worker.ts:
//
//   hostSimWorker((params) => new CableSim(params));

import { CableSim, type Pinch, type SimParams, type SimSnapshot } from './cableSim';

/** from the page to the worker */
export type ToWorker =
  | { type: 'init'; snapshot: SimSnapshot }
  | { type: 'call'; name: string; args: unknown[] }
  | { type: 'step'; id: number; k: number; input: unknown; gen: number };

/** the answer to one step request (same `id`) */
export interface FromWorker {
  id: number;
  gen: number;
  x: Float64Array;
  asleep: Uint8Array;
  /** the pinches, when they changed since the last answer, and which one is being made (−1: none) */
  pinches?: Pinch[];
  held?: number;
  stats: { contacts: number; awake: number; ms: number };
}

type SimClass = new (...args: any[]) => CableSim;

/**
 * `Base`, its stepping moved to the worker `spawn` starts (`startWorker`).
 * Until then, and where workers do not exist (Node), it steps in place.
 */
export function threaded<B extends SimClass>(Base: B, spawn: () => Worker) {
  return class Threaded extends Base {
    #worker: Worker | null = null;
    /** a regular step request is in flight */
    #inFlight = false;
    #flushId = 0;
    #lastId = 0;
    /** settle() requests waiting for their answer, by id */
    #settling = new Map<number, () => void>();
    #owed = 0;
    #gen = 0;
    /** depth of the mirrored calls under way: only the outermost goes to the worker (it makes the others there) */
    #depth = 0;
    /** bumps whenever new positions arrived */
    version = 0;
    /** frames of physics given up because the worker was behind (read and reset by the caller) */
    dropped = 0;
    /** while set, nobody steps and the worker's answers are ignored (scripted motion) */
    hold = false;

    constructor(...args: any[]) {
      super(...args);
      const cls = this.constructor as unknown as { mirrored: readonly string[]; restarts: readonly string[] };
      const restarts = new Set(cls.restarts);
      const methods = this as unknown as Record<string, (...a: unknown[]) => unknown>;
      for (const name of cls.mirrored) {
        const f = methods[name];
        methods[name] = (...a: unknown[]) => {
          this.#depth++;
          let r: unknown;
          try { r = f.apply(this, a); } finally { this.#depth--; }
          if (this.#depth === 0) {
            // positions computed before a teleport are out of date
            if (restarts.has(name)) this.#gen++;
            this.#post({ type: 'call', name, args: a });
          }
          return r;
        };
      }
    }

    get threaded(): boolean {
      return this.#worker !== null;
    }

    /**
     * Moves the stepping to a worker, from the current state (`snapshot`):
     * positions, velocities, pins, targets, pinches, straps. Not the
     * multipliers of the constraints and contacts, nor which cables sleep:
     * the worker rebuilds them, so a simulation moved while things are
     * moving goes on a little differently than it would have in place.
     */
    startWorker(): void {
      if (this.#worker || typeof Worker === 'undefined') return;
      const w = spawn();
      this.#worker = w;
      this.#post({ type: 'init', snapshot: this.snapshot() });
      w.onmessage = (e: MessageEvent<FromWorker>) => this.#receive(e.data);
      w.onerror = (e) => console.error('physics worker', e);
    }

    #receive(m: FromWorker): void {
      // answers computed before a teleport are stale
      const fresh = m.gen === this.#gen;
      // the worker sends the pinches once, when they change: kept even from a stale answer
      if (m.pinches) this.adoptPinches(m.pinches, m.held ?? -1);
      const settled = this.#settling.get(m.id);
      if (settled) {
        this.#settling.delete(m.id);
        if (fresh) this.#apply(m);
        settled();
        return;
      }
      if (m.id === this.#flushId) this.#inFlight = false;
      // during scripted motion, nobody steps: the answer is ignored too
      if (fresh && !this.hold) this.#apply(m);
      this.#flush();
    }

    #apply(m: FromWorker): void {
      this.x.set(m.x);
      m.asleep.forEach((a, c) => { this.cables[c].asleep = a === 1; });
      this.stats = m.stats;
      this.version++;
    }

    dispose(): void {
      this.#worker?.terminate();
      this.#worker = null;
      // nobody will answer them any more (and nothing must run on a disposed sim)
      this.#settling.clear();
    }

    /** runs `frames` frames at once (in the worker when there is one) and resolves when done */
    settle(frames: number): Promise<void> {
      if (!this.#worker) {
        for (let i = 0; i < frames; i++) this.step();
        return Promise.resolve();
      }
      // its own request: a regular step still in flight is answered first, and on its own
      return new Promise((done) => {
        const id = ++this.#lastId;
        this.#settling.set(id, done);
        this.#post({ type: 'step', id, k: frames, input: this.stepInput(), gen: this.#gen });
      });
    }

    /** runs k frames of physics: here, or in the worker without waiting */
    advance(k: number): void {
      if (this.hold) return;
      if (!this.#worker) {
        for (let i = 0; i < k; i++) this.step();
        return;
      }
      this.dropped += Math.max(0, this.#owed + k - 2);
      this.#owed = Math.min(2, this.#owed + k);
      this.#flush();
    }

    #flush(): void {
      if (!this.#worker || this.#inFlight || this.#owed <= 0) return;
      this.#inFlight = true;
      const k = this.#owed;
      this.#owed = 0;
      this.#flushId = ++this.#lastId;
      this.#post({ type: 'step', id: this.#flushId, k, input: this.stepInput(), gen: this.#gen });
    }

    #post(m: ToWorker): void {
      this.#worker?.postMessage(m);
    }
  };
}

/**
 * The worker's side: makes the simulation from the page's snapshot, repeats
 * its changes, and answers each step request with the node positions, which
 * cables are asleep and, when they changed, the pinches.
 */
export function hostSimWorker(make: (params: SimParams) => CableSim): void {
  let sim: CableSim | null = null;
  self.onmessage = (e: MessageEvent<ToWorker>) => {
    const m = e.data;
    if (m.type === 'init') {
      sim = make(m.snapshot.params);
      sim.restore(m.snapshot);
      return;
    }
    if (!sim) return;
    if (m.type === 'call') {
      (sim as unknown as Record<string, (...a: unknown[]) => unknown>)[m.name](...m.args);
      return;
    }
    const t0 = performance.now();
    for (let k = 0; k < m.k; k++) {
      sim.setStepInput(m.input);
      sim.step();
    }
    const x = sim.x.slice();
    const asleep = Uint8Array.from(sim.cables, (c) => (c.asleep ? 1 : 0));
    const out: FromWorker = { id: m.id, gen: m.gen, x, asleep, stats: { ...sim.stats, ms: performance.now() - t0 } };
    if (sim.takePinchChange()) { out.pinches = sim.pinches; out.held = sim.pinchHeld ? sim.pinches.indexOf(sim.pinchHeld) : -1; }
    (self as unknown as Worker).postMessage(out, [x.buffer, asleep.buffer]);
  };
}
