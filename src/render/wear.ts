// The wear of years on the cabinet's painted metal and plastic: grime
// mottling it, fine scratches down to the bare metal where things were slid
// in and out, dust settled on what faces up. Drawn in the shader from where a
// point is in the world (the cabinet's parts have no UVs worth the name, and
// two cabinets side by side are not worn alike).

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';

const { positionWorld, normalWorld, mx_noise_float, mx_noise_vec3, mx_fractal_noise_float, materialColor, materialRoughness, materialMetalness, smoothstep, mix, abs, vec3, fwidth, max, clamp } = tsl;

/** how worn a material is: scratches (bare metal), grime (darker, duller), dust (on what faces up) */
export interface Wear {
  scratches: number;
  grime: number;
  dust: number;
}

/** the colour of the metal under the paint, dulled; of the dust */
const BARE = new THREE.Color('#9a9894');
const DUST = new THREE.Color('#5c5c5a');

/** `m`, worn by `w`; its colour, roughness and metalness nodes set (keep one material per wear: three keys shaders by nodes) */
export function worn<T extends THREE.MeshStandardNodeMaterial>(m: T, w: Wear): T {
  const p = positionWorld;
  const flat = smoothstep(0.7, 0.9, abs(normalWorld.y));
  const up = smoothstep(0.55, 0.95, normalWorld.y);
  // grime: several octaves, fine, never one blob of a single size
  const grime = clamp(mx_fractal_noise_float(p.mul(14), 4, 2.3, 0.55).mul(0.5).add(0.5).mul(mx_noise_float(p.mul(2.2).add(3)).mul(0.3).add(0.7)), 0, 1);

  // scratches: the thin zero lines of a noise stretched along them, a few cm apart, cut into
  // strokes of their own length and depth, more in some places than others. Bent and turned a little by
  // a warp of the space, so that no two run quite alike. On an upright face, down (things slid in)
  // and across (things slid along); on a flat one, front to back (things pushed in).
  const q = p.add(mx_noise_vec3(p.mul(7).add(19)).mul(0.012));
  const shear = mx_noise_float(p.mul(2.5).add(61)).mul(0.5);
  const line = (n: ShaderNode) => smoothstep(0, max(fwidth(n), 0.002), abs(n)).oneMinus();
  const stroke = (n: ShaderNode) => smoothstep(0.34, 0.5, n);
  const depth = mx_noise_float(q.mul(37).add(83)).mul(0.3).add(0.7);
  const down = line(mx_noise_float(vec3(q.x.add(q.y.mul(shear)), q.y, q.z.add(q.y.mul(shear))).mul(vec3(40, 2, 40))))
    .mul(stroke(mx_noise_float(q.mul(vec3(9, 22, 9)).add(17))));
  const across = line(mx_noise_float(vec3(q.x, q.y.add(q.x.add(q.z).mul(shear)), q.z).mul(vec3(2, 45, 2)).add(13)))
    .mul(stroke(mx_noise_float(q.mul(vec3(24, 9, 24)).add(29))));
  const pushed = line(mx_noise_float(vec3(q.x.add(q.z.mul(shear)), q.y, q.z).mul(vec3(40, 40, 2)).add(41)))
    .mul(stroke(mx_noise_float(q.mul(vec3(9, 9, 22)).add(5))));
  // a few faint ones anywhere, more where the work was done
  const scratched = smoothstep(0.45, 0.62, mx_noise_float(p.mul(vec3(2.5, 1.2, 2.5)).add(31)).mul(0.5).add(0.5)).mul(0.6).add(0.4);
  const scratch = clamp(mix(max(down, across), pushed, flat).mul(scratched).mul(depth).mul(w.scratches * 0.8), 0, 1);

  // dust: a film on what faces up, thicker or thinner over tens of cm, its grain where it can be
  // seen (faded out where it would shimmer), wiped off in streaks where a hand or a box went
  const film = mx_fractal_noise_float(p.mul(2.5).add(7), 3, 2.2, 0.5).mul(0.3).add(0.6);
  const grainN = mx_noise_float(p.mul(260));
  const grain = mix(grainN.mul(0.5).add(0.5), 0.5, smoothstep(0.15, 0.5, fwidth(grainN)));
  const wiped = smoothstep(0.25, 0.6, mx_noise_float(vec3(q.x.add(q.z.mul(shear)), q.y, q.z).mul(vec3(9, 9, 1.2)).add(71)).mul(0.5).add(0.5));
  const dust = up.mul(film).mul(grain.mul(0.5).add(0.75)).mul(wiped.mul(0.8).oneMinus()).mul(w.dust * 0.3);

  const dirty = materialColor.mul(grime.mul(w.grime * 0.28).oneMinus());
  m.colorNode = mix(mix(dirty, vec3(DUST.r, DUST.g, DUST.b), dust), vec3(BARE.r, BARE.g, BARE.b), scratch);
  m.roughnessNode = clamp(materialRoughness.add(grime.sub(0.5).mul(w.grime * 0.25)).add(dust.mul(0.3)).sub(scratch.mul(0.1)), 0.05, 1);
  // bare steel, but brushed and dull: it is seen by the light it scatters, not the dark room it would mirror
  m.metalnessNode = mix(materialMetalness.mul(dust.oneMinus()), 0.3, scratch);
  return m;
}
