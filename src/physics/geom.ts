// Small geometric kernels for the cable solver. Everything works on plain
// numbers and writes into module-level scratch objects, so the hot loops of
// the solver never allocate.

export const closest = { s: 0, t: 0, d2: 0 };

/**
 * Closest points between segments P(s) = p0 + s(p1 − p0) and Q(t) = q0 + t(q1 − q0),
 * s, t ∈ [0, 1] (Ericson, Real-Time Collision Detection §5.1.9).
 * Writes s, t and the squared distance into `closest`.
 */
export function segSeg(
  p0x: number, p0y: number, p0z: number, p1x: number, p1y: number, p1z: number,
  q0x: number, q0y: number, q0z: number, q1x: number, q1y: number, q1z: number,
): void {
  const d1x = p1x - p0x, d1y = p1y - p0y, d1z = p1z - p0z;
  const d2x = q1x - q0x, d2y = q1y - q0y, d2z = q1z - q0z;
  const rx = p0x - q0x, ry = p0y - q0y, rz = p0z - q0z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  const EPS = 1e-14;
  if (a <= EPS && e <= EPS) {
    s = 0; t = 0;
  } else if (a <= EPS) {
    s = 0; t = f / e; t = t < 0 ? 0 : t > 1 ? 1 : t;
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s;
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      if (denom > EPS * a * e) { s = (b * f - c * e) / denom; s = s < 0 ? 0 : s > 1 ? 1 : s; } else s = 0.5;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
      else if (t > 1) { t = 1; s = (b - c) / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    }
  }
  const dx = rx + d1x * s - d2x * t;
  const dy = ry + d1y * s - d2y * t;
  const dz = rz + d1z * s - d2z * t;
  closest.s = s; closest.t = t; closest.d2 = dx * dx + dy * dy + dz * dz;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** scratch: depth of a point under each face of a box */
const faceGap = new Float64Array(6);

export const boxHit = { s: 0, qx: 0, qy: 0, qz: 0, nx: 0, ny: 0, nz: 0, dist: 0 };

/**
 * Closest approach between a segment and an axis-aligned box. Writes the
 * segment parameter s, the point q on the box surface, the outward normal n
 * and the signed distance (negative inside). Alternating projections converge
 * in a handful of steps for two convex sets.
 */
export function segBox(
  p0x: number, p0y: number, p0z: number, p1x: number, p1y: number, p1z: number,
  minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number,
): void {
  const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
  const dd = dx * dx + dy * dy + dz * dz;
  let s = 0.5;
  let qx = 0, qy = 0, qz = 0;
  for (let k = 0; k < 4; k++) {
    const px = p0x + dx * s, py = p0y + dy * s, pz = p0z + dz * s;
    qx = px < minx ? minx : px > maxx ? maxx : px;
    qy = py < miny ? miny : py > maxy ? maxy : py;
    qz = pz < minz ? minz : pz > maxz ? maxz : pz;
    if (dd < 1e-14) break;
    s = clamp01(((qx - p0x) * dx + (qy - p0y) * dy + (qz - p0z) * dz) / dd);
  }
  const px = p0x + dx * s, py = p0y + dy * s, pz = p0z + dz * s;
  qx = px < minx ? minx : px > maxx ? maxx : px;
  qy = py < miny ? miny : py > maxy ? maxy : py;
  qz = pz < minz ? minz : pz > maxz ? maxz : pz;
  const ex = px - qx, ey = py - qy, ez = pz - qz;
  const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
  boxHit.s = s;
  if (d > 1e-9) {
    boxHit.qx = qx; boxHit.qy = qy; boxHit.qz = qz;
    boxHit.nx = ex / d; boxHit.ny = ey / d; boxHit.nz = ez / d;
    boxHit.dist = d;
    return;
  }
  // inside: leave through the nearest face
  const cands = faceGap;
  cands[0] = px - minx; cands[1] = maxx - px; cands[2] = py - miny; cands[3] = maxy - py; cands[4] = pz - minz; cands[5] = maxz - pz;
  let best = 0;
  for (let i = 1; i < 6; i++) if (cands[i] < cands[best]) best = i;
  boxHit.nx = 0; boxHit.ny = 0; boxHit.nz = 0;
  boxHit.qx = px; boxHit.qy = py; boxHit.qz = pz;
  switch (best) {
    case 0: boxHit.nx = -1; boxHit.qx = minx; break;
    case 1: boxHit.nx = 1; boxHit.qx = maxx; break;
    case 2: boxHit.ny = -1; boxHit.qy = miny; break;
    case 3: boxHit.ny = 1; boxHit.qy = maxy; break;
    case 4: boxHit.nz = -1; boxHit.qz = minz; break;
    case 5: boxHit.nz = 1; boxHit.qz = maxz; break;
  }
  boxHit.dist = -cands[best];
}

export const sol = { x: 0, y: 0, z: 0 };

/** Solves the symmetric 3x3 system H d = b (H positive definite). */
export function solveSym3(
  a00: number, a01: number, a02: number, a11: number, a12: number, a22: number,
  b0: number, b1: number, b2: number,
): void {
  const c00 = a11 * a22 - a12 * a12;
  const c01 = a02 * a12 - a01 * a22;
  const c02 = a01 * a12 - a02 * a11;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (Math.abs(det) < 1e-30) { sol.x = 0; sol.y = 0; sol.z = 0; return; }
  const c11 = a00 * a22 - a02 * a02;
  const c12 = a02 * a01 - a00 * a12;
  const c22 = a00 * a11 - a01 * a01;
  const inv = 1 / det;
  sol.x = (c00 * b0 + c01 * b1 + c02 * b2) * inv;
  sol.y = (c01 * b0 + c11 * b1 + c12 * b2) * inv;
  sol.z = (c02 * b0 + c12 * b1 + c22 * b2) * inv;
}
