// The cabinet of the day is drawn from the date alone: every player gets the same.
import { describe, expect, it } from 'vitest';
import { dailyLevel, dayBefore, dayKey } from '../../../src/game/levels/dailyLevel';
import { World } from '../../../src/game/world';

describe('the cabinet of the day', () => {
  it('is the same cabinet for the same date, another one the next day', () => {
    expect(dailyLevel('2026-11-03')).toEqual(dailyLevel('2026-11-03'));
    expect(dailyLevel('2026-11-03').seed).not.toBe(dailyLevel('2026-11-04').seed);
  });

  it('is numbered from the first day', () => {
    expect(dailyLevel('2026-10-29').number).toBe(1);
    expect(dailyLevel('2026-11-01').number).toBe(4);
    expect(dailyLevel('2027-10-29').number).toBe(366);
  });

  it('grows over the week, Monday the smallest', () => {
    // 2026-11-02 is a Monday, 2026-11-08 a Sunday
    expect(dailyLevel('2026-11-02').cables).toBe(8);
    expect(dailyLevel('2026-11-08').cables).toBe(24);
  });

  it('counts the days across months and years', () => {
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    expect(dayKey(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('can be played: its schedule is drawn and nothing is won at the start', () => {
    const w = new World(dailyLevel('2026-11-05'));
    w.preroll(30);
    expect(w.circuits.length).toBe(w.level.cables);
    expect(w.evaluate().stars).toBe(0);
    w.dispose();
  });
});
