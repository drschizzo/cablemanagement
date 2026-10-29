// The depth of field: the room round the subject blurred, more the further
// it stands from it, as a lens focused close on it would. The cabinet of a
// level stays sharp; the racks beside and behind it soften, their lights
// opening into discs.

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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
const DepthOfFieldShader = {
  name: 'DepthOfFieldShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    projectionInverse: { value: new THREE.Matrix4() },
    /** the subject, seen from the camera (m), and how far round it everything stays sharp */
    subject: { value: new THREE.Vector3() },
    sharpReach: { value: 1 },
    blurSpan: { value: BLUR_SPAN },
    /** the widest blur (px) and the size of a pixel (uv) */
    maxBlur: { value: MAX_BLUR_PX },
    texel: { value: new THREE.Vector2(1, 1) },
    bokehBoost: { value: BOKEH_BOOST },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform mat4 projectionInverse;
    uniform vec3 subject;
    uniform float sharpReach;
    uniform float blurSpan;
    uniform float maxBlur;
    uniform vec2 texel;
    uniform float bokehBoost;
    varying vec2 vUv;

    /** the blur of the pixel at uv (px, the radius of its disc) */
    float blurAt(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      // nothing drawn (the backdrop): as blurred as it gets
      if (d >= 1.0) return maxBlur;
      vec4 p = projectionInverse * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      float away = distance(p.xyz / p.w, subject);
      return maxBlur * smoothstep(0.0, 1.0, (away - sharpReach) / blurSpan);
    }

    /** how much a colour counts in the discs: a light (brighter than white) more */
    float bokeh(vec3 c) {
      return 1.0 + bokehBoost * max(0.0, dot(c, vec3(0.2126, 0.7152, 0.0722)) - 1.0);
    }

    void main() {
      vec4 own = texture2D(tDiffuse, vUv);
      float r = blurAt(vUv);
      if (r < 0.5) { gl_FragColor = own; return; }
      float w0 = bokeh(own.rgb);
      vec3 sum = own.rgb * w0;
      float weight = w0;
      // the spiral turned at random from one pixel to the next: a light blurred into a disc, not into
      // a ring of copies of itself (the grain of the cinema pass hides the noise)
      float turn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
      for (int i = 1; i < ${SAMPLES}; i++) {
        float k = float(i), rad = sqrt((k + 0.5) / ${SAMPLES.toFixed(1)}) * r, a = k * 2.39996 + turn;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * rad * texel;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float w = clamp(blurAt(uv) - rad + 1.0, 0.0, 1.0) * bokeh(c);
        sum += c * w;
        weight += w;
      }
      gl_FragColor = vec4(sum / weight, own.a);
    }`,
};

export class DepthOfFieldPass extends ShaderPass {
  constructor(depth: THREE.Texture) {
    super(DepthOfFieldShader);
    this.uniforms.tDepth.value = depth;
    this.enabled = false;
  }

  /**
   * Focused on `subject` (world, m), sharp `sharpReach` m round it, seen by
   * `camera`; on a drawing buffer of `width` × `height` px at `pixelRatio` px a CSS pixel
   */
  frame(camera: THREE.PerspectiveCamera, subject: THREE.Vector3, sharpReach: number, width: number, height: number, pixelRatio: number): void {
    const u = this.uniforms;
    // where the camera stands now (it moved since the last image was drawn)
    camera.updateMatrixWorld();
    (u.projectionInverse.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.subject.value as THREE.Vector3).copy(subject).applyMatrix4(camera.matrixWorldInverse);
    u.sharpReach.value = sharpReach;
    u.maxBlur.value = MAX_BLUR_PX * pixelRatio;
    (u.texel.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }
}
