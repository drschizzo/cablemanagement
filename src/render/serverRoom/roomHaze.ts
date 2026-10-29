// Shafts of light falling from the ceiling of the server room: a cone of
// light in the haze, soft at its edges, streaked by slowly falling currents
// of air, a pool of light where it meets the floor, and dust glinting as it
// drifts through.

import * as THREE from 'three';
import { LED_CLOCK_WRAP, ledClock, ledViewHeight } from '../leds';
import { keepOutOfDepth } from '../threeCompat/passes';

/** the ceiling the shafts fall from, above the floor (m) */
export const ROOM_CEILING = 2.7;
/** the tint of the light */
const HAZE_COLOR = new THREE.Color('#9cc3ff');
/** how bright the haze of a shaft is, at its heart; and its pool on the floor */
const SHAFT_GLOW = 0.09;
const POOL_GLOW = 0.05;
/** the radius of a shaft at the ceiling and on the floor (m) */
const SHAFT_TOP_R = 0.06;
const SHAFT_FLOOR_R = 0.5;
/** motes of dust in each shaft */
const DUST_MOTES = 90;

/** the shafts of light falling at `shafts`, on the floor at y = 0 of their group */
export function roomHaze(shafts: { x: number; z: number }[], random: () => number): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.CylinderGeometry(SHAFT_TOP_R, SHAFT_FLOOR_R, ROOM_CEILING, 48, 1, true).translate(0, ROOM_CEILING / 2, 0);
  const pool = new THREE.PlaneGeometry(SHAFT_FLOOR_R * 3, SHAFT_FLOOR_R * 3).rotateX(-Math.PI / 2).translate(0, 0.002, 0);
  for (const s of shafts) {
    const seed = random() * 100;
    for (const [geo, material] of [[cone, shaftMaterial(seed)], [pool, poolMaterial()]] as const) {
      const m = new THREE.Mesh(geo, material);
      m.position.set(s.x, 0, s.z);
      keepOutOfDepth(m);
      g.add(m);
    }
  }
  g.add(dust(shafts, random));
  return g;
}

/** a light added to the image, drawn over what lies behind it and writing no depth */
function glowMaterial(uniforms: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: HAZE_COLOR }, time: ledClock, ...uniforms },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

/** whole turns while the clock goes round (see ledClock): the motion never jumps when it wraps */
const TURNS = `const float TAU = 6.2831853;
float turns(float n) { return time * TAU * n / ${LED_CLOCK_WRAP.toFixed(1)}; }`;

function shaftMaterial(seed: number): THREE.ShaderMaterial {
  return glowMaterial({ seed: { value: seed } }, `
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`, `
uniform vec3 color;
uniform float time;
uniform float seed;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
${TURNS}
void main() {
  float h = vLocal.y / ${ROOM_CEILING.toFixed(3)};
  // the cone seen through: bright where the eye crosses it most deeply, nothing at its rim
  float through = abs(dot(normalize(vNormal), normalize(vView)));
  float soft = through * through * through;
  // fading out into the ceiling and onto the floor; the light spreads as it falls
  float along = smoothstep(1.0, 0.8, h) * smoothstep(0.0, 0.25, h) * mix(0.45, 1.0, h);
  // streaks of denser air round the cone, drifting down and round, slowly
  float a = atan(vLocal.z, vLocal.x);
  float streaks = 0.65
    + 0.2 * sin(a * 7.0 + seed + 2.0 * sin(h * 5.0 + turns(23.0)))
    + 0.15 * sin(a * 13.0 - seed + h * 9.0 + turns(41.0))
    + 0.12 * sin(h * 17.0 + turns(67.0) + a * 3.0);
  gl_FragColor = vec4(color * ${SHAFT_GLOW.toFixed(3)} * soft * along * streaks, 1.0);
}`);
}

function poolMaterial(): THREE.ShaderMaterial {
  return glowMaterial({}, `
varying vec2 vXZ;
void main() {
  vXZ = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`, `
uniform vec3 color;
uniform float time;
varying vec2 vXZ;
void main() {
  float d = length(vXZ) / ${SHAFT_FLOOR_R.toFixed(3)};
  // the bright disc the cone lands on, and a little light spilling past it
  float pool = smoothstep(1.05, 0.7, d) * 0.7 + exp(-d * d * 1.2) * 0.3;
  gl_FragColor = vec4(color * ${POOL_GLOW.toFixed(3)} * pool, 1.0);
}`);
}

/**
 * Motes of dust in the shafts, falling slowly round and round them and
 * glinting as they turn. Points, which the passes leave out of their depth.
 */
function dust(shafts: { x: number; z: number }[], random: () => number): THREE.Points {
  const base: number[] = [], spot: number[] = [];
  for (const s of shafts) {
    for (let k = 0; k < DUST_MOTES; k++) {
      base.push(s.x, 0, s.z);
      // angle round the shaft, share of its radius, height at time 0, how fast it falls (whole turns)
      spot.push(random() * TWO_PI, Math.sqrt(random()) * 0.8, random(), 2 + Math.round(random() * 5));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
  geo.setAttribute('spot', new THREE.Float32BufferAttribute(spot, 4));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { color: { value: HAZE_COLOR }, time: ledClock, viewHeight: ledViewHeight },
    vertexShader: `
attribute vec4 spot;
uniform float time;
uniform float viewHeight;
varying float vGlow;
${TURNS}
void main() {
  float h = fract(spot.z - turns(spot.w) / TAU);
  float r = mix(${SHAFT_FLOOR_R.toFixed(3)}, ${SHAFT_TOP_R.toFixed(3)}, h);
  float a = spot.x + turns(3.0);
  float u = spot.y + 0.12 * sin(turns(7.0) + spot.x * 5.0);
  vec4 mv = modelViewMatrix * vec4(position + vec3(cos(a) * u * r, h * ${ROOM_CEILING.toFixed(3)}, sin(a) * u * r), 1.0);
  gl_Position = projectionMatrix * mv;
  // a few mm, to pixels; never below one and a half, where a mote would flicker in and out
  gl_PointSize = max(1.5, (0.004 + 0.004 * fract(spot.x * 7.0)) * projectionMatrix[1][1] * viewHeight * 0.5 / -mv.z);
  float along = smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.85, 1.0, h));
  vGlow = along * (0.3 + 0.7 * pow(0.5 + 0.5 * sin(turns(220.0) + spot.x * 31.0), 4.0));
}`,
    fragmentShader: `
uniform vec3 color;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(color * vGlow * max(0.0, 1.0 - d), 1.0);
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  return points;
}

const TWO_PI = Math.PI * 2;
