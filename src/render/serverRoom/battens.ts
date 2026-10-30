// The server room's LED battens, hung over the aisle: their body, and their
// light: the opal diffuser under each, a faint sheet of light in the haze
// below it, soft on every side and stirred by slow currents of air, a long
// pool of light on the floor, and dust glinting as it drifts through.
//
// The haze is not a surface: drawn as one (a cone seen from both sides), what
// stood in it cut its far side away, and every rack and tray crossing it left
// a step of light along its edges. Each pixel of a batten's box instead adds
// up the haze along the ray from where the ray enters the box to where it
// leaves it, through what may stand inside: no edge shows.

import * as THREE from 'three/webgpu';
import { LED_CLOCK_WRAP, ledClock, ledViewHeight } from '../leds';
import { tsl, type ShaderNode } from '../tsl';
import { keepOutOfDepth } from '../imagePipeline';
import { shared } from '../dispose';
import { RoomParts } from './roomParts';

const {
  Fn, Loop, abs, cameraPosition, cameraProjectionMatrix, dot, exp, float, fract, instancedBufferAttribute, length, max,
  min, mix, modelViewMatrix, normalize, positionLocal, positionWorld, pow, screenCoordinate, screenDPR, sin, smoothstep, uv,
  varying, vec2, vec3, vec4,
} = tsl;

const TWO_PI = Math.PI * 2;

/** the diffusers under the battens, above the floor (m) */
const LAMP_Y = 2.55;
/** a batten: its length along the aisle (+z of its own frame), the width of its diffuser (m) */
const LAMP_LENGTH = 1.2;
const DIFFUSER_W = 0.05;
/** the tint of the light */
const HAZE_COLOR = new THREE.Color('#a9c8ff');
/** how bright the haze is, added up along a ray; the pool on the floor */
const HAZE_GLOW = 0.1;
const POOL_GLOW = 0.035;
/** how far the haze spreads either side of a batten, at the floor (m) */
const FLOOR_SPREAD = 0.5;
/** how far it reaches past the ends of a batten, at the floor (m) */
const END_SPREAD = 0.3;
/** the box the haze of a batten fills: half its width, half its length (m) */
const BOX_X = FLOOR_SPREAD * 1.6;
const BOX_Z = LAMP_LENGTH / 2 + END_SPREAD + 0.35;
/** the longest way across that box (m) */
const BOX_CHORD = Math.hypot(BOX_X * 2, LAMP_Y, BOX_Z * 2);
/** the steps a ray takes through the haze (jittered: the grain of the cinema pass hides the noise) */
const HAZE_STEPS = 24;
/**
 * How bright a diffuser is: its middle well over the bloom threshold, so that
 * it shines, a thin line of light past white on an HDR screen; its edges
 * under the threshold.
 */
const DIFFUSER_CORE = 9;
const DIFFUSER_EDGE = 2.5;
/** motes of dust under each batten */
const DUST_MOTES = 150;
/** the smallest a mote is drawn (px): smaller, it flickered in and out */
const MOTE_MIN_PX = 1.5;

/** the light of the battens at `lamps` (each running along z), on the floor at y = 0 of their group */
export function battenLight(lamps: { x: number; z: number }[], random: () => number): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(BOX_X * 2, LAMP_Y, BOX_Z * 2).translate(0, LAMP_Y / 2, 0);
  const pool = new THREE.PlaneGeometry(BOX_X * 2, BOX_Z * 2).rotateX(-Math.PI / 2).translate(0, 0.002, 0);
  // facing down, just under the batten's body
  const diffuser = new THREE.PlaneGeometry(DIFFUSER_W, LAMP_LENGTH - 0.03).rotateX(Math.PI / 2).translate(0, LAMP_Y, 0);
  const diffuserMat = diffuserMaterial(), poolMat = poolMaterial();
  for (const l of lamps) {
    const seed = random() * 100;
    for (const [geo, material] of [[box, hazeMaterial(seed)], [pool, poolMat], [diffuser, diffuserMat]] as const) {
      const m = new THREE.Mesh(geo, material);
      m.position.set(l.x, 0, l.z);
      g.add(m);
    }
  }
  g.add(dust(lamps, random));
  return g;
}

