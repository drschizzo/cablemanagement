// The steps of the tutorial (ui/tutorial.ts plays them): what each frames
// of the cabinet, the tool it puts in hand, and when its task is done, read
// from the counters of the level or the state of the cabinet. Their words
// are the interface's (ui/tutorialTexts.ts).

import type { Controller, Tool } from './controller';
import { COLUMN_X, SIDE_BACK, SIDE_IN, SIDE_OUT, U, WALL_X, insideBox } from '../game/rack';

type Box = { min: [number, number, number]; max: [number, number, number] };

export type StepId = 'welcome' | 'cords' | 'grab' | 'look' | 'unplug' | 'plugBack' | 'route' | 'signOff' | 'pinch' | 'seeBends' | 'throwAway' | 'duct' | 'ductRoute' | 'otherHand' | 'velcro';

/** a step of the tutorial; its words are the interface's (ui/tutorialTexts.ts) */
export interface TutorialStep {
  id: StepId;
  /** the region of the cabinet it frames */
  spot?: (ctl: Controller) => Box | null;
  /** the tool it puts in hand */
  tool?: Tool;
  /** what it does as it opens */
  enter?: (ctl: Controller) => void;
  /** the task it asks is done: the step ticks itself off */
  done?: (ctl: Controller) => boolean;
}

const unitBox = (ctl: Controller, kind: string): Box | null => {
  const rack = ctl.world.rack;
  const k = rack.units.findIndex((u) => u.kind === kind);
  if (k < 0) return null;
  return { min: [-COLUMN_X + 0.005, rack.unitBottom(k) - 0.002, -0.004], max: [COLUMN_X - 0.005, rack.unitBottom(k) + U + 0.002, 0.075] };
};

const mgrBox = (ctl: Controller): Box | null => {
  const rack = ctl.world.rack;
  const it = rack.items.find((i) => i.kind === 'fingerManager');
  if (!it) return null;
  return { min: [-COLUMN_X + 0.005, rack.unitBottom(it.unit), -0.004], max: [COLUMN_X - 0.005, rack.unitBottom(it.unit) + U, 0.08] };
};

/** the panel and the manager under it: where a cord leaves its port and turns down into the fingers */
const portToMgrBox = (ctl: Controller): Box | null => {
  const p = unitBox(ctl, 'panel'), m = mgrBox(ctl);
  if (!p || !m) return p ?? m;
  return { min: [p.min[0], Math.min(p.min[1], m.min[1]), p.min[2]], max: [p.max[0], Math.max(p.max[1], m.max[1]), 0.09] };
};

const sideBox = (ctl: Controller): Box => {
  const rack = ctl.world.rack;
  return { min: [SIDE_IN, rack.unitBottom(rack.units.length - 2), SIDE_BACK], max: [SIDE_OUT, rack.topY - U, 0.075] };
};

/** nodes of any cord inside the holding volume of an item kind */
function held(ctl: Controller, kind: 'fingerManager' | 'duct'): number {
  const w = ctl.world;
  const ids = new Set(w.rack.items.filter((i) => i.kind === kind).map((i) => i.id));
  const boxes = w.rack.supports().filter((s) => ids.has(s.item));
  let best = 0;
  for (const cb of w.cables) {
    let n = 0;
    for (let k = 6; k < cb.count - 6; k++) {
      const i = cb.start + k;
      if (boxes.some((s) => insideBox(s, ...w.nodePosition(i)))) n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

/** the basics: enough to play the first level */
export const BASICS: TutorialStep[] = [
  {
    id: 'welcome',
    spot: (ctl) => ({ min: [-WALL_X, ctl.world.rack.floorY, -0.06], max: [WALL_X, ctl.world.rack.topY, 0.09] }),
  },
  {
    id: 'cords',
    done: (ctl) => ctl.counters.hovered >= 2,
  },
  {
    id: 'grab',
    tool: 'hand',
    done: (ctl) => ctl.counters.dragged >= 0.3,
  },
  {
    id: 'look',
    done: (ctl) => ctl.counters.orbited >= 1,
  },
  {
    id: 'unplug',
    tool: 'hand',
    enter: (ctl) => {
      const ev = ctl.world.evaluate();
      ctl.focus(ev.circuits.findIndex((s) => !s.connected));
    },
    done: (ctl) => ctl.counters.unplugged >= 1 || ctl.world.evaluate().circuits.every((s) => s.connected),
  },
  {
    id: 'plugBack',
    tool: 'hand',
    done: (ctl) => ctl.world.evaluate().circuits.every((s) => s.connected),
  },
  {
    id: 'route',
    spot: mgrBox,
    tool: 'route',
    done: (ctl) => held(ctl, 'fingerManager') >= 6,
  },
  { id: 'signOff' },
];

/**
 * The finer gestures, after the basics if the player wants them (each level's
 * brief also explains the supports it gives, the first time).
 */
export const ADVANCED: TutorialStep[] = [
  {
    id: 'pinch',
    spot: portToMgrBox,
    tool: 'hand',
    done: (ctl) => ctl.world.sim.pinches.some((p) => p.s >= 0.7 && p !== ctl.world.sim.pinchHeld),
  },
  {
    id: 'seeBends',
    tool: 'hand',
    done: (ctl) => ctl.cableView.pinchHover >= 0,
  },
  {
    id: 'throwAway',
    tool: 'hand',
    done: (ctl) => ctl.counters.deposited >= 1,
  },
  {
    id: 'duct',
    spot: sideBox,
    tool: 'supports',
    done: (ctl) => ctl.world.rack.items.some((i) => i.kind === 'duct'),
  },
  {
    id: 'ductRoute',
    tool: 'route',
    done: (ctl) => held(ctl, 'duct') >= 4,
  },
  {
    id: 'otherHand',
    spot: (ctl) => {
      const m = mgrBox(ctl), s = sideBox(ctl);
      return m ? { min: [Math.min(m.min[0], s.min[0]), Math.min(m.min[1], s.min[1]), Math.min(m.min[2], s.min[2])], max: [Math.max(m.max[0], s.max[0]), Math.max(m.max[1], s.max[1]), Math.max(m.max[2], s.max[2])] } : s;
    },
    tool: 'hand',
    done: (ctl) => ctl.counters.handedOver >= 1,
  },
  {
    id: 'velcro',
    tool: 'velcro',
    done: (ctl) => ctl.world.straps.length > 0,
  },
];
