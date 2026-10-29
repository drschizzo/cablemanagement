// The cabinet's physics, off the main thread (see threadedSim.ts).

import { hostSimWorker } from '@drschizzo/avbd-cables';
import { RackCableSim } from './rackCableSim';

hostSimWorker((params) => new RackCableSim(params));
