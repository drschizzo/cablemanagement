// Buying and wearing looks, over a plain wallet.
import { describe, expect, it } from 'vitest';
import { SHOP, buy, lookOf, wear, wornIn } from '../../src/ui/shop';
import { DEFAULT_LOOK } from '../../src/render/look';
import type { Wallet } from '../../src/ui/storage';

const wallet = (coins: number): Wallet => ({ coins, best: {}, owned: [], equipped: {}, finds: [] });
const item = (id: string) => SHOP.find((i) => i.id === id)!;

describe('the workshop', () => {
  it('wears the given looks at first', () => {
    expect(lookOf(wallet(0))).toEqual(DEFAULT_LOOK);
  });

  it('buys a look the wallet can pay for, once', () => {
    const w = wallet(100);
    expect(buy(w, item('velcro-pink'))).toBe(false);
    expect(buy(w, item('velcro-black'))).toBe(true);
    expect(w.coins).toBe(60);
    expect(buy(w, item('velcro-black'))).toBe(false);
  });

  it('wears only what is owned, one per slot', () => {
    const w = wallet(100);
    expect(wear(w, item('accent-warm'))).toBe(false);
    buy(w, item('accent-warm'));
    expect(wear(w, item('accent-warm'))).toBe(true);
    expect(wornIn(w, 'accent').id).toBe('accent-warm');
    expect(lookOf(w).accent).toBe(item('accent-warm').value);
    expect(lookOf(w).velcro).toBe(DEFAULT_LOOK.velcro);
  });
});
