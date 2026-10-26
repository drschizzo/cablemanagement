// The rules of a cabinet: plugging, the maintenance window, the score.
import { describe, it, expect, beforeEach } from 'vitest';
import { HOLD, World } from '../src/game/world';
import { LEVELS, type LevelDef } from '../src/game/levels';
import { planRoute, RouteRun } from '../src/game/route';

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

  it('a pinch firms up while the hand pinches, survives a new cord from the stock, and goes with undo or Space', () => {
    const w = new World(L1);
    const s = w.snapshot();
    const g = w.cables[1].start + Math.floor(w.cables[1].count / 2);
    w.sim.grab(g);
    w.sim.grabTarget[0] += 0.12; w.sim.grabTarget[1] += 0.1;
    for (let f = 0; f < 40; f++) w.sim.step();
    w.sim.pinch(true);
    w.sim.step();
    const soft = w.sim.pinches[0].s;
    w.sim.firmPinch(0.8);
    for (let f = 0; f < 30; f++) w.sim.step();
    w.sim.pinch(false);
    w.sim.firmPinch(1); // too late: the hand no longer pinches
    w.sim.release();
    expect(w.sim.pinches).toHaveLength(1);
    expect(w.sim.pinches[0].s).toBeGreaterThan(soft);
    expect(w.sim.pinches[0].s).toBeCloseTo(0.8);
    expect(w.sim.pinchOf[g]).toBe(0);
    // a new cord rebuilds the physics: the pinch stays on the same stretch of the same cord
    const off = w.sim.pinches[0].a - w.cables[1].start;
    w.addCable('CU', 1);
    expect(w.sim.pinches[0].a - w.cables[1].start).toBe(off);
    // pinching again over it replaces it
    const g2 = w.cables[1].start + off + 2;
    w.sim.grab(g2);
    w.sim.pinch(true);
    w.sim.pinch(false);
    w.sim.release();
    expect(w.sim.pinches).toHaveLength(1);
    // Space over it lets go of it
    expect(w.sim.unpinch(g2)).toBe(true);
    expect(w.sim.pinches).toHaveLength(0);
    expect(w.sim.pinchOf[g2]).toBe(-1);
    // undo (before the new cord: in another cabinet) takes it away
    const w2 = new World(L1);
    const s2 = w2.snapshot();
    w2.sim.grab(g);
    w2.sim.pinch(true);
    w2.sim.release();
    expect(w2.sim.pinches).toHaveLength(1);
    expect(w2.restore(s2)).toBe(true);
    expect(w2.sim.pinches).toHaveLength(0);
    expect(s.pinches).toHaveLength(0);
  });

  it('the other hand holds a cord still where the hand left it, and lets go', () => {
    const w = new World(L1);
    const cb = w.cables[1];
    const g = cb.start + Math.floor(cb.count / 2);
    w.sim.grab(g);
    w.sim.grabTarget[0] += 0.1; w.sim.grabTarget[1] += 0.15;
    for (let f = 0; f < 60; f++) w.sim.step();
    const at = [...w.sim.grabTarget];
    w.sim.holdStill(g, at[0], at[1], at[2]);
    w.sim.release();
    for (let f = 0; f < 90; f++) w.sim.step();
    const d = () => Math.hypot(w.sim.x[3 * g] - at[0], w.sim.x[3 * g + 1] - at[1], w.sim.x[3 * g + 2] - at[2]);
    expect(d()).toBeLessThan(0.07); // within the leash of a hand
    w.sim.letGoStill();
    for (let f = 0; f < 90; f++) w.sim.step();
    expect(w.sim.x[3 * g + 1]).toBeLessThan(at[1] - 0.05);
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

describe('a cord laid along a drawn route', () => {
  const B = { kind: 'blank' as const };
  const bench: LevelDef = {
    id: 'route', title: '', brief: '',
    units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
    cables: 2, wrong: 0, loose: 0, slack: [0.3, 0.4], mess: 1,
    labels: false, services: 1, types: ['CU'], colorByService: true, inventory: {},
    preinstalled: [{ kind: 'hmgr', unit: 2, side: 0 }, { kind: 'hmgr', unit: 7, side: 0 }, { kind: 'vring', unit: 3, side: 1 }, { kind: 'vring', unit: 5, side: 1 }],
    seed: 2, seg: 0.025,
  };

  it('goes through the guides in order, plugs into its port, and is routed', () => {
    const w = new World(bench);
    w.preroll(60);
    const c = 0, port = w.circuits[c].b;
    w.unplug(c, 1);
    const [m2, m7, r3, r5] = w.rack.guides();
    const res = planRoute(w, c, [m2, r3, r5, m7], w.rack.port(port));
    expect('plan' in res).toBe(true);
    if (!('plan' in res)) return;
    const run = new RouteRun(w, res.plan);
    for (let f = 0; f < 600 && !run.step(1 / 60); f++) w.sim.step();
    for (let f = 0; f < 120; f++) w.sim.step();
    expect(w.cables[c].ends[1].port).toBe(port);
    expect(w.evaluate().cableRouted[c]).toBe(true);
  });

  it('a cord too short for the route is refused, and says how much it lacks', () => {
    const w = new World(bench);
    const c = 0;
    w.unplug(c, 1);
    w.setCableLength(c, w.minCableLength(c));
    const [m2, m7, r3, r5] = w.rack.guides();
    const res = planRoute(w, c, [m2, r3, r5, m7], w.rack.port(w.circuits[c].b));
    expect('error' in res && res.error).toMatch(/trop court.*il manque \d+ cm/);
  });
});
