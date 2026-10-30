// Shafts of light falling from the ceiling of the server room: a cone of
// light in the haze, soft at its edges, streaked by slowly falling currents
// of air, a pool of light where it meets the floor, and dust glinting as it
// drifts through.

import * as THREE from 'three/webgpu';
import { LED_CLOCK_WRAP, ledClock, ledViewHeight } from '../leds';
import { tsl, type ShaderNode } from '../tsl';

const {
  PI2, abs, atan, cameraProjectionMatrix, cos, dot, exp, fract, instancedBufferAttribute, length, max, mix, modelViewMatrix,
  normalView, normalize, positionLocal, positionView, pow, screenDPR, sin, smoothstep, uv, varying, vec3, vec4,
} = tsl;

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
/** the smallest a mote is drawn (px): smaller, it flickered in and out */
const MOTE_MIN_PX = 1.5;

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
      g.add(m);
    }
  }
  g.add(dust(shafts, random));
  return g;
}

/** a light added to the image, drawn over what lies behind it and writing no depth */
function glowMaterial(glow: ShaderNode): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  m.colorNode = vec4(vec3(HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b).mul(glow), 1);
  return m;
}

/** whole turns while the clock goes round (see ledClock): the motion never jumps when it wraps */
const turns = (n: number) => ledClock.mul(PI2 * n / LED_CLOCK_WRAP);

function shaftMaterial(seed: number): THREE.MeshBasicNodeMaterial {
  const local = positionLocal;
  const h = local.y.div(ROOM_CEILING);
  // the cone seen through: bright where the eye crosses it most deeply, nothing at its rim
  const through = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const soft = through.mul(through).mul(through);
  // fading out into the ceiling and onto the floor; the light spreads as it falls
  const along = smoothstep(1, 0.8, h).mul(smoothstep(0, 0.25, h)).mul(mix(0.45, 1, h));
  // streaks of denser air round the cone, drifting down and round, slowly
  const a = atan(local.z, local.x);
  const streaks = sin(a.mul(7).add(seed).add(sin(h.mul(5).add(turns(23))).mul(2))).mul(0.2)
    .add(sin(a.mul(13).sub(seed).add(h.mul(9)).add(turns(41))).mul(0.15))
    .add(sin(h.mul(17).add(turns(67)).add(a.mul(3))).mul(0.12))
    .add(0.65);
  return glowMaterial(soft.mul(along).mul(streaks).mul(SHAFT_GLOW));
}

function poolMaterial(): THREE.MeshBasicNodeMaterial {
  const d = length(positionLocal.xz).div(SHAFT_FLOOR_R);
  // the bright disc the cone lands on, and a little light spilling past it
  const pool = smoothstep(1.05, 0.7, d).mul(0.7).add(exp(d.mul(d).mul(-1.2)).mul(0.3));
  return glowMaterial(pool.mul(POOL_GLOW));
}

/**
 * Motes of dust in the shafts, falling slowly round and round them and
 * glinting as they turn: one sprite each, drawn as a soft round point.
 */
function dust(shafts: { x: number; z: number }[], random: () => number): THREE.Sprite {
  const base: number[] = [], spot: number[] = [];
  for (const s of shafts) {
    for (let k = 0; k < DUST_MOTES; k++) {
      base.push(s.x, 0, s.z);
      // angle round the shaft, share of its radius, height at time 0, how fast it falls (whole turns)
      spot.push(random() * TWO_PI, Math.sqrt(random()) * 0.8, random(), 2 + Math.round(random() * 5));
    }
  }
  const at = instancedBufferAttribute(new THREE.InstancedBufferAttribute(new Float32Array(base), 3));
  const sp = instancedBufferAttribute(new THREE.InstancedBufferAttribute(new Float32Array(spot), 4));
  const angle = sp.x, share = sp.y, start = sp.z, fall = sp.w;
  const h = fract(start.sub(turns(1).mul(fall).div(PI2)));
  const r = mix(SHAFT_FLOOR_R, SHAFT_TOP_R, h);
  const a = angle.add(turns(3));
  const u = share.add(sin(turns(7).add(angle.mul(5))).mul(0.12));
  const mote = at.add(vec3(cos(a).mul(u).mul(r), h.mul(ROOM_CEILING), sin(a).mul(u).mul(r)));
  const m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false });
  m.positionNode = mote;
  // a few mm, to pixels; never below a pixel and a half, where a mote would flicker in and out
  const depth = modelViewMatrix.mul(vec4(mote, 1)).z.negate();
  const size = fract(angle.mul(7)).mul(0.004).add(0.004);
  m.sizeNode = max(MOTE_MIN_PX, size.mul(cameraProjectionMatrix.element(1).y).mul(ledViewHeight).mul(0.5).div(depth)).div(screenDPR);
  const along = smoothstep(0, 0.1, h).mul(smoothstep(0.85, 1, h).oneMinus());
  const glow = varying(along.mul(pow(sin(turns(220).add(angle.mul(31))).mul(0.5).add(0.5), 4).mul(0.7).add(0.3)));
  const d = length(uv().sub(0.5)).mul(2);
  m.colorNode = vec4(vec3(HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b).mul(glow).mul(max(0, d.oneMinus())), 1);
  const motes = new THREE.Sprite(m);
  motes.count = shafts.length * DUST_MOTES;
  motes.frustumCulled = false;
  return motes;
}

const TWO_PI = Math.PI * 2;
