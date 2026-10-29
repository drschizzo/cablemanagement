// Geometry helpers for the equipment: rounded boxes and rectangles, and the
// walls of the crate.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** a box with rounded edges (r: bevel radius); made once per size, then copied (the faces of the units repeat) */
export function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const key = `${w} ${h} ${d} ${r}`;
  let g = rounded.get(key);
  if (!g) rounded.set(key, (g = new RoundedBoxGeometry(w, h, d, 2, r)));
  return g.clone();
}

const rounded = new Map<string, THREE.BufferGeometry>();

/** a centred rounded rectangle (a shape, or a hole when `hole`) */
export function roundRect(w: number, h: number, r: number, x = 0, y = 0, hole = false): THREE.Shape | THREE.Path {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  const x0 = x - w / 2, y0 = y - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x0 + r, y0);
  p.lineTo(x0 + w - r, y0);
  p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  p.lineTo(x0 + w, y0 + h - r);
  p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  p.lineTo(x0 + r, y0 + h);
  p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  p.lineTo(x0, y0 + r);
  p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}

/** a crate wall (w × h, t thick, centred, facing z): a handle slot near the top, vent slots below */
export function crateWall(w: number, h: number, t: number): THREE.BufferGeometry {
  const s = roundRect(w, h, 0.006) as THREE.Shape;
  s.holes.push(roundRect(Math.min(0.11, w * 0.4), 0.02, 0.01, 0, h / 2 - 0.025, true) as THREE.Path);
  const n = Math.floor((w - 0.06) / 0.028);
  for (let i = 0; i <= n; i++) s.holes.push(roundRect(0.011, 0.045, 0.0055, (i - n / 2) * 0.028, -h / 2 + 0.037, true) as THREE.Path);
  const bev = 0.0018;
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(t - 2 * bev) / 2);
  return dropDegenerate(g);
}

/**
 * Removes the triangles of no area from a non-indexed geometry. The bevel of an
 * extrusion leaves some where a rounded end turns back on itself (the ends of
 * the vent slots): their normal is zero, which the shader normalises into NaN,
 * and the bloom spread that one pixel over the whole screen (the image went
 * black at some distances).
 */
function dropDegenerate(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.normal, keep: number[] = [];
  for (let t = 0; t < n.count; t += 3) {
    let ok = true;
    for (let v = t; v < t + 3; v++) if (!(Math.hypot(n.getX(v), n.getY(v), n.getZ(v)) > 1e-4)) ok = false;
    if (ok) keep.push(t);
  }
  if (keep.length * 3 === n.count) return g;
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new (a.array.constructor as Float32ArrayConstructor)(keep.length * 3 * a.itemSize);
    keep.forEach((t, k) => arr.set(a.array.subarray(t * a.itemSize, (t + 3) * a.itemSize) as Float32Array, k * 3 * a.itemSize));
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  g.dispose();
  return out;
}
