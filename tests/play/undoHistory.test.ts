// The undo history only needs something that takes snapshots: a stand-in
// world numbering them is enough (no physics, no three.js).
import { describe, expect, it } from 'vitest';
import { UndoHistory } from '../../src/play/undoHistory';
import type { Snapshot, World } from '../../src/game/world';

function history() {
  let taken = 0;
  const world = { snapshot: () => ({ version: taken++ }) as unknown as Snapshot } as World;
  return new UndoHistory(world);
}

const version = (s: Snapshot | undefined) => s?.version;

describe('the undo history', () => {
  it('gives the states back, the latest first', () => {
    const h = history();
    h.remember();
    h.remember();
    expect(version(h.takeLast())).toBe(1);
    expect(version(h.takeLast())).toBe(0);
    expect(h.takeLast()).toBeUndefined();
  });

  it('forgets a gesture that came to nothing', () => {
    const h = history();
    h.remember();
    h.remember();
    h.forgetLast();
    expect(version(h.takeLast())).toBe(0);
  });

  it('keeps the last 30 states only', () => {
    const h = history();
    for (let i = 0; i < 35; i++) h.remember();
    let count = 0, oldest: number | undefined;
    for (let s = h.takeLast(); s; s = h.takeLast()) { count++; oldest = version(s); }
    expect(count).toBe(30);
    expect(oldest).toBe(5);
  });
});