/**
 * An LED batten hung over the aisle, LAMP_LENGTH long along +z: a slim body of
 * aluminium, its opal diffuser under it at LAMP_Y (its light: see battenLight), its
 * end caps, and two wires rising out of sight into the dark.
 */
export function battenBody(): RoomParts {
  const y = LAMP_Y, length = LAMP_LENGTH;
  const parts = new RoomParts();
  parts.box(0.07, 0.04, length, 0, y + 0.022, 0, '#8d9096');
  for (const s of [-1, 1]) {
    parts.box(0.074, 0.044, 0.012, 0, y + 0.022, s * length / 2, '#2a2b2e');
    parts.solid(new THREE.CylinderGeometry(0.0015, 0.0015, 1.2, 6).translate(0, y + 0.042 + 0.6, s * length * 0.35), '#2a2b2e');
  }
  return parts;
}

/** a light added to the image, drawn over what lies behind it and writing no depth */
function glowMaterial(glow: ShaderNode, side: THREE.Side = THREE.DoubleSide): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side, blending: THREE.AdditiveBlending, fog: false });
  m.colorNode = vec4(vec3(HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b).mul(glow), 1);
  return keepOutOfDepth(m);
}

/** whole turns while the clock goes round (see ledClock): the motion never jumps when it wraps */
const turns = (n: number) => ledClock.mul(TWO_PI * n / LED_CLOCK_WRAP);

/** how far the haze spreads either side of a batten at the share `h` of its height */
const spreadAt = (h: ShaderNode) => mix(FLOOR_SPREAD, DIFFUSER_W, h);

/** the diffuser under a batten: a line of white light, tinted towards its edges, dimmer at its ends */
function diffuserMaterial(): THREE.MeshBasicNodeMaterial {
  const across = abs(positionLocal.x).div(DIFFUSER_W / 2);
  const along = abs(positionLocal.z).div((LAMP_LENGTH - 0.03) / 2);
  const glow = mix(DIFFUSER_CORE, DIFFUSER_EDGE, smoothstep(0.2, 1, across)).mul(smoothstep(1, 0.9, along).mul(0.5).add(0.5));
  const tint = mix(vec3(1, 1, 1), vec3(HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b), smoothstep(0.3, 1, across));
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.colorNode = vec4(tint.mul(glow), 1);
  return m;
}

/**
 * The haze under a batten, seen from outside its box: added up from where the
 * ray enters the box (this face) to where it leaves it.
 */
function hazeMaterial(seed: number): THREE.MeshBasicNodeMaterial {
  const density = (p: ShaderNode) => {
    const h = p.y.div(LAMP_Y);
    const w = spreadAt(h);
    const x = p.x.div(w);
    // falling off softly either side, and past the ends, the more so lower down
    const across = exp(x.mul(x).mul(-2.5));
    const reach = mix(LAMP_LENGTH / 2 + END_SPREAD, LAMP_LENGTH / 2, h);
    const along = smoothstep(reach.add(0.3), reach.sub(0.3), abs(p.z));
    // densest just under the batten, thinning as it spreads, gone before the floor and above the batten
    const height = smoothstep(0, 0.45, h).mul(mix(0.3, 1, h.mul(h))).mul(smoothstep(1, 0.985, h));
    // slow currents of air drifting down through it
    const stir = sin(p.z.mul(5).add(p.y.mul(2.5)).add(turns(23)).add(seed)).mul(0.15)
      .add(sin(p.x.mul(11).sub(p.y.mul(4)).add(turns(41)).sub(seed)).mul(0.1))
      .add(0.75);
    return across.mul(along).mul(height).mul(stir);
  };
  const glow = Fn(() => {
    // the box is only moved, never turned: local and world axes agree
    const entry = positionLocal;
    const dir = normalize(positionWorld.sub(cameraPosition));
    // where the ray leaves the box: along each axis, at the face it heads for. Divided by the
    // ray's own coordinate, never below a small value: one nudged off 0 still crossed it on a
    // column of pixels, which then shone as a line (a division by 0)
    const rate = max(abs(dir), 1e-4);
    const ahead = entry.sub(vec3(0, LAMP_Y / 2, 0)).mul(dir.div(rate));
    const t = vec3(BOX_X, LAMP_Y / 2, BOX_Z).sub(ahead).div(rate);
    // and never further than across the box (a ray grazing a face)
    const exit = min(min(min(t.x, t.y), t.z), BOX_CHORD);
    const step = max(exit, 0).div(HAZE_STEPS);
    const jitter = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
    const sum = float(0).toVar();
    Loop({ start: 0, end: HAZE_STEPS, type: 'int' }, ({ i }: { i: ShaderNode }) => {
      sum.addAssign(density(entry.add(dir.mul(float(i).add(jitter).mul(step)))));
    });
    return sum.mul(step).mul(HAZE_GLOW);
  })();
  return glowMaterial(glow, THREE.FrontSide);
}

