// HDR on screen: whether the screen shows what is brighter than white, and
// whether the image goes past white, as the player chose (auto: when the
// screen can show it).

import { assertNever } from '../lib/assertNever';

/** what the player chose: the image past white when the screen shows it (auto), always, or never */
export type HdrChoice = 'auto' | 'on' | 'off';

/**
 * Whether this page can draw past white: `available`, or why not (no
 * WebGPU: WebGL 2 has no canvas of extended range; or a screen that showed no
 * HDR when the page opened, whose canvas was made for it).
 */
export type HdrSupport = 'available' | 'noWebGPU' | 'sdrScreen';

const HDR_QUERY = '(dynamic-range: high)';

/** the screen the page is on shows HDR (and the system has it turned on) */
export function screenIsHdr(): boolean {
  return typeof matchMedia === 'function' && matchMedia(HDR_QUERY).matches;
}

/** `listener` when the page goes onto a screen of another range (a window moved, HDR turned on or off) */
export function onScreenRangeChange(listener: () => void): void {
  if (typeof matchMedia === 'function') matchMedia(HDR_QUERY).addEventListener('change', listener);
}

/** whether the image goes past white: as `choice` asks, where `support` allows it, `screenHdr` the screen now */
export function isHdrShown(choice: HdrChoice, support: HdrSupport, screenHdr: boolean): boolean {
  if (support !== 'available') return false;
  switch (choice) {
    case 'auto': return screenHdr;
    case 'on': return true;
    case 'off': return false;
    default: return assertNever(choice);
  }
}
