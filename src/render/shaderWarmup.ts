// Shaders built ahead, out of sight: what a scene will draw is compiled a few
// pieces at a time between frames, so that its first image does not stall on
// them while the scene on screen keeps its rate.

import type * as THREE from 'three/webgpu';
import type { Stage } from './stage';

/** how long the warm-up compiles before it lets a frame go (ms) */
const WARM_SLICE_MS = 12;

/**
 * Builds the shaders of what is under `roots` (kept out of the scene), as a
 * level draws them: lit by the lights among `roots`, the room round the
 * subject blurred. three keeps a shader while an object drawn with it lives:
 * the caller keeps `roots` for as long as the shaders should stay. Given up
 * once `stop()`: false. `progress`: the share of the pieces built (0 to 1).
 */
export async function warmShaders(stage: Stage, roots: THREE.Object3D[], stop: () => boolean, progress: (f: number) => void = () => {}): Promise<boolean> {
  const pieces: THREE.Object3D[] = [];
  for (const r of roots) r.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) pieces.push(o); });
  // the room round the subject blurred, as in a level (drawn by the next image)
  stage.warmFocus();
  await nextFrame();
  await nextFrame();
  if (stop()) return false;
  let since = performance.now();
  for (const [k, piece] of pieces.entries()) {
    if (stop()) return false;
    // lit by the cabinet's lamp and the room's light, as on screen
    stage.compile(piece, { alone: true, litBy: roots, focused: true });
    progress((k + 1) / pieces.length);
    // a few at a time, between two frames
    if (performance.now() - since > WARM_SLICE_MS) {
      await nextFrame();
      since = performance.now();
    }
  }
  return true;
}

/** the next frame, or a moment if the page draws none */
const nextFrame = () => new Promise<void>((r) => {
  let gone = false;
  const go = () => { if (!gone) { gone = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 100);
});
