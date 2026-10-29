// Buying and equipping looks, over a plain wallet.
import { describe, expect, it } from 'vitest';
import { SHOP, buy, equip, lookOf, equippedIn, isWorkshopOpen } from '../../src/ui/shop';
import { DEFAULT_LOOK } from '../../src/render/look';
import type { Career, Progress, Wallet } from '../../src/ui/storage';

const wallet = (coins: number): Wallet => ({ coins, best: {}, owned: [], equipped: {}, finds: [] });
const item = (id: string) => SHOP.find((i) => i.id === id)!;

describe('the workshop', () => {
  it('equips the given looks at first', () => {
    expect(lookOf(wallet(0))).toEqual(DEFAULT_LOOK);
  });

  it('buys a look the wallet can pay for, once', () => {
    const w = wallet(100);
    expect(buy(w, item('velcro-pink'))).toBe(false);
    expect(buy(w, item('velcro-black'))).toBe(true);
    expect(w.coins).toBe(60);
    expect(buy(w, item('velcro-black'))).toBe(false);
  });

  it('equips only what is owned, one per slot', () => {
    const w = wallet(100);
    expect(equip(w, item('accent-warm'))).toBe(false);
    buy(w, item('accent-warm'));
    expect(equip(w, item('accent-warm'))).toBe(true);
    expect(equippedIn(w, 'accent').id).toBe('accent-warm');
    expect(lookOf(w).accent).toBe(item('accent-warm').value);
    expect(lookOf(w).velcro).toBe(DEFAULT_LOOK.velcro);
  });
});

describe('when the workshop opens', () => {
  const progress = (stars: Record<string, number>): Progress => ({ stars, times: {}, challenges: {}, notes: {} });
  const career = (done: number): Career => ({ done, cabinet: null, stars: [] });

  it('stays closed through the first levels of the campaign', () => {
    expect(isWorkshopOpen(progress({ l1: 3, l2: 2 }), career(0), wallet(80))).toBe(false);
  });

  it('opens with level 3 signed off, a ticket of the career, or a look already bought', () => {
    expect(isWorkshopOpen(progress({ l3: 1 }), career(0), wallet(0))).toBe(true);
    expect(isWorkshopOpen(progress({}), career(1), wallet(0))).toBe(true);
    expect(isWorkshopOpen(progress({}), career(0), { ...wallet(0), owned: ['velcro-black'] })).toBe(true);
  });
});
