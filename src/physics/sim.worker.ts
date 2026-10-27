// The cable physics, off the main thread: the page sends the edits (pins,
// hands, rack items, straps) and asks for steps; the worker answers each
// request with the node positions, which cables are asleep and, when they
// changed, the pinches.

import { CableSim, type CableInit, type Pinch, type SimParams, type StaticShape } from './cableSim';

export type ToWorker =
  | {
    type: 'init'; params: SimParams; defs: CableInit[]; x: Float64Array; v: Float64Array; pins: number[]; statics: StaticShape[]; pinches: Pinch[];
    /** what the points alone do not tell: the rest lengths, and what the keepers know of the cords */
    rest: Float64Array; handled: Uint8Array; lastHand: Int32Array; keepOf: Int32Array;
  }
  | { type: 'pin'; i: number; p: [number, number, number] }
  | { type: 'unpin'; i: number }
  | { type: 'pinEnd'; i0: number; i1: number; a: [number, number, number]; b: [number, number, number] }
  | { type: 'grab'; i: number }
  | { type: 'release' }
  | { type: 'holdStill'; i: number; p: [number, number, number] }
  | { type: 'letGoStill' }
  | { type: 'pinch'; on: boolean }
  | { type: 'unpinch'; i: number }
  | { type: 'firmPinch'; s: number }
  | { type: 'pinches'; list: Pinch[] }
  | { type: 'goals'; start: number; pos: Float64Array; w: Float64Array }
  | { type: 'statics'; statics: StaticShape[] }
  | { type: 'addBundle'; nodes: number[]; r: number }
  | { type: 'removeBundle'; id: number }
  | { type: 'teleport'; x: Float64Array }
  | { type: 'move'; start: number; pos: Float64Array }
  | { type: 'step'; id: number; k: number; target: [number, number, number]; gen: number };

/** the answer to one step request (same `id`) */
export interface FromWorker {
  id: number;
  gen: number;
  x: Float64Array;
  asleep: Uint8Array;
  /** the pinches, when they changed since the last answer, and which one the hand is making (−1: none) */
  pinches?: Pinch[];
  held?: number;
  stats: { contacts: number; awake: number; ms: number };
}

let sim: CableSim | null = null;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    sim = new CableSim(m.params);
    sim.build(m.defs);
    sim.x.set(m.x);
    sim.x0.set(m.x);
    sim.v.set(m.v);
    for (const i of m.pins) sim.pin(i, m.x[3 * i], m.x[3 * i + 1], m.x[3 * i + 2]);
    sim.setStatics(m.statics);
    sim.rest.set(m.rest);
    sim.handled.set(m.handled);
    sim.lastHand.set(m.lastHand);
    sim.keepOf.set(m.keepOf);
    sim.loadPinches(m.pinches);
    sim.takePinchChange();
    return;
  }
  if (!sim) return;
  switch (m.type) {
    case 'pin': sim.pin(m.i, ...m.p); break;
    case 'unpin': sim.unpin(m.i); break;
    case 'pinEnd': sim.pinEnd(m.i0, m.i1, m.a, m.b); break;
    case 'grab': sim.grab(m.i); break;
    case 'release': sim.release(); break;
    case 'holdStill': sim.holdStill(m.i, ...m.p); break;
    case 'letGoStill': sim.letGoStill(); break;
    case 'pinch': sim.pinch(m.on); break;
    case 'unpinch': sim.unpinch(m.i); break;
    case 'firmPinch': sim.firmPinch(m.s); break;
    case 'pinches': sim.loadPinches(m.list); sim.takePinchChange(); break;
    case 'goals': sim.setGoals(m.start, m.pos, m.w); break;
    case 'statics': sim.setStatics(m.statics); break;
    case 'addBundle': sim.addBundle(m.nodes, m.r); break;
    case 'removeBundle': sim.removeBundle(m.id); break;
    case 'teleport': sim.teleport(m.x); break;
    case 'move': sim.moveNodes(m.start, m.pos); break;
    case 'step': {
      const t0 = performance.now();
      for (let k = 0; k < m.k; k++) {
        sim.grabTarget[0] = m.target[0]; sim.grabTarget[1] = m.target[1]; sim.grabTarget[2] = m.target[2];
        sim.step();
      }
      const x = sim.x.slice();
      const asleep = Uint8Array.from(sim.cables, (c) => (c.asleep ? 1 : 0));
      const out: FromWorker = { id: m.id, gen: m.gen, x, asleep, stats: { ...sim.stats, ms: performance.now() - t0 } };
      if (sim.takePinchChange()) { out.pinches = sim.pinches; out.held = sim.pinchHeld ? sim.pinches.indexOf(sim.pinchHeld) : -1; }
      (self as unknown as Worker).postMessage(out, [x.buffer, asleep.buffer]);
      break;
    }
  }
};
