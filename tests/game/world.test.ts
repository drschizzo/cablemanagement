// The rules of a cabinet: plugging, the maintenance window, the score.
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/game/world';
import { HOLD } from '../../src/game/evaluation';
import { LEVELS } from '../../src/game/levels/campaign';
import { SERVICES } from '../../src/game/services';
import type { LevelDef } from '../../src/game/levels/levelDef';
import { planRoute, RouteRun } from '../../src/game/routeLaying';

// level 1, every cord on its planned ports: four copper cords, all in production
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
    expect(w.maintenance.live.size).toBe(L1.cables);
    expect(w.maintenance.liveDown()).toBe(0);
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
    expect(w.rack.port(port).plugged).toBeNull();
    expect(w.circuitUp(0)).toBe(false);
    expect(w.maintenance.liveDown()).toBe(1);
    expect(w.evaluate().stars).toBe(0);
  });

  it('every second a production link is cut costs its service\'s weight', () => {
    const weight = SERVICES[w.circuits[0].service].weight;
    w.maintenance.tick(2);
    expect(w.maintenance.downtime).toBe(0);
    w.unplug(0, 0);
    w.maintenance.tick(2);
    expect(w.maintenance.downtime).toBeCloseTo(2 * weight);
    expect(w.evaluate().downtime).toBeCloseTo(2 * weight);
  });

  it('a bypass carries its link while it is cut, and comes back once it is restored', () => {
    const v = new World({ ...L1, bypass: 1 });
    const port = v.cables[0].ends[0].port!;
    expect(v.maintenance.toggleBypass(0)).toBe(true);
    expect(v.maintenance.bypassesLeft).toBe(0);
    expect(v.maintenance.toggleBypass(1)).toBe(false); // none left
    v.unplug(0, 0);
    v.maintenance.tick(5);
    expect(v.maintenance.downtime).toBe(0);
    v.plug(0, 0, port);
    expect(v.maintenance.tick(0.1)).toEqual([0]);
    expect(v.maintenance.bypassesLeft).toBe(1);
    expect(v.maintenance.bypassed.size).toBe(0);
  });

  it('plugged back, the line works again', () => {
    const port = w.cables[0].ends[0].port!;
    w.unplug(0, 0);
    expect(w.plug(0, 0, port)).toBe(true);
    expect(w.circuitUp(0)).toBe(true);
    expect(w.maintenance.liveDown()).toBe(0);
  });

  it('a port takes one connector', () => {
    const taken = w.cables[1].ends[0].port!;
    w.unplug(0, 0);
    expect(w.plug(0, 0, taken)).toBe(false);
    expect(w.cables[0].ends[0].port).toBeNull();
  });

  it('a cord of the wrong type does not make a line', () => {
    const v = new World(L1);
    // its ports freed, then joined by a new fibre cord from the stock
    const { a, b } = v.circuits[0];
    for (const id of [a, b]) { const p = v.rack.port(id).plugged; if (p) v.unplug(p.cable, p.end); }
    const fibre = v.addCable('OS2', 1);
    expect(v.plug(fibre, 0, a) && v.plug(fibre, 1, b)).toBe(true);
    expect(v.circuitUp(0)).toBe(false);
    expect(v.evaluate().circuits[0].connected).toBe(false);
  });
});

