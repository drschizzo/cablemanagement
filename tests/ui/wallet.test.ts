// A level played again pays only what it adds to its best payslip; a find is kept once.
import { describe, expect, it } from 'vitest';
import { collectFind, earn } from '../../src/ui/wallet';
import type { Wallet } from '../../src/ui/storage';

const empty = (): Wallet => ({ coins: 0, best: {}, owned: [], equipped: {}, finds: [] });
const slip = (total: number) => ({ lines: [{ item: 'links' as const, amount: total }], total });

describe('the wallet', () => {
  it('pays a first job in full, a replay only what it adds', () => {
    const w = empty();
    expect(earn(w, 'l1', slip(50))).toBe(50);
    expect(earn(w, 'l1', slip(40))).toBe(0);
    expect(earn(w, 'l1', slip(70))).toBe(20);
    expect(w.coins).toBe(70);
    expect(earn(w, 'l2', slip(10))).toBe(10);
  });

  it('keeps a find once', () => {
    const w = empty();
    expect(collectFind(w, 'duck')).toBe(true);
    expect(collectFind(w, 'duck')).toBe(false);
    expect(w.finds).toEqual(['duck']);
  });
});
