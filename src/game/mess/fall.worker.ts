// The mess of one bay of the title screen, drawn and let fall off the main
// thread: drawing its tangle took the page a tenth of a second a bay, while an
// aisle was being made ready behind the one on screen, and the image stalled.
// The page builds its own World from the tangle sent back (without drawing it
// again), and puts its nodes where they came to rest.

import { World } from '../world';
import { SHOWCASE_SETTLE, showcaseRack } from '../levels/showcaseRack';
import type { CableStart } from '../cables';

export interface FallRequest { seed: number; pairs?: number; chunks: number }
export type FallReply = { type: 'chunk' } | { type: 'done'; starts: CableStart[]; x: Float64Array };

self.onmessage = (e: MessageEvent<FallRequest>) => {
  const { seed, pairs, chunks } = e.data;
  const w = new World(showcaseRack('mess', seed, pairs));
  Object.assign(w.sim.P, SHOWCASE_SETTLE.solver);
  // as Closet.settle() does it on the page: in chunks of frames, one after the other
  for (let c = 0; c < chunks; c++) {
    for (let f = 0; f < Math.ceil(SHOWCASE_SETTLE.frames / chunks); f++) w.sim.step();
    self.postMessage({ type: 'chunk' } satisfies FallReply);
  }
  const x = Float64Array.from(w.sim.x);
  self.postMessage({ type: 'done', starts: w.starts, x } satisfies FallReply, { transfer: [x.buffer] });
};
