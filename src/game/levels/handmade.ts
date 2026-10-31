// The cabinets written by hand, each with its own id, words and find: the
// training, then the big cabinets.

import type { BigBayLevel, TrainingLevel } from './levelDef';
import { TRAINING } from './training';
import { BIG_BAYS } from './bigBays';

export const HANDMADE_LEVELS: readonly (TrainingLevel | BigBayLevel)[] = [...TRAINING, ...BIG_BAYS];
