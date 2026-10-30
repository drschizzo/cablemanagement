// The depth of field: the room round the subject blurred, more the further
// it stands from it, as a lens focused close on it would. The cabinet of a
// level stays sharp; the racks beside and behind it soften, their lights
// opening into discs.

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';

const {
  Fn, If, Loop, clamp, cos, distance, dot, float, fract, getViewPosition, max, screenCoordinate, select, sin, smoothstep, sqrt, uniform,
  uv,
  vec2, vec3, vec4,
} = tsl;

/** over how much further than the sharp reach the blur grows to its full (m) */
const BLUR_SPAN = 1.4;
/** the widest blur (px across its radius, at 1 px a CSS pixel) */
const MAX_BLUR_PX = 6;
/**
 * How much more a light counts in the discs round it than a lit surface, by
 * how far it is brighter than white: a light opens into a clear disc, where
 * it was lost in the average of the room.
 */
const BOKEH_BOOST = 1.2;
/** samples of a pixel's neighbours: enough for a disc, not a spray */
const SAMPLES = 40;
/** the golden angle (rad): Vogel's spiral */
const GOLDEN_ANGLE = 2.39996;

/**
 * The blur of a pixel grows with how far what it shows stands from the
 * subject (in the room, not only in depth: a rack beside the cabinet blurs as
 * well as one behind it). Each pixel gathers its neighbours over a disc as
 * wide as its blur, on a spiral (Vogel's) turned at random from pixel to
 * pixel; a neighbour counts only as far as its own blur reaches the pixel, so
 * a sharp edge (the cabinet) never smears over the blurred room round it.
 * Before tone mapping (linear HDR), the lights weighted up: out of focus,
 * they spread into round, even discs, as through a lens.
 */
export class DepthOfField {
  /** the image, blurred round the subject */
  readonly node: ShaderNode;
  private projectionInverse: ShaderNode;
  /** the subject, seen from the camera (m), and how far round it everything stays sharp */
  private subject = uniform(new THREE.Vector3());
  private sharpReach = uniform(1);
  /** the widest blur (px) and the size of a pixel (uv) */
  private maxBlur = uniform(MAX_BLUR_PX);
  private texel = uniform(new THREE.Vector2(1, 1));

  /** `image`: linear HDR, as a texture; `depth`: the depth of the scene drawn into it */
  constructor(image: ShaderNode, depth: ShaderNode, private camera: THREE.PerspectiveCamera) {
    this.projectionInverse = uniform(camera.projectionMatrixInverse);
    /** the blur of the pixel at `at` (px, the radius of its disc) */
    const blurAt = (at: ShaderNode) => {
      const d = depth.sample(at).x;
      const away = distance(getViewPosition(at, d, this.projectionInverse), this.subject);
      const blur = this.maxBlur.mul(smoothstep(0, 1, away.sub(this.sharpReach).div(BLUR_SPAN)));
      // nothing drawn (the backdrop): as blurred as it gets
      return select(d.greaterThanEqual(1), this.maxBlur, blur);
    };
    /** how much a colour counts in the discs: a light (brighter than white) more */
    const bokeh = (c: ShaderNode) => max(0, dot(c, vec3(0.2126, 0.7152, 0.0722)).sub(1)).mul(BOKEH_BOOST).add(1);
    this.node = Fn(() => {
      const at = uv();
      const own = image.sample(at);
      const r = blurAt(at);
      const result = vec4(own).toVar();
      If(r.greaterThanEqual(0.5), () => {
        const w0 = bokeh(own.rgb);
        const sum = own.rgb.mul(w0).toVar();
        const weight = float(w0).toVar();
        // the spiral turned at random from one pixel to the next: a light blurred into a disc, not into
        // a ring of copies of itself (the grain of the cinema pass hides the noise)
        const turn = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)).mul(Math.PI * 2);
        Loop({ start: 1, end: SAMPLES, type: 'int' }, ({ i }: { i: ShaderNode }) => {
          const k = float(i);
          const rad = sqrt(k.add(0.5).div(SAMPLES)).mul(r);
          const a = k.mul(GOLDEN_ANGLE).add(turn);
          const there = at.add(vec2(cos(a), sin(a)).mul(rad).mul(this.texel));
          const c = image.sample(there).rgb;
          const w = clamp(blurAt(there).sub(rad).add(1), 0, 1).mul(bokeh(c));
          sum.addAssign(c.mul(w));
          weight.addAssign(w);
        });
        result.assign(vec4(sum.div(weight), own.a));
      });
      return result;
    })();
  }

  /**
   * Focused on `subject` (world, m), sharp `sharpReach` m round it; on a
   * drawing buffer of `width` × `height` px at `pixelRatio` px a CSS pixel.
   */
  frame(subject: THREE.Vector3, sharpReach: number, width: number, height: number, pixelRatio: number): void {
    // where the camera stands now (it moved since the last image was drawn)
    this.camera.updateMatrixWorld();
    this.subject.value.copy(subject).applyMatrix4(this.camera.matrixWorldInverse);
    this.sharpReach.value = sharpReach;
    this.maxBlur.value = MAX_BLUR_PX * pixelRatio;
    this.texel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }
}
