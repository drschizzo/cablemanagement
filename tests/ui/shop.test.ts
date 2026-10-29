// Looks that open with the stars won, and equipping them, over a plain workshop.
import { describe, expect, it } from 'vitest';
import { SHOP, collectFind, equip, equippedIn, isWorkshopOpen, lookOf, starsWon } from '../../src/ui/shop';
import { DEFAULT_LOOK } from '../../src/render/look';
import type { Career, Progress, Workshop } from '../../src/ui/storage';

const workshop = (): Workshop => ({ equipped: {}, finds: [] });
const item = (id: string) => SHOP.find((i) => i.id === id)!;
const progress = (stars: Record<string, number>): Progress => ({ stars, times: {}, challenges: {} });
const career = (done: number, stars: number[] = []): Career => ({ done, cabinet: null, stars });

describe('the workshop', () => {
  it('equips the given looks at first', () => {
    expect(lookOf(workshop(), 0)).toEqual(DEFAULT_LOOK);
  });

  it('equips only what the stars won open, one per slot', () => {
    const w = workshop();
    const needed = item('accent-warm').stars;
    expect(equip(w, needed - 1, item('accent-warm'))).toBe(false);
    expect(equip(w, needed, item('accent-warm'))).toBe(true);
    expect(equippedIn(w, needed, 'accent').id).toBe('accent-warm');
    expect(lookOf(w, needed).accent).toBe(item('accent-warm').value);
    expect(lookOf(w, needed).velcro).toBe(DEFAULT_LOOK.velcro);
  });

  it('adds up the stars of the campaign, the puzzles and the career', () => {
    expect(starsWon(progress({ l1: 3, l2: 2, p1: 3, unknown: 3 }), career(2, [3, 2]))).toBe(13);
  });

  it('keeps a find once', () => {
    const w = workshop();
    expect(collectFind(w, 'duck')).toBe(true);
    expect(collectFind(w, 'duck')).toBe(false);
    expect(w.finds).toEqual(['duck']);
  });
});

describe('when the workshop opens', () => {
  it('stays closed through the first levels of the campaign', () => {
    expect(isWorkshopOpen(progress({ l1: 3, l2: 2 }), career(0))).toBe(false);
  });

  it('opens with level 3 signed off, or a ticket of the career', () => {
    expect(isWorkshopOpen(progress({ l3: 1 }), career(0))).toBe(true);
    expect(isWorkshopOpen(progress({}), career(1))).toBe(true);
  });
});
