// The cinema pass: the last full-screen touch of the image.

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';
import type { ScreenMargins } from './stage';

const { Fn, dot, fract, mix, min, max, screenCoordinate, smoothstep, uniform, uv, vec2, vec3, vec4 } = tsl;

/** how dark the corners go (share of the light lost) */
const VIGNETTE = 0.32;
/** how strong the grain is, in the darks */
const GRAIN = 0.045;
/** how far the colours part in the corners (uv) */
const ABERRATION = 0.0025;
/** how strongly the shadows lean teal and the highlights warm */
const TONE = 0.04;

/** hash without sine (Dave Hoskins): no visible pattern, cheap */
const hash = (p: ShaderNode) => {
  const q = fract(p.mul(0.1031)).toVar();
  q.addAssign(dot(q, q.zyx.add(31.32)));
  return fract(q.x.add(q.y).mul(q.z));
};

/**
 * The last touch of the image, after tone mapping (display values): a
 * vignette centred on the free part of the screen, a fine animated grain
 * (stronger in the darks, as on film; it also dithers the gradients of the
 * dark backdrop), a slight split toning (cool shadows, warm highlights) and a
 * hint of chromatic aberration towards the corners. What is brighter than
 * white (an HDR image) takes the vignette only: the toning and the grain are
 * those of the image up to white.
 */
export class Cinema {
  /** the image, touched */
  readonly node: ShaderNode;
  private time = uniform(0);
  /** centre of the vignette (uv) and aspect ratio of the screen */
  private centre = uniform(new THREE.Vector2(0.5, 0.5));
  private aspect = uniform(1);

  /** `image`: the image tone-mapped (display values), as a texture */
  constructor(image: ShaderNode) {
    this.node = Fn(() => {
      const at = uv();
      const d = at.sub(this.centre);
      // squared distance, round on screen: 0 at the centre, 1 in the corners of a centred frame
      const dr = d.mul(vec2(this.aspect, 1));
      const r2 = dot(dr, dr).div(this.aspect.mul(this.aspect).add(1).mul(0.25));
      // lateral chromatic aberration, nothing in the middle
      const off = d.mul(r2).mul(ABERRATION);
      const col = vec3(image.sample(at.sub(off)).r, image.sample(at).g, image.sample(at.add(off)).b);
      const base = min(col, vec3(1));
      const above = col.sub(base);
      const luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
      // split toning: shadows towards teal, highlights towards warm
      const shadowTint = vec3(-0.6, 0.1, 0.5), lightTint = vec3(0.5, 0.1, -0.6);
      const toned = base.add(mix(shadowTint.mul(luma.oneMinus()), lightTint.mul(luma), luma).mul(TONE));
      // grain: monochrome, new every frame, mostly in the darks and mids
      const p = screenCoordinate.xy;
      const t = fract(this.time);
      const n = hash(vec3(p, t.mul(977))).add(hash(vec3(p.yx.add(17), t.mul(613)))).sub(1);
      const grained = max(vec3(0), min(vec3(1), toned.add(n.mul(GRAIN).mul(luma.mul(0.7).oneMinus()))));
      // vignette: a soft optical fall-off
      const fall = mix(1, 1 - VIGNETTE, smoothstep(0.15, 1, r2));
      return vec4(grained.add(above).mul(fall), 1);
    })();
  }

  /** frames the vignette on the free part of the screen (`margins`: what the panels cover, px), and steps the grain */
  frame(dt: number, w: number, h: number, margins: ScreenMargins): void {
    this.time.value = (this.time.value + dt) % 1000;
    this.aspect.value = w / Math.max(1, h);
    const fw = Math.max(1, w - margins.left - margins.right), fh = Math.max(1, h - margins.top - margins.bottom);
    // (uv from the top: WebGPU's screen)
    this.centre.value.set((margins.left + fw / 2) / w, (margins.top + fh / 2) / h);
  }
}
