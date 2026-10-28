// The cabinet's physics, off the main thread (see threadedSim.ts).

import { hostSimWorker } from 'avbd-cables';
import { RackSim } from './rackSim';

hostSimWorker((params) => new RackSim(params));
