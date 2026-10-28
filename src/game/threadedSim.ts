// The cabinet's simulation, its stepping in a Web Worker (sim.worker.ts): the
// page keeps a mirror of it, which the game reads as if the physics ran in
// place (see `threaded`).

import { threaded } from '@drschizzo/avbd-cables';
import { RackSim } from './rackSim';

export class ThreadedSim extends threaded(RackSim, () => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })) {}
