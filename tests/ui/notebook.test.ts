// Looks that open with the stars won, and equipping them, over a plain notebook.
import { describe, expect, it } from 'vitest';
import { LOOKS, collectFind, equip, equippedIn, isNotebookOpen, lookOf, starsWon } from '../../src/ui/notebook';
import { DEFAULT_LOOK } from '../../src/render/look';
import type { Career, Progress, Notebook } from '../../src/ui/storage';

const notebook = (): Notebook => ({ equipped: {}, finds: [] });
const item = (id: string) => LOOKS.find((i) => i.id === id)!;
const progress = (stars: Record<string, number>): Progress => ({ stars, times: {} });
const career = (done: number, stars: number[] = []): Career => ({ done, cabinet: null, stars });

describe('the notebook', () => {
  it('equips the given looks at first', () => {
    expect(lookOf(notebook(), 0)).toEqual(DEFAULT_LOOK);
  });

  it('equips only what the stars won open, one per slot', () => {
    const w = notebook();
    const needed = item('accent-warm').stars;
    expect(equip(w, needed - 1, item('accent-warm'))).toBe(false);
    expect(equip(w, needed, item('accent-warm'))).toBe(true);
    expect(equippedIn(w, needed, 'accent').id).toBe('accent-warm');
    expect(lookOf(w, needed).accent).toBe(item('accent-warm').value);
    expect(lookOf(w, needed).velcro).toBe(DEFAULT_LOOK.velcro);
  });

  it('adds up the stars of the training, the big cabinets and the career', () => {
    expect(starsWon(progress({ l1: 3, l2: 2, l6: 3, unknown: 3 }), career(2, [3, 2]))).toBe(13);
  });

  it('keeps a find once', () => {
    const w = notebook();
    expect(collectFind(w, 'duck')).toBe(true);
    expect(collectFind(w, 'duck')).toBe(false);
    expect(w.finds).toEqual(['duck']);
  });
});

describe('when the notebook opens', () => {
  it('stays closed through the first levels of the training, with nothing found', () => {
    expect(isNotebookOpen(progress({ l1: 3, l2: 2 }), notebook())).toBe(false);
  });

  it('opens with the first find, or level 3 signed off', () => {
    expect(isNotebookOpen(progress({}), { equipped: {}, finds: ['duck'] })).toBe(true);
    expect(isNotebookOpen(progress({ l3: 1 }), notebook())).toBe(true);
  });
});
