// The cinema pass: the last full-screen touch of the image.

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The last touch of the image, after tone mapping (display values): a
 * vignette centred on the free part of the screen, a fine animated grain
 * (stronger in the darks, as on film; it also dithers the gradients of the
 * dark backdrop), a slight split toning (cool shadows, warm highlights) and a
 * hint of chromatic aberration towards the corners. One full-screen pass,
 * three texture reads.
 */
const CinemaShader = {
  name: 'CinemaShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    /** centre of the vignette (uv) and aspect ratio of the screen */
    centre: { value: new THREE.Vector2(0.5, 0.5) },
    aspect: { value: 1 },
    vignette: { value: 0.32 },
    grain: { value: 0.045 },
    aberration: { value: 0.0025 },
    tone: { value: 0.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 centre;
    uniform float aspect;
    uniform float vignette;
    uniform float grain;
    uniform float aberration;
    uniform float tone;
    varying vec2 vUv;

    // hash without sine (Dave Hoskins): no visible pattern, cheap
    float hash12(vec3 p3) {
      p3 = fract(p3 * 0.1031);
      p3 += dot(p3, p3.zyx + 31.32);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 d = vUv - centre;
      // squared distance, round on screen: 0 at the centre, 1 in the corners of a centred frame
      vec2 dr = d * vec2(aspect, 1.0);
      float r2 = dot(dr, dr) / (0.25 * (aspect * aspect + 1.0));

      // lateral chromatic aberration, nothing in the middle
      vec2 off = d * r2 * aberration;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // split toning: shadows towards teal, highlights towards warm
      vec3 shadowTint = vec3(-0.6, 0.1, 0.5), lightTint = vec3(0.5, 0.1, -0.6);
      col += tone * mix(shadowTint * (1.0 - luma), lightTint * luma, luma);

      // vignette: a soft optical fall-off
      col *= mix(1.0, 1.0 - vignette, smoothstep(0.15, 1.0, r2));

      // grain: monochrome, new every frame, mostly in the darks and mids
      float n = hash12(vec3(gl_FragCoord.xy, fract(time) * 977.0)) + hash12(vec3(gl_FragCoord.yx + 17.0, fract(time) * 613.0)) - 1.0;
      col += n * grain * (1.0 - 0.7 * luma);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class CinemaPass extends ShaderPass {
  constructor() {
    super(CinemaShader);
  }

  /** frames the vignette on the free part of the screen (panels in px), and steps the grain */
  /** `margins`: the screen the panels cover; the vignette centres on the rest */
  frame(dt: number, w: number, h: number, margins: { left: number; right: number; top: number; bottom: number }): void {
    const u = this.uniforms;
    u.time.value = (u.time.value + dt) % 1000;
    u.aspect.value = w / Math.max(1, h);
    const fw = Math.max(1, w - margins.left - margins.right), fh = Math.max(1, h - margins.top - margins.bottom);
    (u.centre.value as THREE.Vector2).set((margins.left + fw / 2) / w, 1 - (margins.top + fh / 2) / h);
  }
}
