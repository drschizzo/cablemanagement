// Kinds of cable: what a cable is made of (its radius, the mass of a node,
// how it bends, its ends), how far apart its nodes are, and the settings of
// the solver that suit it. The settings are given for one kind at a time:
// mixing very different cables in one simulation takes those of the finest.
//
//   const k = CABLES.rope;
//   const sim = new CableSim(k.params);
//   sim.build([{ ...k.cable, points: nodesAlong(path, k.segment) }]);

import type { CableInit, SimParams } from './cableSim';

export interface CableKind {
  /** the cable's own: radius (m), mass of a node (kg), bending, ends */
  cable: Omit<CableInit, 'points'>;
  /** distance between two nodes (m) */
  segment: number;
  /** settings of the solver for it, beyond the defaults */
  params: Partial<SimParams>;
}

export const CABLES = {
  /** a network patch cord: 4.4 mm thick, 40 g/m, a connector and its boot at each end (the defaults are set for it) */
  patchCord: {
    cable: { radius: 0.0022, mass: 0.001, endMass: 0.004, bend: 1, boot: true },
    segment: 0.025,
    params: {},
  },
  /** a rope: 10 mm thick, 70 g/m, supple */
  rope: {
    cable: { radius: 0.005, mass: 0.0035, bend: 0.5 },
    segment: 0.05,
    params: { substeps: 6, margin: 0.003, marginCap: 0.02 },
  },
  /** a garden hose: 20 mm thick, 250 g/m, stiff */
  hose: {
    cable: { radius: 0.01, mass: 0.015, bend: 30 },
    segment: 0.06,
    params: { substeps: 6, margin: 0.003, marginCap: 0.02 },
  },
} satisfies Record<string, CableKind>;
