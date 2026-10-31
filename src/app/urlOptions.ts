// The options a page address can carry, for testing and for showing the game:
//   ?sync        the physics on the main thread (deterministic, for automated checks)
//   ?bays=N      how many closets stand side by side in the before/after aisle (1..32)
//   ?pairs=N     how many panel / switch pairs each of them holds (1..16)
//   ?seed=N      the same first aisle every time
//   ?quality=N   the image held at that level of quality (0: full, see QUALITY), never adapted nor saved
//   ?rack=CODE   a cabinet of the editor, opened at once (its code: game/levels/customLevel.ts)
//   ?webgl       drawn with WebGL 2 even where WebGPU is there (as browsers without it draw)
//   ?hdr=0|1     the image past white on an HDR screen, or not, for this visit only (never saved)

import { SHOWCASE_DEFAULT } from '../game/levels/showcaseRack';
import { QUALITY } from '../render/quality';

export interface UrlOptions {
  syncPhysics: boolean;
  bays: number;
  /** 0: not given */
  pairs: number;
  /** 0: not given */
  seed: number;
  /** a level of QUALITY; null: not given */
  quality: number | null;
  /** the code of a cabinet of the editor; null: not given */
  rack: string | null;
  /** drawn with WebGL 2, WebGPU's fallback */
  forceWebGL: boolean;
  /** the image past white (true) or not (false), for this visit; null: not given */
  hdr: boolean | null;
}

export function readUrlOptions(search: string): UrlOptions {
  const params = new URLSearchParams(search);
  // whole numbers only: a quality of 1.5 would be no level of QUALITY
  const int = (name: string) => Math.trunc(Number(params.get(name))) || 0;
  return {
    syncPhysics: params.has('sync'),
    bays: Math.max(1, Math.min(32, int('bays') || SHOWCASE_DEFAULT.bays)),
    pairs: Math.max(0, Math.min(16, int('pairs'))),
    seed: int('seed'),
    quality: params.has('quality') ? Math.max(0, Math.min(QUALITY.length - 1, int('quality'))) : null,
    rack: params.get('rack'),
    forceWebGL: params.has('webgl'),
    hdr: params.has('hdr') ? params.get('hdr') !== '0' : null,
  };
}
