// Status and activity lights. Their glow is far brighter than anything the
// lamps light (linear HDR, several times white), so that the bloom, whose
// threshold sits between the two, makes only them shine. They blink on the
// GPU: each instance carries how, and a shared clock drives them all, so a
// cabinet full of flickering lights costs no work on the CPU.

import * as THREE from 'three';
import { patchMaterial, type MaterialPatch } from './threeCompat/materialPatch';

/** seconds, advanced by the stage every frame; shared by every blinking material */
export const ledClock = { value: 0 };

/** height of the drawing buffer (px), set by the stage: for the smallest size of a light on screen */
export const ledViewHeight = { value: 1000 };

/**
 * The smallest a light is drawn (px across). Smaller, a lens of 2 mm seen from
 * afar covered a whole pixel, part of one or none, from one zoom to the next,
 * and the bloom made each change a flash. Measured over small steps of zoom,
 * the total glow varied by 24 % at no minimum, 19 % at 2 px, 3 to 5 % at 3 px
 * (the rest: cords passing in front of the lights).
 */
const LED_MIN_PX = 3;

/**
 * Luminance of a lit LED (linear, white = 1): above the bloom threshold (see
 * stage.ts), as nothing the lamps light is. Every colour gets the same, or a
 * red or a blue one, darker to the eye, would not shine.
 */
export const LED_LUMA = 4;

/** the glow of a lit LED of this colour (in place) */
export function ledGlow(c: THREE.Color): THREE.Color {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return l > 0 ? c.multiplyScalar(LED_LUMA / l) : c;
}

/**
 * How a light blinks: `rate` > 0 flickers at random (on for a share `duty` of
 * its ticks, `rate` ticks a second: disk or network activity), `rate` < 0
 * blinks regularly at −rate Hz (on for `duty` of the period), 0 stays on.
 * `phase` keeps two lights from blinking together.
 */
export interface Blink {
  rate: number;
  duty: number;
  phase: number;
}

export const STEADY: Blink = { rate: 0, duty: 1, phase: 0 };

/** activity: busy flicker, a different rhythm for each `seed` */
export function activity(seed: number, busy = 0.75): Blink {
  const r = fract(Math.sin(seed * 12.9898) * 43758.5453);
  return { rate: 7 + r * 9, duty: busy, phase: r * 17 };
}

/** a regular blink (a heartbeat when `duty` is short) */
export function pulse(hz: number, duty: number, phase = 0): Blink {
  return { rate: -hz, duty, phase };
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** `ledOn(blink)`: how lit a light is now (0.06 to 1), for any shader that has the `ledTime` uniform */
export const LED_ON_GLSL = `
uniform float ledTime;
float ledHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float ledOn(vec3 b) {
  if (b.x > 0.0) {
    // random flicker: a new draw every tick, mostly on (lit a little when off, as a real LED seems)
    float tick = floor(ledTime * b.x + b.z);
    return mix(0.06, 1.0, step(ledHash(tick + b.z * 7.13), b.y));
  }
  if (b.x < 0.0) return mix(0.06, 1.0, step(fract(ledTime * -b.x + b.z), b.y));
  return 1.0;
}`;

/**
 * The glow comes from two attributes, per vertex or per instance:
 * `emissiveTint` (linear RGB) and `blink` (rate, duty, phase); an instanced
 * lens grows on screen up to LED_MIN_PX.
 */
export const BLINK_PATCH: MaterialPatch = {
  key: 'blink',
  vertex: [
    { after: '#include <common>', code: `attribute vec3 emissiveTint;
attribute vec3 blink;
uniform float ledViewHeight;
varying vec3 vEmissiveTint;
${LED_ON_GLSL}` },
    {
      after: '#include <begin_vertex>',
      uses: ['transformed', 'modelViewMatrix', 'instanceMatrix', 'projectionMatrix'],
      code: `vEmissiveTint = emissiveTint * ledOn(blink);
#ifdef USE_INSTANCING
  // grown on screen up to LED_MIN_PX, from its centre (the lens is a unit square scaled by its instance)
  vec4 ledCentre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float ledPixel = (projectionMatrix[3][3] == 0.0 ? -ledCentre.z : 1.0) * 2.0 / (projectionMatrix[1][1] * ledViewHeight);
  vec2 ledSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  transformed.xy *= max(vec2(1.0), ${LED_MIN_PX.toFixed(1)} * ledPixel / ledSize);
#endif`,
    },
  ],
  fragment: [
    { after: '#include <common>', code: 'varying vec3 vEmissiveTint;' },
    { after: '#include <emissivemap_fragment>', code: 'totalEmissiveRadiance += vEmissiveTint;', uses: ['totalEmissiveRadiance'] },
  ],
};

/** a standard material whose LEDs blink on the GPU (BLINK_PATCH) */
export function blinkable<T extends THREE.MeshStandardMaterial>(m: T): T {
  return patchMaterial(m, BLINK_PATCH, () => ({ ledTime: ledClock, ledViewHeight }));
}

export interface LedSpec {
  x: number;
  y: number;
  z: number;
  /** size of the lens (m) */
  w: number;
  h: number;
  color: THREE.ColorRepresentation;
  blink: Blink;
}

/** every light of a list in one instanced mesh (one draw call), blinking on its own */
export function ledMesh(specs: LedSpec[]): THREE.InstancedMesh {
  const n = Math.max(1, specs.length);
  const geo = new THREE.BoxGeometry(1, 1, 0.001);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3);
  const blink = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3);
  geo.setAttribute('emissiveTint', tint);
  geo.setAttribute('blink', blink);
  const im = new THREE.InstancedMesh(geo, blinkable(new THREE.MeshStandardMaterial({ roughness: 0.3 })), n);
  im.count = specs.length;
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  specs.forEach((s, i) => {
    im.setMatrixAt(i, m4.makeScale(s.w, s.h, 1).setPosition(s.x, s.y, s.z));
    col.set(s.color);
    im.setColorAt(i, col);
    ledGlow(col).toArray(tint.array, 3 * i);
    blink.setXYZ(i, s.blink.rate, s.blink.duty, s.blink.phase);
  });
  im.receiveShadow = true;
  return im;
}
