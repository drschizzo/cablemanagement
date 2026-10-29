// Where the racks of the aisle stand: a half circle around the viewer.

import { rng } from '../lib/random';

/** where a closet stands on the floor (m), and which way it faces (rad) */
export interface Place { x: number; z: number; yaw: number }

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
export function aisleLayout(bayCount: number, seed: number): Place[] {
  if (bayCount === 1) return [{ x: 0, z: 0, yaw: 0 }];
  const random = rng(seed ^ 0x5bd1e995);
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  // a few racks close the half circle, many open it wider
  const step = SWEEP / Math.max(4, bayCount - 1);
  // turned towards the middle, they come closer at the front: that is where they must not overlap
  const radius = PITCH / (2 * Math.sin(step / 2)) + FRONT;
  const out: Place[] = [];
  for (let k = 0; k < bayCount; k++) {
    const angle = (k - (bayCount - 1) / 2) * step;
    // pushed back only: one pulled forward would run its ducts into its neighbours'
    const distance = radius + 0.015 + jitter(0.015);
    out.push({ x: Math.sin(angle) * distance, z: radius - Math.cos(angle) * distance, yaw: -angle + jitter(0.025) });
  }
  return out;
}
