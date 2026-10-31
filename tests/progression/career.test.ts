// The career record: tickets in order, the cabinet kept from the last one signed off.
import { describe, expect, it } from 'vitest';
import { currentTicket, recordTicket } from '../../src/progression/career';
import { TICKETS } from '../../src/game/levels/career';
import type { CabinetState } from '../../src/game/cabinetState';
import type { Career } from '../../src/progression/storage';

const cabinet = (tag: number): CabinetState => ({ units: [], items: [], circuits: [], cords: [], straps: [{ cords: [tag], at: [0] }] });
const fresh = (): Career => ({ done: 0, cabinet: null, records: [] });
const record = (met: number) => ({ met, asked: 2, time: 60 });

describe('the career record', () => {
  it('starts on the first ticket, from the mess', () => {
    expect(currentTicket(fresh())!.ticket).toBe(0);
    expect(currentTicket(fresh())!.starts).toBeUndefined();
  });

  it('a ticket signed off opens the next one, and keeps its cabinet', () => {
    const c = fresh();
    recordTicket(c, 0, record(1), cabinet(1));
    expect(c.done).toBe(1);
    expect(c.cabinet).toEqual(cabinet(1));
    expect(c.records[0]).toEqual(record(1));
  });

  it('the last ticket signed off again keeps the cabinet as it is now; an older one changes nothing', () => {
    const c = fresh();
    recordTicket(c, 0, record(1), cabinet(1));
    recordTicket(c, 0, record(2), cabinet(2));
    expect([c.done, c.records[0]]).toEqual([1, record(2)]);
    expect(c.cabinet).toEqual(cabinet(2));
    recordTicket(c, 1, record(0), cabinet(3));
    recordTicket(c, 0, record(2), cabinet(4));
    expect(c.cabinet).toEqual(cabinet(3));
  });

  it('is over once every ticket is signed off', () => {
    expect(currentTicket({ done: TICKETS.length, cabinet: null, records: [] })).toBeNull();
  });
});
