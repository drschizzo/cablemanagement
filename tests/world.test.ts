// The rules of a cabinet: plugging, the maintenance window, the score.
import { describe, it, expect, beforeEach } from 'vitest';
import { HOLD, World } from '../src/game/world';
import { LEVELS, type LevelDef } from '../src/game/levels';

// level 1, every cord on its planned ports: four copper cords, at most one production link cut
const L1: LevelDef = { ...LEVELS[0], wrong: 0, loose: 0 };

describe('a cabinet at the start', () => {
  const w = new World(L1);

  it('one cord per line of the schedule, each on its two planned ports', () => {
    expect(w.circuits).toHaveLength(L1.cables);
    expect(w.cables).toHaveLength(L1.cables);
    const ev = w.evaluate();
    expect(ev.connected).toBe(ev.total);
    ev.circuits.forEach((s, i) => expect(s.cable).toBe(i));
    expect(w.okPorts(ev)).toEqual(new Set(w.circuits.flatMap((c) => [c.a, c.b])));
  });

  it('what works at the start is in production', () => {
    expect(w.live.size).toBe(L1.cables);
    expect(w.liveDown()).toBe(0);
  });

  it('nothing tidy yet: one star, with every line connected', () => {
    const ev = w.evaluate();
    expect(ev.routed).toBeLessThan(ev.total);
    expect(ev.stars).toBe(1);
  });
});

describe('plugging and the maintenance window', () => {
  let w: World;
  beforeEach(() => { w = new World(L1); });

  it('unplugging a cord cuts its line and frees its port', () => {
    const port = w.cables[0].ends[0].port!;
    w.unplug(0, 0);
    expect(w.rack.port(port).plug).toBe(-1);
    expect(w.circuitUp(0)).toBe(false);
    expect(w.liveDown()).toBe(1);
    expect(w.evaluate().stars).toBe(0);
  });

  it('no more production links cut at once than the window allows', () => {
    expect(w.canUnplug(1)).toBe(true);
    w.unplug(0, 0);
    expect(w.canUnplug(1)).toBe(false); // a second cut: over the limit of 1
    expect(w.canUnplug(0)).toBe(true); // its own line is already down
  });

  it('plugged back, the line works again', () => {
    const port = w.cables[0].ends[0].port!;
    w.unplug(0, 0);
    expect(w.plug(0, 0, port)).toBe(true);
    expect(w.circuitUp(0)).toBe(true);
    expect(w.canUnplug(1)).toBe(true);
  });

  it('a port takes one connector', () => {
    const taken = w.cables[1].ends[0].port!;
    w.unplug(0, 0);
    expect(w.plug(0, 0, taken)).toBe(false);
    expect(w.cables[0].ends[0].port).toBeNull();
  });

  it('a cord of the wrong type does not make a line', () => {
    const lv: LevelDef = { ...L1, maxCuts: undefined };
    const v = new World(lv);
    v.cables[0].type = 'OS2';
    expect(v.circuitUp(0)).toBe(false);
    expect(v.evaluate().circuits[0].connected).toBe(false);
  });
});

