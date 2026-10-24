// The jacket of the cords seen close up. A smooth tube of one colour reflects
// the room as one long white streak, which reads as paint rather than PVC. The
// fragment shader gives it what a real cord shows at arm's length: the slight
// lumps of the twisted pairs under a copper jacket, a fine grain, a satin finish
// that varies, and the marking printed along it every few centimetres. All of it
// fades out once a texel of it is smaller than a pixel, so the cords look the
// same from afar (and do not shimmer).

import * as THREE from 'three';

/** kinds of cord, the row of their marking in the atlas */
export const JACKET_KIND = { CU: 0, OS2: 1, OM4: 2 } as const;

const PRINT = [
  'CAT6A U/FTP 4x2xAWG26/7 LSZH IEC 60332-1 500 MHz  ',
  'SM OS2 9/125 G.657.A2 LSZH 2.0 mm  ',
  'MM OM4 50/125 LSZH 2.0 mm  ',
];
/** length of cord over which the atlas repeats (m) */
const PRINT_LEN = 0.11;
/** half the width of the printed band, as an angle around the cord */
const PRINT_HALF = 0.62;
/** length of cord over which the print turns once round it (m) */
const PRINT_TWIST = 0.45;
const ROW = 64;

let atlas: THREE.CanvasTexture | null = null;

/** the markings, white on transparent, one row per kind */
function printAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
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
  atlas = new THREE.CanvasTexture(cv);
  atlas.wrapS = THREE.RepeatWrapping;
  atlas.anisotropy = 8;
  return atlas;
}

/**
 * Adds the jacket to the material of the cords. Their geometry carries
 * `jacket` (vec4): length along the cord (m, at rest, so the print moves with
 * it), cos and sin of the angle around it, and its kind.
 */
export function jacketed<T extends THREE.MeshStandardMaterial>(m: T): T {
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.uniforms.jacketPrint = { value: printAtlas() };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 jacket;\nvarying vec4 vJacket;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJacket = jacket;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D jacketPrint;
varying vec4 vJacket;
float jHash(float n) { return fract(sin(n) * 43758.5453); }
float jNoise(float x) { float i = floor(x), f = fract(x); return mix(jHash(i), jHash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
// relief of the surface (m), continuous all around (no seam where the angle wraps): the twist of the pairs under a copper jacket, and a fine grain
float jHeight(float arc, float ang, float kind) {
  float h = 0.000025 * jNoise(arc * 700.0 + cos(ang) * 3.0) + 0.000008 * jNoise(arc * 2600.0 - sin(ang) * 7.0);
  if (kind < 0.5) h += 0.00007 * (0.5 + 0.5 * sin(4.0 * ang - arc * 6.2832 / 0.09));
  return h;
}
// the bump of three.js (perturbNormalArb), under another name
vec3 jBump(vec3 p, vec3 n, vec2 dH, float fd) {
  vec3 sx = dFdx(p), sy = dFdy(p);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - g);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float jArc = vJacket.x, jKind = vJacket.w;
float jAng = atan(vJacket.z, vJacket.y);
// metres of cord per pixel: the detail goes when it would be finer than that
float jPx = fwidth(jArc);
float jNear = 1.0 - smoothstep(0.0004, 0.0012, jPx);
float jInk = 0.0;
// the printed line winds slowly round the cord, as a real one twists: it shows on every side
float jPrintAng = mod(jAng - jArc * 6.2832 / ${PRINT_TWIST.toFixed(2)} + 3.14159, 6.28318) - 3.14159;
if (abs(jPrintAng) < ${PRINT_HALF.toFixed(2)}) {
  float v = 0.5 + 0.5 * jPrintAng / ${PRINT_HALF.toFixed(2)};
  vec2 puv = vec2(jArc / ${PRINT_LEN.toFixed(3)}, 1.0 - (floor(jKind + 0.5) + 0.1 + 0.8 * v) / ${PRINT.length.toFixed(1)});
  jInk = texture2D(jacketPrint, puv).a * smoothstep(0.0, 0.08, 1.0 - abs(2.0 * v - 1.0));
}
jInk *= 1.0 - smoothstep(0.0003, 0.0009, jPx);
// dark ink on a light jacket, light ink on a dark one
float jLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3 jInkCol = jLum > 0.18 ? diffuseColor.rgb * 0.18 : vec3(0.75);
diffuseColor.rgb = mix(diffuseColor.rgb, jInkCol, jInk * 0.7);
// a slightly uneven tone, as extruded PVC
diffuseColor.rgb *= 1.0 - 0.06 * jNear * jNoise(jArc * 90.0 + vJacket.y);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
// satin up close (the long white streak of a smooth tube goes), as before from afar
roughnessFactor = clamp(roughnessFactor + jNear * (0.14 * jNoise(jArc * 700.0 + vJacket.z * 2.0) + 0.1) + 0.12 * jInk, 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (jNear > 0.0) {
  float jh = jHeight(jArc, jAng, jKind) * jNear;
  normal = jBump(-vViewPosition, normal, vec2(dFdx(jh), dFdy(jh)), faceDirection);
}`);
  };
  m.customProgramCacheKey = () => `${prevKey}-jacket`;
  return m;
}
