// The cable physics, off the main thread: the page sends the edits (pins,
// hand, rack items, straps) and asks for steps; the worker answers each
// request with the node positions and which cables are asleep.

import { CableSim, type CableInit, type SimParams, type StaticShape } from './cableSim';

export type ToWorker =
  | { type: 'init'; params: SimParams; defs: CableInit[]; x: Float64Array; v: Float64Array; pins: number[]; statics: StaticShape[] }
  | { type: 'pin'; i: number; p: [number, number, number] }
  | { type: 'unpin'; i: number }
  | { type: 'grab'; i: number }
  | { type: 'release' }
  | { type: 'statics'; statics: StaticShape[] }
  | { type: 'addBundle'; nodes: number[]; r: number }
  | { type: 'removeBundle'; id: number }
  | { type: 'teleport'; x: Float64Array }
  | { type: 'move'; start: number; pos: Float64Array }
  | { type: 'step'; k: number; target: [number, number, number]; gen: number };

export interface FromWorker {
  gen: number;
  x: Float64Array;
  asleep: Uint8Array;
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
    return;
  }
  if (!sim) return;
  switch (m.type) {
    case 'pin': sim.pin(m.i, ...m.p); break;
    case 'unpin': sim.unpin(m.i); break;
    case 'grab': sim.grab(m.i); break;
    case 'release': sim.release(); break;
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
      const out: FromWorker = { gen: m.gen, x, asleep, stats: { ...sim.stats, ms: performance.now() - t0 } };
      (self as unknown as Worker).postMessage(out, [x.buffer, asleep.buffer]);
      break;
    }
  }
};
