// The career: each ticket starts from the cabinet as the last one left it,
// and can end in three stars when the cabinet before was finished well.
import { describe, expect, it } from 'vitest';
import { World } from '../../../src/game/world';
import { TICKETS, ticketLevel } from '../../../src/game/levels/career';
import { cabinetOf, type CabinetState } from '../../../src/game/cabinetState';
import { tidyKit, tidyLayout } from '../../../src/game/idealRoutes';
import type { LevelDef } from '../../../src/game/levels/levelDef';
import { insideBox } from '../../../src/game/rack';

/** the cabinet of a level finished by a careful technician, settled and labelled */
function finished(level: LevelDef): World {
  const kit = tidyKit(level);
  const w = new World(kit, tidyLayout(kit).starts);
  for (let f = 0; f < 240; f++) w.sim.step();
  for (let f = 0; f < 60; f++) w.sim.step();
  w.circuits.forEach((ci, i) => w.labelCord(i, ci.service));
  return w;
}

describe('a cabinet carried over', () => {
  it('comes back as it was left: cords on their ports, supports, straps, schedule', () => {
    const w = finished(ticketLevel(0, null));
    const cabinet = cabinetOf(w);
    const again = new World({ ...ticketLevel(0, null), schedule: () => cabinet.circuits, starts: cabinet.cords, straps: cabinet.straps, preinstalled: cabinet.items });
    expect(again.circuits).toEqual(w.circuits);
    expect(again.cables.map((c) => c.ends.map((e) => e.port))).toEqual(w.cables.map((c) => c.ends.map((e) => e.port)));
    expect(again.rack.items.map((it) => [it.kind, it.unit, it.side])).toEqual(w.rack.items.map((it) => [it.kind, it.unit, it.side]));
    expect(again.straps.length).toBe(w.straps.length);
    expect(again.evaluate().connected).toBe(again.circuits.length);
  });

  it('keeps each strap round the same cords, though a cord before them went to the crate', () => {
    const level = ticketLevel(0, null);
    const w = finished(level);
    strapThree(w);
    expect(w.straps.length).toBeGreaterThan(0);
    // a strap, told by the ports of its cords (their indices change)
    const strapped = (world: World) => world.straps.map((st) => st.nodes.map((i) => world.cables[world.sim.cableOf[i]].ends.map((e) => e.port).join('-')).sort());
    const inStraps = new Set(w.straps.flatMap((st) => st.nodes.map((i) => w.sim.cableOf[i])));
    // a cord in no strap, with strapped cords after it: those are numbered anew
    const gone = w.cables.findIndex((_, c) => !inStraps.has(c) && [...inStraps].some((s) => s > c));
    expect(gone).toBeGreaterThanOrEqual(0);
    const before = strapped(w);
    w.depositCable(gone);
    const cabinet = cabinetOf(w);
    const again = new World({ ...level, schedule: () => cabinet.circuits, starts: cabinet.cords, straps: cabinet.straps, preinstalled: cabinet.items });
    expect(strapped(again)).toEqual(before);
  });

  it('leaves out the cords lying in the crate', () => {
    const w = finished(ticketLevel(0, null));
    w.depositCable(0);
    expect(cabinetOf(w).cords.length).toBe(w.cables.length - 1);
  });
});

describe('the career, ticket after ticket', () => {
  it('every ticket can end in three stars, from the cabinet the one before left', () => {
    let cabinet: CabinetState | null = null;
    TICKETS.forEach((_, t) => {
      const level = ticketLevel(t, cabinet);
      const start = new World(level);
      // the work is still to do when the ticket opens
      if (t > 0) expect(start.evaluate().stars).toBeLessThan(3);
      start.dispose();
      const w = finished(level);
      expect([t, w.evaluate().stars]).toEqual([t, 3]);
      cabinet = cabinetOf(w);
      w.dispose();
    });
  }, 60_000);

  it('a new ticket adds its links, and takes others out', () => {
    const first = cabinetOf(finished(ticketLevel(0, null)));
    const second = ticketLevel(1, first);
    expect(second.cables).toBe(first.circuits.length + (TICKETS[1].add ?? 0));
    const third = ticketLevel(3, cabinetOf(finished(ticketLevel(2, cabinetOf(finished(second))))));
    expect(third.schedule!(null as never).length).toBe(third.cables);
  });
});

/** a strap round three cords or more, where they run side by side in a support */
function strapThree(w: World): void {
  const supports = w.rack.supports();
  for (let i = 0; i < w.sim.n && !w.straps.some((st) => st.nodes.length >= 3); i += 3) {
    const p = w.nodePosition(i);
    if (w.sim.bundleOf[i] >= 0 || !supports.some((s) => insideBox(s, ...p))) continue;
    const st = w.addStrap(...p);
    if (st && st.nodes.length < 3) w.removeStrap(st);
  }
}