/** the light on the floor under a batten: long, soft at its sides and ends */
function poolMaterial(): THREE.MeshBasicNodeMaterial {
  const x = positionLocal.x.div(FLOOR_SPREAD);
  const across = exp(x.mul(x).mul(-2));
  const along = smoothstep(LAMP_LENGTH / 2 + END_SPREAD + 0.3, LAMP_LENGTH / 2 - 0.1, abs(positionLocal.z));
  return glowMaterial(across.mul(along).mul(POOL_GLOW));
}

/**
 * Motes of dust under the battens, falling slowly and drifting as they go,
 * glinting as they turn: one sprite each, drawn as a soft round point.
 */
function dust(lamps: { x: number; z: number }[], random: () => number): THREE.Sprite {
  const base: number[] = [], spot: number[] = [];
  for (const l of lamps) {
    for (let k = 0; k < DUST_MOTES; k++) {
      base.push(l.x, 0, l.z);
      // across the haze (more of them in its middle), along it, height at time 0, how fast it falls (whole turns)
      spot.push(random() + random() - 1, random() * 2 - 1, random(), 2 + Math.round(random() * 5));
    }
  }
  const at = instancedBufferAttribute(new THREE.InstancedBufferAttribute(new Float32Array(base), 3));
  const sp = instancedBufferAttribute(new THREE.InstancedBufferAttribute(new Float32Array(spot), 4));
  const across = sp.x, alongShare = sp.y, start = sp.z, fall = sp.w;
  const h = fract(start.sub(turns(1).mul(fall).div(TWO_PI)));
  const drift = sin(turns(7).add(alongShare.mul(17))).mul(0.12);
  const mote = at.add(vec3(across.add(drift).mul(spreadAt(h)), h.mul(LAMP_Y), alongShare.mul(LAMP_LENGTH / 2 + 0.1)));
  const m = keepOutOfDepth(new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }));
  m.positionNode = mote;
  // a few mm, to pixels; never below a pixel and a half, where a mote would flicker in and out
  const depth = modelViewMatrix.mul(vec4(mote, 1)).z.negate();
  const size = fract(alongShare.mul(7)).mul(0.006).add(0.005);
  m.sizeNode = max(MOTE_MIN_PX, size.mul(cameraProjectionMatrix.element(1).y).mul(ledViewHeight).mul(0.5).div(depth)).div(screenDPR);
  const along = smoothstep(0, 0.1, h).mul(smoothstep(0.85, 1, h).oneMinus());
  const glow = varying(along.mul(pow(sin(turns(220).add(alongShare.mul(31))).mul(0.5).add(0.5), 4).mul(1.1).add(0.35)));
  const d = length(uv().sub(0.5)).mul(2);
  m.colorNode = vec4(vec3(HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b).mul(glow).mul(max(0, d.oneMinus())), 1);
  const motes = new THREE.Sprite(m);
  // three gives every sprite the same quad: freeing it with a room would pull it from under the others
  shared(motes.geometry);
  motes.count = lamps.length * DUST_MOTES;
  motes.frustumCulled = false;
  return motes;
}
