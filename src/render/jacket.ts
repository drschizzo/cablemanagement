// The jacket of the cords seen close up. A smooth tube of one colour reflects
// the room as one long white streak, which reads as paint rather than PVC. The
// fragment shader gives it what a real cord shows at arm's length: the slight
// lumps of the twisted pairs under a copper jacket, a fine grain, a satin finish
// that varies, and the marking printed along it every few centimetres. All of it
// fades out once a texel of it is smaller than a pixel, so the cords look the
// same from afar (and do not shimmer).

import * as THREE from 'three/webgpu';
import { tubeCoord } from '@drschizzo/three-cable-tubes/webgpu';
import type { CordType } from '../game/cordTypes';
import { tsl, type ShaderNode } from './tsl';
import { once } from '../lib/once';

const {
  Fn, PI, TWO_PI, abs, atan, clamp, dFdx, dFdy, faceDirection, floor, fract, fwidth, luminance, materialColor,
  materialRoughness, mix, mod, normalView, normalize, positionView, select, sign, sin, smoothstep, step, texture, vec2, vec3, vec4,
  vertexColor,
} = tsl;

/** kinds of cord, the row of their marking in the atlas */
export const JACKET_KIND = { CU: 0, OS2: 1, OM4: 2, PWR: 3 } as const satisfies Record<CordType, number>;

const PRINT = [
  'CAT6A U/FTP 4x2xAWG26/7 LSZH IEC 60332-1 500 MHz  ',
  'SM OS2 9/125 G.657.A2 LSZH 2.0 mm  ',
  'MM OM4 50/125 LSZH 2.0 mm  ',
  'H05VV-F 3G1.0 mm² 10A 250V  ',
];
/** length of cord over which the atlas repeats (m) */
const PRINT_LEN = 0.11;
/** half the width of the printed band, as an angle around the cord */
const PRINT_HALF = 0.62;
/** length of cord over which the print turns once round it (m) */
const PRINT_TWIST = 0.45;
const ROW = 64;

/** the markings, white on transparent, one row per kind */
const printAtlas = once((): THREE.CanvasTexture => {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = ROW * PRINT.length;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  PRINT.forEach((text, k) => {
    g.font = `600 ${ROW * 0.62}px "Helvetica Neue", Arial, sans-serif`;
    // the text, repeated to fill the row
    const w = g.measureText(text).width;
    for (let x = 0; x < cv.width; x += w) g.fillText(text, x, ROW * (k + 0.5));
  });
  const atlas = new THREE.CanvasTexture(cv);
  atlas.wrapS = THREE.RepeatWrapping;
  atlas.anisotropy = 8;
  return atlas;
});

const hash = (n: ShaderNode) => fract(sin(n).mul(43758.5453));
/** smooth value noise along a line */
const noise = Fn(([x]: [ShaderNode]) => {
  const i = floor(x), f = fract(x);
  return mix(hash(i), hash(i.add(1)), f.mul(f).mul(f.mul(-2).add(3)));
});

/**
 * Relief of the surface (m), continuous all around (no seam where the angle
 * wraps): the twist of the pairs under a copper jacket, and a fine grain.
 */
const height = Fn(([arc, cosA, sinA, ang, kind]: ShaderNode[]) => {
  const grain = noise(arc.mul(700).add(cosA.mul(3))).mul(0.000025).add(noise(arc.mul(2600).sub(sinA.mul(7))).mul(0.000008));
  const pairs = sin(ang.mul(4).sub(arc.mul(TWO_PI).div(0.09))).mul(0.5).add(0.5).mul(0.00007);
  return grain.add(select(kind.lessThan(0.5), pairs, 0));
});

/** the normal `n` (view space) bumped by a height whose screen derivatives are `dH`, at the point `p` (Mikkelsen) */
const bump = Fn(([p, n, dH]: ShaderNode[]) => {
  const sx = dFdx(p), sy = dFdy(p);
  const r1 = sy.cross(n), r2 = n.cross(sx);
  const det = sx.dot(r1).mul(faceDirection);
  const grad = sign(det).mul(r1.mul(dH.x).add(r2.mul(dH.y)));
  return normalize(n.mul(abs(det)).sub(grad));
});

/**
 * The material of the cords' tubes and their jacket, from the cords'
 * `tubeCoord` (three-cable-tubes): length along the cord (m, at rest, so the
 * print moves with it), cos and sin of the angle around it, and its kind (the
 * tag `lay` was given: JACKET_KIND). The colour of each cord comes from its
 * vertices, darkened so that under the lamp a yellow cord reads yellow rather
 * than cream, and the room is reflected faintly, so that a cord shades round
 * under the lamp rather than evenly lit all over.
 */
export function jacketMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.55, 0.55, 0.55), roughness: 0.55, metalness: 0, envMapIntensity: 0.3 });
  const arc = tubeCoord.x, cosA = tubeCoord.y, sinA = tubeCoord.z, kind = tubeCoord.w;
  const ang = atan(sinA, cosA);
  // metres of cord per pixel: the detail goes when it would be finer than that
  const px = fwidth(arc);
  const near = smoothstep(0.0004, 0.0012, px).oneMinus();
  // the printed line winds slowly round the cord, as a real one twists: it shows on every side
  const printAng = mod(ang.sub(arc.mul(TWO_PI).div(PRINT_TWIST)).add(PI), TWO_PI).sub(PI);
  const across = printAng.div(PRINT_HALF).mul(0.5).add(0.5);
  const printUv = vec2(arc.div(PRINT_LEN), floor(kind.add(0.5)).add(0.1).add(across.mul(0.8)).div(PRINT.length).oneMinus());
  const ink = texture(printAtlas(), printUv).a
    .mul(smoothstep(0, 0.08, abs(across.mul(2).sub(1)).oneMinus()))
    .mul(step(abs(printAng), PRINT_HALF))
    .mul(smoothstep(0.0003, 0.0009, px).oneMinus());
  // (the cord's colour read here, not after: the ink is laid over it)
  const base = materialColor.rgb.mul(vertexColor().rgb);
  // dark ink on a light jacket, light ink on a dark one
  const inkColor = select(luminance(base).greaterThan(0.18), base.mul(0.18), vec3(0.75));
  // a slightly uneven tone, as extruded PVC
  const tone = noise(arc.mul(90).add(cosA)).mul(near).mul(0.06).oneMinus();
  m.colorNode = vec4(mix(base, inkColor, ink.mul(0.7)).mul(tone), 1);
  // satin up close (the long white streak of a smooth tube goes), as before from afar
  m.roughnessNode = clamp(materialRoughness.add(near.mul(noise(arc.mul(700).add(sinA.mul(2))).mul(0.14).add(0.1))).add(ink.mul(0.12)), 0.05, 1);
  const relief = height(arc, cosA, sinA, ang, kind).mul(near);
  m.normalNode = bump(positionView, normalView, vec2(dFdx(relief), dFdy(relief)));
  return m;
}
