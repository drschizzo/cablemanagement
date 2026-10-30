// The glow of what is brighter than white (the LEDs, the light strips, the
// screens): the bright parts of the image, blurred at five sizes, each half
// the one before, and added back. What three.js's UnrealBloomPass did, built
// from public nodes here so that the weight of each size stays in the game's
// hands: the halo tightens as the camera backs away (see fit).

import * as THREE from 'three/webgpu';
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js';
import { tsl, type ShaderNode } from './tsl';

const { Fn, float, luminance, min, mix, select, smoothstep, uniform, vec3, vec4 } = tsl;

/**
 * Luminance (linear, white = 1) from which a pixel glows: above any surface
 * the lamps light, below the LEDs (LED_LUMA, leds.ts).
 */
const THRESHOLD = 3;
/** how soft the threshold is */
const SMOOTH_WIDTH = 0.01;
/**
 * The brightest a pixel glows: on some GPUs a NaN or an infinity, from a
 * division somewhere in the frame, spread over the whole chain and the screen
 * flashed black.
 */
const MAX_GLOW = 1000;
/** the blur of each size, in its own pixels (UnrealBloomPass's kernels of 3 to 11 texels, as standard deviations) */
const SIGMAS = [1.6, 2.7, 3.8, 4.9, 6];

/**
 * The glow close to the cabinet and from afar. The blur spreads over a set
 * number of pixels, while the lights shrink with the distance: the same halo
 * that suits a light a few pixels wide drowned one seen from across the room.
 * It tightens and dims as the camera backs away (distance to what it looks at,
 * m, on a log scale between the two).
 */
const FIT = {
  near: { at: 1.2, strength: 0.6, radius: 0.5, sizes: [1, 0.8, 0.6, 0.4, 0.2] },
  // even at radius 0 the wide sizes of the blur kept most of their weight: their share falls too
  far: { at: 5, strength: 0.3, radius: 0, sizes: [1, 0.25, 0.05, 0, 0] },
};
/** the pixels a point the glow was tuned at: 2 (see QUALITY in quality.ts) */
const TUNED_RATIO = 2;

/** The glow of an image, to add to it. */
export class Bloom {
  /** the glow (linear RGB) */
  readonly node: ShaderNode;
  private strength = uniform(FIT.near.strength);
  /** UnrealBloomPass's radius: 0 keeps the weights of the sizes, 1 turns them round (the wide ones weigh most) */
  private radius = uniform(FIT.near.radius);
  private weights = FIT.near.sizes.map((w) => uniform(w));
  private blurs: { dispose(): void }[] = [];

  /** `image`: linear HDR */
  constructor(image: ShaderNode) {
    const bright = Fn(() => {
      const c = image.rgb;
      const luma = luminance(c);
      // (a NaN fails every comparison, an infinity the second)
      const finite = luma.greaterThanEqual(0).and(luma.lessThan(1e30));
      const glow = select(finite, min(c, vec3(MAX_GLOW)), vec3(0));
      return vec4(glow.mul(smoothstep(THRESHOLD, THRESHOLD + SMOOTH_WIDTH, luma)), 1);
    })();
    let level: ShaderNode = bright;
    let sum: ShaderNode = vec3(0);
    SIGMAS.forEach((sigma, k) => {
      const blur = gaussianBlur(level, null, sigma, { resolutionScale: 0.5 });
      this.blurs.push(blur);
      const w = this.weights[k];
      sum = sum.add(blur.rgb.mul(mix(w, float(1.2).sub(w), this.radius)));
      level = blur.getTextureNode();
    });
    this.node = sum.mul(this.strength);
  }

  /**
   * Fits the glow to the camera: `viewDistance` (m) to what it looks at,
   * `pixelRatio` drawing-buffer pixels a CSS pixel.
   */
  fit(viewDistance: number, pixelRatio: number): void {
    const { near, far } = FIT;
    const t = THREE.MathUtils.clamp(Math.log(viewDistance / near.at) / Math.log(far.at / near.at), 0, 1);
    this.strength.value = THREE.MathUtils.lerp(near.strength, far.strength, t);
    this.radius.value = THREE.MathUtils.lerp(near.radius, far.radius, t);
    // the blur of each size spans a set number of its pixels: at fewer pixels than it was tuned at,
    // size i covers the screen that size i + shift did, and takes its weight
    const shift = Math.log2(TUNED_RATIO / pixelRatio);
    const count = this.weights.length;
    const at = (i: number) => (i < count ? THREE.MathUtils.lerp(near.sizes[i], far.sizes[i], t) : 0);
    this.weights.forEach((w, i) => {
      const j = i + shift, k = Math.floor(j);
      w.value = THREE.MathUtils.lerp(at(k), at(k + 1), j - k);
    });
  }

  dispose(): void {
    for (const b of this.blurs) b.dispose();
  }
}
