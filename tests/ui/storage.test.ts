import { describe, it, expect, beforeEach, vi } from 'vitest';
import { load, save } from '../../src/ui/storage';
import { HDR_HEADROOM } from '../../src/render/toneCurve';
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
    expect(load('progress')).toEqual({ stars: {}, times: {}, challenges: {} });
    expect(load('tutorialDone')).toBe(false);
  });

  it('keeps the progress', () => {
    const p = { stars: { l1: 3 }, times: { l1: 42 }, challenges: { l1: true } };
    save('progress', p);
    expect(JSON.parse(mem.get('cable.progress')!)).toEqual(p);
    expect(load('progress')).toEqual(p);
  });

  it('an unreadable value, or one of another shape, reads as the default', () => {
    for (const raw of ['{', 'null', '42', '{"stars":3}', '{"stars":{"l2":1}}']) {
      mem.set('cable.progress', raw);
      expect(load('progress')).toEqual({ stars: {}, times: {}, challenges: {} });
    }
  });

  it('keeps the workshop, its looks and finds; one of another shape reads as empty', () => {
    const empty = { equipped: {}, finds: [] };
    const kept = { equipped: { velcro: 'velcro-red' }, finds: ['duck' as const] };
    save('workshop', kept);
    expect(JSON.parse(mem.get('cable.workshop')!)).toEqual(kept);
    expect(load('workshop')).toEqual(kept);
    for (const raw of ['{"equipped":[]}', '{"finds":"duck"}', '{"equipped":{}}', '42']) {
      mem.set('cable.workshop', raw);
      expect([raw, load('workshop')]).toEqual([raw, empty]);
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

  it('a quality level out of range reads as automatic', () => {
    save('quality', { kind: 'auto', level: QUALITY.length - 1 });
    expect(load('quality')).toEqual({ kind: 'auto', level: QUALITY.length - 1 });
    for (const bad of [{ kind: 'auto', level: QUALITY.length }, { kind: 'auto', level: 0.5 }, { kind: 'fixed', settings: { ratio: 0, ao: true, ssr: true, shadow: 1024 } }, { kind: 'fixed' }]) {
      mem.set('cable.quality', JSON.stringify(bad));
      expect([bad, load('quality')]).toEqual([bad, AUTO_QUALITY]);
    }
  });

  it('HDR: auto until chosen, then on or off; anything else reads as auto', () => {
    expect(load('hdr')).toBe('auto');
    save('hdr', 'off');
    expect(load('hdr')).toBe('off');
    mem.set('cable.hdr', 'bright');
    expect(load('hdr')).toBe('auto');
  });

  it('HDR brightness: kept within its range, the default otherwise', () => {
    expect(load('hdrHeadroom')).toBe(HDR_HEADROOM.default);
    save('hdrHeadroom', 6.5);
    expect(load('hdrHeadroom')).toBe(6.5);
    for (const bad of ['99', '0.5', 'bright']) {
      mem.set('cable.hdr-headroom', bad);
      expect(load('hdrHeadroom')).toBe(HDR_HEADROOM.default);
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
    expect(load('progress')).toEqual({ stars: {}, times: {}, challenges: {} });
    expect(() => save('tutorialDone', true)).not.toThrow();
  });
});
