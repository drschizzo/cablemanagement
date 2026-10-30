import { describe, expect, it } from 'vitest';
import { once } from '../../src/lib/once';

describe('once', () => {
  it('makes its value on the first call only, and gives the same after', () => {
    let made = 0;
    const get = once(() => ({ n: ++made }));
    expect(made).toBe(0);
    const a = get();
    expect(get()).toBe(a);
    expect(made).toBe(1);
  });

  it('keeps a value that is falsy', () => {
    let made = 0;
    const get = once(() => { made++; return null; });
    get(); get();
    expect(made).toBe(1);
  });
});
