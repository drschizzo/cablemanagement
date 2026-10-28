// The velcro straps: a thin band round the cords each one holds, one instance
// of a band of radius 1 per strap. A torus of the radius the solver keeps the
// bundle within was fat, and round when the cords lie flat in a manager: it cut
// through them on one side and stood off them on the other. The band is an
// ellipse fitted to where the cords are, across the direction most of them run
// in. Cords lying against the bundle may still go through it a little: hugging
// them exactly cost too much while the cords move.

import * as THREE from 'three';
import type { World } from '../game/world';

/** points round a band */
const N = 32;
/** width of a band along the cords (m), its thickness (× its radius) */
const WIDTH = 0.012, THICK = 0.06;
/** gap left between the cords and the inside of the band (m) */
const GAP = 0.0003;

/** a band of radius 1 round z: outside, inside and both edges */
function bandGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], index: number[] = [];
  const hw = WIDTH / 2, R = 1 + THICK;
  // (8 vertices a point round: outside back/front, inside back/front, front edge in/out, back edge in/out)
  for (let j = 0; j < N; j++) {
    const a = (2 * Math.PI * j) / N, c = Math.cos(a), s = Math.sin(a);
    pos.push(R * c, R * s, -hw, R * c, R * s, hw, c, s, -hw, c, s, hw, c, s, hw, R * c, R * s, hw, c, s, -hw, R * c, R * s, -hw);
    nrm.push(c, s, 0, c, s, 0, -c, -s, 0, -c, -s, 0, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1);
  }
  for (let j = 0; j < N; j++) {
    const a = 8 * j, b = 8 * ((j + 1) % N);
    // (each face counter-clockwise seen from where its normal points)
    for (const [p, q, flip] of [[0, 1, true], [2, 3, false], [4, 5, false], [6, 7, true]] as const) {
      index.push(...(flip ? [a + p, b + p, a + q, a + q, b + p, b + q] : [a + p, a + q, b + p, a + q, b + q, b + p]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(index);
  return g;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const d = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), m4 = new THREE.Matrix4();

export class Straps {
  mesh: THREE.InstancedMesh;
  private geo = bandGeometry();
  /** the direction of each cord a band holds, where it holds it */
  private tx: number[] = [];
  private ty: number[] = [];
  private tz: number[] = [];

  constructor(private material: THREE.Material) {
    this.mesh = this.make(16);
  }

  update(world: World): void {
    const list = world.straps;
    if (list.length > this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.make(2 * list.length);
      old.parent?.add(this.mesh);
      old.removeFromParent();
      old.dispose();
    }
    const im = this.mesh;
    im.count = list.length;
    let moved = false;
    list.forEach((s, k) => {
      const m = this.band(world, s.nodes) ?? ZERO;
      const a = im.instanceMatrix.array, e = m.elements, o = 16 * k;
      for (let q = 0; q < 16; q++) if (a[o + q] !== Math.fround(e[q])) { im.setMatrixAt(k, m); moved = true; break; }
    });
    if (moved) im.instanceMatrix.needsUpdate = true;
  }

  private make(cap: number): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(this.geo, this.material, cap);
    im.castShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    return im;
  }

  /** the matrix of the band round these nodes: across the way most of their cords run, fitted to them */
  private band(world: World, nodes: number[]): THREE.Matrix4 | null {
    const sim = world.sim, x = sim.x, n = nodes.length;
    if (n === 0) return null;
    let cx = 0, cy = 0, cz = 0;
    for (const i of nodes) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
    cx /= n; cy /= n; cz /= n;
    // the axis: the direction most of the cords run in (a cord leaving the bundle there, for a
    // port, tilted their mean, and the band with it, across the others)
    const tx = this.tx, ty = this.ty, tz = this.tz;
    tx.length = ty.length = tz.length = 0;
    for (const i of nodes) {
      const cb = world.cables[sim.cableOf[i]];
      const a = Math.max(cb.start, i - 1), b = Math.min(cb.start + cb.count - 1, i + 1);
      const ex = x[3 * b] - x[3 * a], ey = x[3 * b + 1] - x[3 * a + 1], ez = x[3 * b + 2] - x[3 * a + 2];
      const l = Math.hypot(ex, ey, ez) || 1;
      tx.push(ex / l); ty.push(ey / l); tz.push(ez / l);
    }
    d.set(0, 0, 0);
    for (let round = 0; round < 4; round++) {
      let dx = 0, dy = 0, dz = 0;
      for (let m = 0; m < n; m++) {
        const dot = tx[m] * d.x + ty[m] * d.y + tz[m] * d.z;
        // (each turned the way of the others; once there is an axis, weighed by how well it agrees)
        const sg = round === 0 ? (tx[m] * dx + ty[m] * dy + tz[m] * dz < 0 ? -1 : 1) : Math.sign(dot);
        const w = round === 0 ? 1 : dot ** 8;
        dx += sg * w * tx[m]; dy += sg * w * ty[m]; dz += sg * w * tz[m];
      }
      d.set(dx, dy, dz).normalize();
    }
    u.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
    v.crossVectors(d, u);
    // the cords across the axis: their spread, its main direction, and how far they reach either way
    let suu = 0, suv = 0, svv = 0;
    for (const i of nodes) {
      const rx = x[3 * i] - cx, ry = x[3 * i + 1] - cy, rz = x[3 * i + 2] - cz;
      const p = rx * u.x + ry * u.y + rz * u.z, q = rx * v.x + ry * v.y + rz * v.z;
      suu += p * p; suv += p * q; svv += q * q;
    }
    const ang = 0.5 * Math.atan2(2 * suv, suu - svv), ca = Math.cos(ang), sa = Math.sin(ang);
    e1.copy(u).multiplyScalar(ca).addScaledVector(v, sa);
    e2.crossVectors(d, e1);
    let ra = 0, rb = 0;
    for (const i of nodes) {
      const rx = x[3 * i] - cx, ry = x[3 * i + 1] - cy, rz = x[3 * i + 2] - cz;
      ra = Math.max(ra, Math.abs(rx * e1.x + ry * e1.y + rz * e1.z));
      rb = Math.max(rb, Math.abs(rx * e2.x + ry * e2.y + rz * e2.z));
    }
    const R = world.radius + GAP;
    ra += R; rb += R;
    m4.makeBasis(e1.multiplyScalar(ra), e2.multiplyScalar(rb), d);
    m4.setPosition(cx, cy, cz);
    return m4;
  }
}
