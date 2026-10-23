import { describe, it, expect, beforeEach, vi } from 'vitest';
import { load, save } from '../src/storage';

const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  });
});

describe('browser storage', () => {
  it('a missing entry reads as its default', () => {
    expect(load('progress')).toEqual({ stars: {}, times: {} });
    expect(load('tutorialDone')).toBe(false);
  });

  it('keeps the progress, under the key of earlier versions', () => {
    save('progress', { stars: { l1: 3 }, times: { l1: 42 } });
    expect(JSON.parse(mem.get('cable.progress')!)).toEqual({ stars: { l1: 3 }, times: { l1: 42 } });
    expect(load('progress')).toEqual({ stars: { l1: 3 }, times: { l1: 42 } });
  });

  it('an old save without the times still reads', () => {
    mem.set('cable.progress', '{"stars":{"l2":1}}');
    expect(load('progress')).toEqual({ stars: { l2: 1 }, times: {} });
  });

  it('an unreadable value, or one of another shape, reads as the default', () => {
    for (const raw of ['{', 'null', '42', '{"stars":3}']) {
      mem.set('cable.progress', raw);
      expect(load('progress')).toEqual({ stars: {}, times: {} });
    }
  });

  it('the tutorial done, then forgotten', () => {
    save('tutorialDone', true);
    expect(mem.get('cable.tutorial')).toBe('done');
    expect(load('tutorialDone')).toBe(true);
    save('tutorialDone', false);
    expect(mem.has('cable.tutorial')).toBe(false);
  });

  it('a blocked storage does not break the game', () => {
    const blocked = () => { throw new Error('blocked'); };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(load('progress')).toEqual({ stars: {}, times: {} });
    expect(() => save('tutorialDone', true)).not.toThrow();
  });
});
