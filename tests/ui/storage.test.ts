import { describe, it, expect, beforeEach, vi } from 'vitest';
import { load, save } from '../../src/ui/storage';
import { AUTO_QUALITY, QUALITY } from '../../src/render/quality';

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
    expect(load('progress')).toEqual({ stars: {}, times: {}, challenges: {}, notes: {} });
    expect(load('tutorialDone')).toBe(false);
  });

  it('keeps the progress, under the key of earlier versions', () => {
    const p = { stars: { l1: 3 }, times: { l1: 42 }, challenges: { l1: true }, notes: { l1: 87 } };
    save('progress', p);
    expect(JSON.parse(mem.get('cable.progress')!)).toEqual(p);
    expect(load('progress')).toEqual(p);
  });

  it('an old save without the times or the challenges still reads', () => {
    mem.set('cable.progress', '{"stars":{"l2":1}}');
    expect(load('progress')).toEqual({ stars: { l2: 1 }, times: {}, challenges: {}, notes: {} });
  });

  it('an unreadable value, or one of another shape, reads as the default', () => {
    for (const raw of ['{', 'null', '42', '{"stars":3}']) {
      mem.set('cable.progress', raw);
      expect(load('progress')).toEqual({ stars: {}, times: {}, challenges: {}, notes: {} });
    }
  });

  it('a wallet of an earlier version gets the fields it lacked; one of another shape reads as empty', () => {
    const empty = { coins: 0, best: {}, owned: [], equipped: {}, finds: [] };
    mem.set('cable.wallet', '{"coins":120,"best":{"l1":50}}');
    expect(load('wallet')).toEqual({ ...empty, coins: 120, best: { l1: 50 } });
    for (const raw of ['{"coins":"120"}', '{"coins":5,"owned":"velcro-red"}', '{"coins":5,"best":[]}', '[]']) {
      mem.set('cable.wallet', raw);
      expect([raw, load('wallet')]).toEqual([raw, empty]);
    }
  });

  it('a career that cannot be resumed reads as a new one', () => {
    const fresh = { done: 0, cabinet: null, stars: [] };
    const kept = { done: 2, cabinet: { units: [], items: [], circuits: [], cords: [], straps: [] }, stars: [3, 2] };
    save('career', kept);
    expect(load('career')).toEqual(kept);
    for (const raw of ['{"done":-1,"cabinet":null,"stars":[]}', '{"done":1.5,"cabinet":null,"stars":[]}', '{"done":1,"cabinet":{},"stars":[]}', '{"done":1,"cabinet":null}']) {
      mem.set('cable.career', raw);
      expect([raw, load('career')]).toEqual([raw, fresh]);
    }
  });

  it('a day of the record without its stars or its grid is left out; the other days stay', () => {
    mem.set('cable.daily', '{"2026-11-05":{"stars":2,"lines":[2,1]},"2026-11-06":{"stars":1},"2026-11-07":null,"2026-11-08":{"stars":"3","lines":[]}}');
    expect(load('daily')).toEqual({ '2026-11-05': { stars: 2, lines: [2, 1] } });
    for (const raw of ['[]', 'null', '"x"']) {
      mem.set('cable.daily', raw);
      expect([raw, load('daily')]).toEqual([raw, {}]);
    }
  });

  it('a quality level the game no longer has reads as automatic', () => {
    save('quality', { kind: 'auto', level: QUALITY.length - 1 });
    expect(load('quality')).toEqual({ kind: 'auto', level: QUALITY.length - 1 });
    for (const bad of [{ kind: 'auto', level: QUALITY.length }, { kind: 'auto', level: 0.5 }, { kind: 'fixed', settings: { ratio: 0, ao: true, ssr: true, shadow: 1024 } }, { kind: 'fixed' }]) {
      mem.set('cable.quality', JSON.stringify(bad));
      expect([bad, load('quality')]).toEqual([bad, AUTO_QUALITY]);
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
    expect(load('progress')).toEqual({ stars: {}, times: {}, challenges: {}, notes: {} });
    expect(() => save('tutorialDone', true)).not.toThrow();
  });
});