describe('labels, straps and cord lengths', () => {
  it('a line is labelled when both ends carry its service colour', () => {
    const w = new World({ ...L1, labels: true });
    const svc = w.circuits[0].service;
    w.cables[0].ends[0].label = svc;
    expect(w.evaluate().circuits[0].labelled).toBe(false);
    w.cables[0].ends[1].label = svc;
    expect(w.evaluate().circuits[0].labelled).toBe(true);
  });

  it('a strap needs two cords within reach, and goes back to the stock', () => {
    const w = new World(L1);
    const before = w.inventory.velcro;
    expect(w.addStrap(5, 5, 5)).toBeNull(); // nothing there
    const [a] = w.endNodes(0, 0);
    const i = a + 4, x = w.sim.x;
    // bring a node of cord 1 next to one of cord 0
    const j = w.cables[1].start + 4;
    w.sim.moveNodes(j, [x[3 * i] + 0.002, x[3 * i + 1], x[3 * i + 2]]);
    const s = w.addStrap(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.01)!;
    expect(s).not.toBeNull();
    expect(w.inventory.velcro).toBe(before - 1);
    w.removeStrap(s);
    expect(w.inventory.velcro).toBe(before);
  });

  it('a cord too short to join its ends is refused; a longer one keeps its ports', () => {
    const w = new World(L1);
    const ports = w.cables[0].ends.map((e) => e.port);
    expect(w.setCableLength(0, 0.05)).toBe(false);
    expect(w.cablesVersion).toBe(0);
    const L = w.cableLength(0) + 0.5;
    expect(w.setCableLength(0, L)).toBe(true);
    expect(w.cablesVersion).toBe(1);
    expect(w.cableLength(0)).toBeCloseTo(L, 1);
    expect(w.cables[0].ends.map((e) => e.port)).toEqual(ports);
    expect(w.circuitUp(0)).toBe(true);
  });

  it('a cord dropped in the crate is unplugged, and a new one arrives there', () => {
    const w = new World({ ...L1, maxCuts: undefined });
    w.depositCable(2);
    expect(w.cables[2].ends.every((e) => e.port === null)).toBe(true);
    const c = w.addCable('CU', 1);
    expect(c).toBe(L1.cables);
    // laid on a coil of random radius: its rest lengths are the chords of the arcs, a little shorter
    expect(Math.abs(w.cableLength(c) - 1)).toBeLessThan(0.01);
    expect(w.cables[c].ends.every((e) => e.port === null)).toBe(true);
  });
});

describe('what the player sees while tidying', () => {
  it('a cord hanging free shows its long stretches, and is not routed', () => {
    const w = new World(L1);
    w.preroll(30);
    const ev = w.evaluate();
    const c = ev.cableRouted.findIndex((r) => !r);
    expect(c).toBeGreaterThanOrEqual(0);
    const hold = w.holdMap(c);
    expect(hold[0]).toBe(HOLD.HELD); // next to its plugged connector
    expect([...hold].some((h) => h === HOLD.HANGING || h === HOLD.LOW)).toBe(true);
  });

  it('undo puts back the nodes, the plugs and the labels', () => {
    const w = new World(L1);
    const port = w.cables[0].ends[0].port!;
    const s = w.snapshot();
    w.unplug(0, 0);
    w.cables[0].ends[1].label = 2;
    w.sim.moveNodes(w.cables[0].start, [0.3, 0.3, 0.3]);
    expect(w.restore(s)).toBe(true);
    expect(w.cables[0].ends[0].port).toBe(port);
    expect(w.cables[0].ends[1].label).toBeNull();
    expect(w.circuitUp(0)).toBe(true);
    expect(w.sim.x[3 * (w.cables[0].start + 3)]).toBeCloseTo(s.x[3 * (w.cables[0].start + 3)]);
  });

  it('undo gives up once the cords have been rebuilt', () => {
    const w = new World(L1);
    const s = w.snapshot();
    w.setCableLength(0, w.cableLength(0) + 0.3);
    expect(w.restore(s)).toBe(false);
  });

  it('the tidy length of a plugged cord reaches from one end to the other', () => {
    const w = new World(L1);
    const L = w.tidyLength(0)!;
    expect(L).toBeGreaterThan(w.minCableLength(0));
    expect(L).toBeLessThan(w.cableLength(0) + 0.5);
    w.unplug(0, 1);
    expect(w.tidyLength(0)).toBeNull();
  });

  it('a strap round two cords is not a bundle', () => {
    const w = new World({ ...L1, bundles: 1 });
    const [a] = w.endNodes(0, 0);
    const i = a + 4, x = w.sim.x;
    w.sim.moveNodes(w.cables[1].start + 4, [x[3 * i] + 0.002, x[3 * i + 1], x[3 * i + 2]]);
    expect(w.addStrap(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.01)).not.toBeNull();
    const ev = w.evaluate();
    expect(ev.bundles).toBe(0);
    expect(ev.bundlesNeeded).toBe(1);
  });
});