describe('labels, straps and cord lengths', () => {
  it('a strap drawn across cords holds the nodes it was given, one velcro each', () => {
    const w = new World(L1);
    const before = w.stock.velcro;
    const nodes = [w.cables[0].start + 6, w.cables[1].start + 6];
    expect(w.strapNodes(nodes.slice(0, 1))).toBeNull(); // one cord: nothing to strap
    const s = w.strapNodes(nodes)!;
    expect(s.nodes).toEqual(nodes);
    expect(nodes.every((i) => w.sim.bundleOf[i] === s.bundle)).toBe(true);
    expect(w.stock.velcro).toBe(before - 1);
  });

  it('a cord plugged as planned takes the label of its service, at both ends', () => {
    const w = new World({ ...L1, labels: true });
    const svc = w.circuits[0].service;
    w.labelCord(0, null);
    expect(w.evaluate().circuits[0].labelled).toBe(false);
    const port = w.cables[0].ends[1].port!;
    w.unplug(0, 1);
    w.plug(0, 1, port);
    expect(w.cables[0].ends.map((e) => e.label)).toEqual([svc, svc]);
    expect(w.evaluate().circuits[0].labelled).toBe(true);
  });

  it('new cords come out of a stock counted by length', () => {
    const w = new World({ ...L1, cords: [[1, 1]] });
    expect(w.takeCord('CU', 1)).toBe(L1.cables);
    expect(w.takeCord('CU', 1)).toBe(-1);
    expect(w.takeCord('CU', 2)).toBe(-1);
    expect(w.cables).toHaveLength(L1.cables + 1);
  });

  it('a cord cut to the shortest that joins its ports is taut, one cut to its tidy route is not', () => {
    const w = new World({ ...LEVELS[2], wrong: 0, loose: 0 });
    // a cord whose ports are far apart across the cabinet: the tidy route takes it to the side
    const c = w.cables.findIndex((_, k) => w.minCableLength(k) < 0.65 * w.routeLength(k)!);
    expect(c).toBeGreaterThanOrEqual(0);
    w.setCableLength(c, w.minCableLength(c) + 0.01);
    expect(w.strain(c)).toBe('taut');
    expect(w.evaluate().cableStrain[c]).toBe('taut');
    w.setCableLength(c, w.tidyLength(c)!);
    expect(w.strain(c)).toBeNull();
  });

  it('a connector let go in the air stays hooked there, and undo puts it back', () => {
    const w = new World(L1);
    w.unplug(0, 0);
    const s = w.snapshot();
    w.park(0, 0, [[0.1, 0.5, 0.1], [0.1, 0.525, 0.1]]);
    // carried there along a stroke, as into a port, then held
    for (let f = 0; f < 90; f++) w.sim.step();
    const [n0] = w.endNodes(0, 0);
    expect(w.sim.x[3 * n0 + 1]).toBeCloseTo(0.5, 3);
    w.restore(s);
    expect(w.cables[0].ends[0].parked).toBeNull();
  });

  it('a strap needs two cords within reach, and goes back to the stock', () => {
    const w = new World(L1);
    const before = w.stock.velcro;
    expect(w.addStrap(5, 5, 5)).toBeNull(); // nothing there
    const [a] = w.endNodes(0, 0);
    const i = a + 4, x = w.sim.x;
    // bring a node of cord 1 next to one of cord 0
    const j = w.cables[1].start + 4;
    w.sim.moveNodes(j, [x[3 * i] + 0.002, x[3 * i + 1], x[3 * i + 2]]);
    const s = w.addStrap(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.01)!;
    expect(s).not.toBeNull();
    expect(w.stock.velcro).toBe(before - 1);
    w.removeStrap(s);
    expect(w.stock.velcro).toBe(before);
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
    const w = new World(L1);
    w.depositCable(2);
    expect(w.cables[2].ends.every((e) => e.port === null)).toBe(true);
    const c = w.addCable('CU', 1);
    expect(c).toBe(L1.cables);
    // laid on a coil, whose chords are a little shorter than its rest lengths: it is as long as asked
    expect(w.cableLength(c)).toBeCloseTo(1, 9);
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
    w.setLabel(0, 1, 2);
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
    id: 'route', kind: 'bench',
    units: [B, { kind: 'panel', name: 'A', ports: 12, style: 'copper' }, B, B, B, B, B, B, { kind: 'switch', name: 'S', ports: 12, style: 'switch' }, B, B],
    cables: 2, wrong: 0, loose: 0, slack: [0.3, 0.4], mess: 1,
    labels: false, services: 1, types: ['CU'], colorByService: true, inventory: {},
    preinstalled: [{ kind: 'fingerManager', unit: 2, side: 0 }, { kind: 'fingerManager', unit: 7, side: 0 }, { kind: 'ring', unit: 3, side: 1 }, { kind: 'ring', unit: 5, side: 1 }],
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

  it('stays held by the managers it was laid in when a new cord comes from the stock', () => {
    const w = new World(bench);
    w.preroll(60);
    const c = 0;
    w.unplug(c, 1);
    const [m2, m7, r3, r5] = w.rack.guides();
    const res = planRoute(w, c, [m2, r3, r5, m7], w.rack.port(w.circuits[c].b));
    if (!('plan' in res)) throw new Error('no route');
    const run = new RouteRun(w, res.plan);
    for (let f = 0; f < 600 && !run.step(1 / 60); f++) w.sim.step();
    for (let f = 0; f < 120; f++) w.sim.step();
    const kept = () => {
      const cb = w.cables[c];
      return Array.from(w.sim.keepOf.subarray(cb.start, cb.start + cb.count));
    };
    const before = kept();
    expect(before.some((k) => k >= 0)).toBe(true);
    w.addCable('CU', 1);
    expect(w.sim.handled[c]).toBe(1);
    expect(kept()).toEqual(before);
  });

  it('passes where the line was drawn, and goes into a manager by the end the line came in by', () => {
    const w = new World(bench);
    w.preroll(60);
    const c = 0, cb = w.cables[c], port = w.circuits[c].b;
    w.unplug(c, 1);
    expect(w.setCableLength(c, 2.5)).toBe(true);
    const [m2] = w.rack.guides();
    const y = (m2.room.min[1] + m2.room.max[1]) / 2, fy = w.rack.floorY;
    // down the left of the cabinet to its floor, back up the left side, and
    // along the manager from its left end (a little under it, as a hand draws)
    const leg: [number, number, number][] = [];
    for (let t = 0; t <= 1; t += 0.05) leg.push([-0.33, fy + (y - fy) * t, 0.09]);
    for (let x = -0.33; x < -0.1; x += 0.01) leg.push([x, m2.room.min[1] - 0.006, 0.09]);
    const res = planRoute(w, c, [m2], w.rack.port(port), [leg, []]);
    expect('plan' in res).toBe(true);
    if (!('plan' in res)) return;
    const run = new RouteRun(w, res.plan);
    for (let f = 0; f < 600 && !run.step(1 / 60); f++) w.sim.step();
    for (let f = 0; f < 120; f++) w.sim.step();
    expect(w.cables[c].ends[1].port).toBe(port);
    const x = w.sim.x;
    let up = 0, leftEnd = 0;
    for (let i = cb.start; i < cb.start + cb.count; i++) {
      if (x[3 * i] < -0.24 && x[3 * i + 1] > fy + 0.1 && x[3 * i + 1] < m2.room.min[1]) up++;
      if (x[3 * i] < -0.18 && Math.abs(x[3 * i + 1] - y) < 0.03) leftEnd++;
    }
    expect(up).toBeGreaterThan(3);
    expect(leftEnd).toBeGreaterThan(0);
  });

  it('a cord too short for the whole line drawn cuts its corners, if it reaches the guides by the same sides', () => {
    const w = new World(bench);
    w.preroll(60);
    const c = 0, cb = w.cables[c], port = w.rack.port(w.circuits[c].b);
    w.unplug(c, 1);
    expect(w.setCableLength(c, 2.5)).toBe(true);
    const [m2] = w.rack.guides();
    const y = (m2.room.min[1] + m2.room.max[1]) / 2, fy = w.rack.floorY;
    const detour: [number, number, number][] = [];
    for (let t = 0; t <= 1; t += 0.05) detour.push([-0.33, fy + (y - fy) * t, 0.09]);
    // what each takes: straight into the manager by its left end, or by the floor
    const need = (leg: [number, number, number][]) => {
      const r = planRoute(w, c, [m2], port, [leg, []]);
      return 'plan' in r ? 2.5 - r.plan.slack : Infinity;
    };
    const tight = need([[-0.33, y, 0.09]]), full = need(detour);
    expect(full - tight).toBeGreaterThan(0.3);
    expect(w.setCableLength(c, tight + 0.1)).toBe(true);
    const res = planRoute(w, c, [m2], port, [detour, []]);
    expect('plan' in res).toBe(true);
    if (!('plan' in res)) return;
    const run = new RouteRun(w, res.plan);
    for (let f = 0; f < 600 && !run.step(1 / 60); f++) w.sim.step();
    for (let f = 0; f < 120; f++) w.sim.step();
    expect(w.cables[c].ends[1].port).toBe(port.id);
    let leftEnd = 0;
    for (let i = cb.start; i < cb.start + cb.count; i++) if (w.sim.x[3 * i] < -0.18 && Math.abs(w.sim.x[3 * i + 1] - y) < 0.03) leftEnd++;
    expect(leftEnd).toBeGreaterThan(0);
  });

  it('a cord too short for the route is refused, and says how much it lacks', () => {
    const w = new World(bench);
    const c = 0;
    w.unplug(c, 1);
    w.setCableLength(c, w.minCableLength(c));
    const [m2, m7, r3, r5] = w.rack.guides();
    const res = planRoute(w, c, [m2, r3, r5, m7], w.rack.port(w.circuits[c].b));
    if (!('error' in res)) throw new Error('the route should be refused');
    expect(res.error.kind).toBe('tooShort');
    expect(res.error.kind === 'tooShort' && res.error.missing).toBeGreaterThan(0.005);
  });
});

describe('incidents in a cabinet', () => {
  it('a colleague unplugs a production link: it goes down, and costs downtime', () => {
    const w = new World({ ...L1, incidents: [{ kind: 'colleague', at: 0 }] });
    const { incidents } = w.workGoesOn(0.1);
    expect(incidents).toHaveLength(1);
    const ev = incidents[0];
    if (ev.kind !== 'colleague') throw new Error('a colleague was expected');
    expect(w.circuitUp(ev.link)).toBe(false);
    w.workGoesOn(1);
    expect(w.maintenance.downtime).toBeGreaterThan(0);
  });

  it('a call missed weighs on the downtime budget', () => {
    const w = new World({ ...L1, incidents: [{ kind: 'colleague', at: 0 }, { kind: 'call', at: 1 }] });
    w.workGoesOn(0.1);
    w.workGoesOn(1);
    const before = w.maintenance.downtime;
    const { incidents } = w.workGoesOn(61);
    expect(incidents.some((e) => e.kind === 'callMissed')).toBe(true);
    expect(w.maintenance.downtime - before).toBeGreaterThan(40);
  });
});

describe('cords broken inside', () => {
  const w = new World({ ...L1, faults: 1 });
  const faulty = w.cables.findIndex((_, c) => w.isFaulty(c));

  it('one cord is broken, and its link is down though plugged as planned', () => {
    expect(faulty).toBeGreaterThanOrEqual(0);
    const line = w.circuits.findIndex((ci) => w.rack.cableJoining(ci.a, ci.b) === faulty);
    expect(w.circuitFaulty(line)).toBe(true);
    expect(w.circuitUp(line)).toBe(false);
    expect(w.evaluate().connected).toBe(w.circuits.length - 1);
  });

  it('it was never in production: the broken link costs no downtime', () => {
    expect(w.maintenance.live.size).toBe(w.circuits.length - 1);
  });

  it('a new cord from the stock is sound', () => {
    const c = w.addCable('CU', 1);
    expect(w.isFaulty(c)).toBe(false);
  });
});
