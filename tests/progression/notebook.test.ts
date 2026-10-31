// Looks that open with the ticks won, and equipping them, over a plain notebook.
import { describe, expect, it } from 'vitest';
import { LOOKS, collectFind, equip, equippedIn, isNotebookOpen, lookOf, ticksWon } from '../../src/progression/notebook';
import { DEFAULT_LOOK } from '../../src/render/look';
import type { Career, Progress, Notebook } from '../../src/progression/storage';

const notebook = (): Notebook => ({ equipped: {}, finds: [] });
const item = (id: string) => LOOKS.find((i) => i.id === id)!;
/** each level signed off with `met` requirements met, by level id */
const progress = (met: Record<string, number>): Progress => ({ levels: Object.fromEntries(Object.entries(met).map(([id, m]) => [id, { met: m, asked: 2, time: 60 }])) });
const career = (done: number, met: number[] = []): Career => ({ done, cabinet: null, records: met.map((m) => ({ met: m, asked: 3, time: 60 })) });

describe('the notebook', () => {
  it('equips the given looks at first', () => {
    expect(lookOf(notebook(), 0)).toEqual(DEFAULT_LOOK);
  });

  it('equips only what the ticks won open, one per slot', () => {
    const w = notebook();
    const needed = item('accent-warm').ticks;
    expect(equip(w, needed - 1, item('accent-warm'))).toBe(false);
    expect(equip(w, needed, item('accent-warm'))).toBe(true);
    expect(equippedIn(w, needed, 'accent').id).toBe('accent-warm');
    expect(lookOf(w, needed).accent).toBe(item('accent-warm').value);
    expect(lookOf(w, needed).velcro).toBe(DEFAULT_LOOK.velcro);
  });

  it('a tick per cabinet signed off and per requirement met, in the training, the big cabinets and the career', () => {
    expect(ticksWon(progress({ l1: 0, l3: 2, l6: 1 }), career(2, [3, 1]))).toBe(1 + 3 + 2 + 4 + 2);
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
    expect(isNotebookOpen(progress({ l1: 0, l2: 0 }), notebook())).toBe(false);
  });

  it('opens with the first find, or level 3 signed off', () => {
    expect(isNotebookOpen(progress({}), { equipped: {}, finds: ['duck'] })).toBe(true);
    expect(isNotebookOpen(progress({ l3: 0 }), notebook())).toBe(true);
  });
});
