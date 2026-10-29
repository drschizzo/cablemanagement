// A light bevelled box, for the thousands of small parts of the equipment.

import * as THREE from 'three';

/**
 * A box with its edges and corners cut off by `r` (at most a little under half
 * its thinnest side). Nothing in a real cabinet has a knife edge: the cut
 * catches a thin line of light along each one. Its 24 vertices are those of a
 * plain box, each keeping the normal of its face: the 12 cut edges and 8 cut
 * corners join them, and their shading turns from one face to the next as on a
 * rounded edge. 44 triangles, where a rounded box takes hundreds: what the
 * thousands of small parts of the ports can afford.
 */
export function bevelBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  return bevelTemplate(w, h, d, r).clone();
}

/** the same, made once for all its copies and shared by them: not to be changed */
export function bevelTemplate(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  // a rack has a thousand of them, nearly all alike (two a port)
  const key = `${w} ${h} ${d} ${r}`;
  let g = made.get(key);
  if (!g) made.set(key, (g = build(w, h, d, r)));
  return g;
}

const made = new Map<string, THREE.BufferGeometry>();

function build(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  r = Math.min(r, Math.min(w, h, d) * 0.45);
  const half = [w / 2, h / 2, d / 2];
  const size = [w, h, d];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  /** index of the vertex of corner (sx, sy, sz) on the face of axis a */
  const vid = (sx: number, sy: number, sz: number, a: number) => (((sx > 0 ? 1 : 0) * 4 + (sy > 0 ? 1 : 0) * 2 + (sz > 0 ? 1 : 0)) * 3 + a);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const sg = [sx, sy, sz];
    for (let a = 0; a < 3; a++) {
      // on the face of axis a: flush with it along a, pulled in by r along the two others
      const p = sg.map((g, k) => g * (k === a ? half[k] : half[k] - r));
      pos.push(...p);
      nrm.push(...sg.map((g, k) => (k === a ? g : 0)));
      // projected on the face, as a plain box is mapped
      const [u, v] = a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1];
      uv.push(p[u] / size[u] + 0.5, p[v] / size[v] + 0.5);
    }
  }
  const idx: number[] = [];
  const centre = new THREE.Vector3();
  const tri = (i: number, j: number, k: number) => {
    // wound to face outwards
    const P = (n: number) => new THREE.Vector3(pos[3 * n], pos[3 * n + 1], pos[3 * n + 2]);
    const a = P(i), b = P(j), c = P(k);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.dot(a.add(b).add(c).sub(centre)) < 0) idx.push(i, k, j);
    else idx.push(i, j, k);
  };
  const quad = (i: number, j: number, k: number, l: number) => { tri(i, j, k); tri(i, k, l); };
  // faces
  for (let a = 0; a < 3; a++) {
    const [b, c] = [(a + 1) % 3, (a + 2) % 3];
    for (const s of [-1, 1]) {
      const at = (sb: number, sc: number) => { const g = [0, 0, 0]; g[a] = s; g[b] = sb; g[c] = sc; return vid(g[0], g[1], g[2], a); };
      quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1));
    }
  }
  // edges: along axis e, between the faces of the two other axes
  for (let e = 0; e < 3; e++) {
    const [b, c] = [(e + 1) % 3, (e + 2) % 3];
    for (const sb of [-1, 1]) for (const sc of [-1, 1]) {
      const at = (se: number, a: number) => { const g = [0, 0, 0]; g[e] = se; g[b] = sb; g[c] = sc; return vid(g[0], g[1], g[2], a); };
      quad(at(-1, b), at(1, b), at(1, c), at(-1, c));
    }
  }
  // corners
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri(vid(sx, sy, sz, 0), vid(sx, sy, sz, 1), vid(sx, sy, sz, 2));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
