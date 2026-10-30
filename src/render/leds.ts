// Status and activity lights. Their glow is far brighter than anything the
// lamps light (linear HDR, several times white), so that the bloom, whose
// threshold sits between the two, makes only them shine. They blink on the
// GPU: each instance carries how, and a shared clock drives them all, so a
// cabinet full of flickering lights costs no work on the CPU.

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';
import { InstancedParts, partMatrix } from './instancedParts';

const {
  Fn, attribute, cameraProjectionMatrix, float, floor, fract, length, max, mix, modelViewMatrix, positionLocal, select, sin,
  step, uniform, varying, vec2, vec3, vec4,
} = tsl;

/** seconds, advanced by the stage every frame; shared by every blinking material */
export const ledClock = uniform(0);

/** when the clock wraps (s): kept small, so that the GPU's hash of it keeps its precision */
export const LED_CLOCK_WRAP = 600;

/** height of the drawing buffer (px), set by the stage: for the smallest size of a light on screen */
export const ledViewHeight = uniform(1000);

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
  const r = fractPart(Math.sin(seed * 12.9898) * 43758.5453);
  return { rate: 7 + r * 9, duty: busy, phase: r * 17 };
}

/** a regular blink (a heartbeat when `duty` is short) */
export function pulse(hz: number, duty: number, phase = 0): Blink {
  return { rate: -hz, duty, phase };
}

function fractPart(x: number): number {
  return x - Math.floor(x);
}

const ledHash = (n: ShaderNode) => fract(sin(n.mul(12.9898)).mul(43758.5453));

/** how lit a light blinking as `blink` (rate, duty, phase: see Blink) is now: 0.06 to 1 */
export const ledOn = Fn(([blink]: [ShaderNode]) => {
  const rate = blink.x, duty = blink.y, phase = blink.z;
  // random flicker: a new draw every tick, mostly on (lit a little when off, as a real LED seems)
  const flicker = mix(0.06, 1, step(ledHash(floor(ledClock.mul(rate).add(phase)).add(phase.mul(7.13))), duty));
  const regular = mix(0.06, 1, step(fract(ledClock.mul(rate.negate()).add(phase)), duty));
  return select(rate.greaterThan(0), flicker, select(rate.lessThan(0), regular, float(1)));
});

/**
 * Where a vertex of a light's lens lies: placed by its copy, and grown on
 * screen up to LED_MIN_PX from its centre (the lens is a unit square scaled by
 * its copy).
 */
const GROWN_LENS = Fn(() => {
  const centre = partMatrix.element(3).xyz;
  const size = vec2(length(partMatrix.element(0).xyz), length(partMatrix.element(1).xyz));
  const placed = partMatrix.mul(vec4(positionLocal, 1)).xyz;
  const view = modelViewMatrix.mul(vec4(centre, 1));
  const projection = cameraProjectionMatrix;
  // the size of a pixel (m) at the depth of the light; a perspective projection has no 1 in its corner
  const depth = select(projection.element(3).w.equal(0), view.z.negate(), float(1));
  const pixel = depth.mul(2).div(projection.element(1).y.mul(ledViewHeight));
  const grow = max(vec2(1), pixel.mul(LED_MIN_PX).div(size));
  return vec3(placed.xy.sub(centre.xy).mul(grow).add(centre.xy), placed.z);
})();

/** the glow of a light, as it blinks (one node for all) */
const LED_GLOW = varying(attribute('emissiveTint', 'vec3').mul(ledOn(attribute('blink', 'vec3'))));

/**
 * The material of the lights: their glow comes from two attributes, per
 * vertex or per instance, `emissiveTint` (linear RGB) and `blink` (rate,
 * duty, phase); the lens of each copy grows on screen up to LED_MIN_PX
 * (drawn by InstancedParts).
 */
export function ledMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3 });
  m.emissiveNode = LED_GLOW;
  m.positionNode = GROWN_LENS;
  return m;
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
export function ledMesh(specs: LedSpec[]): InstancedParts {
  const n = Math.max(1, specs.length);
  const geo = new THREE.BoxGeometry(1, 1, 0.001);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3);
  const blink = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3);
  geo.setAttribute('emissiveTint', tint);
  geo.setAttribute('blink', blink);
  const im = new InstancedParts(geo, ledMaterial(), n);
  im.drawn = specs.length;
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
