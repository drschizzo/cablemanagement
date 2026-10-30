// Whether the image goes past white: the player's choice, where the page can show it.
import { describe, expect, it } from 'vitest';
import { isHdrShown } from '../../src/render/hdrScreen';

describe('HDR on screen', () => {
  it('auto follows the screen', () => {
    expect(isHdrShown('auto', 'available', true)).toBe(true);
    expect(isHdrShown('auto', 'available', false)).toBe(false);
  });

  it('a choice holds whatever the screen', () => {
    expect(isHdrShown('on', 'available', false)).toBe(true);
    expect(isHdrShown('off', 'available', true)).toBe(false);
  });

  it('never where the page cannot show it', () => {
    for (const support of ['noWebGPU', 'sdrScreen'] as const) {
      for (const choice of ['auto', 'on', 'off'] as const) expect(isHdrShown(choice, support, true)).toBe(false);
    }
  });
});
