import * as THREE from 'three';
import type { World } from '../game/world';
import { CONNECTOR } from '../game/rack';
import { SERVICES } from '../game/levels';

const RADIAL = 8;
const SUB = 2; // samples per segment (Catmull-Rom in between)

export const FIBRE_COLORS = { OS2: '#f2c12e', OM4: '#3cc9cf', CU: '#3d7fe0' } as const;

interface CableMesh {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  pos: Float32Array;
  nrm: Float32Array;
  samples: number;
  ends: EndMesh[];
  visible: boolean;
  lastSig: number;
}

interface EndMesh {
  group: THREE.Group;
  label: THREE.Mesh;
  labelMat: THREE.MeshStandardMaterial;
}

/** connector meshes: an LC plug for fibre, a clear RJ45 plug for copper */
function connectorGeos(radius: number, copper: boolean) {
  const housing = copper
    ? new THREE.BoxGeometry(0.0118, 0.0085, 0.022).translate(0, 0, CONNECTOR - 0.011)
    : new THREE.BoxGeometry(0.0062, 0.0082, 0.022).translate(0, 0, CONNECTOR - 0.011);
  const latch = copper
    ? new THREE.BoxGeometry(0.005, 0.002, 0.014).translate(0, 0.0052, CONNECTOR - 0.016)
    : new THREE.BoxGeometry(0.003, 0.002, 0.012).translate(0, 0.005, CONNECTOR - 0.012);
  const bootR = copper ? 0.0058 : 0.0036;
  const boot = new THREE.CylinderGeometry(bootR, radius * 1.15, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, CONNECTOR - 0.022 - 0.015 + 0.004);
  const label = new THREE.CylinderGeometry(radius * 1.7, radius * 1.7, 0.016, 14).rotateX(Math.PI / 2).translate(0, 0, -0.022);
  return { housing, latch, boot, label };
}

const strapGeo = new THREE.TorusGeometry(1, 0.22, 8, 20);

export class CableView {
  group = new THREE.Group();
  cables: CableMesh[] = [];
  straps = new THREE.Group();
  private housingSM = new THREE.MeshStandardMaterial({ color: '#2d6fd8', roughness: 0.4 });
  private housingMM = new THREE.MeshStandardMaterial({ color: '#d9cfa3', roughness: 0.4 });
  private housingCU = new THREE.MeshPhysicalMaterial({ color: '#e8f0f4', roughness: 0.15, transmission: 0.6, thickness: 0.004, transparent: true, opacity: 0.85 });
  private strapMat = new THREE.MeshStandardMaterial({ color: '#1b2a4a', roughness: 0.9 });
  private tmp = new THREE.Vector3();

  constructor(private world: World) {
    this.group.add(this.straps);
    const geos = { fibre: connectorGeos(world.radius, false), copper: connectorGeos(world.radius, true) };
    world.cables.forEach((cb) => {
      const samples = (cb.count - 1) * SUB + 1;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(samples * RADIAL * 3);
      const nrm = new Float32Array(samples * RADIAL * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
      const idx: number[] = [];
      for (let s = 0; s < samples - 1; s++) {
        for (let r = 0; r < RADIAL; r++) {
          const a = s * RADIAL + r, b = s * RADIAL + ((r + 1) % RADIAL);
          const c = a + RADIAL, d = b + RADIAL;
          idx.push(a, c, b, b, c, d);
        }
      }
      geo.setIndex(idx);
      const mat = new THREE.MeshStandardMaterial({ color: cb.color ?? FIBRE_COLORS[cb.type], roughness: 0.42, metalness: 0.0 });
      const g = cb.type === 'CU' ? geos.copper : geos.fibre;
      const hmat = cb.type === 'CU' ? this.housingCU : cb.type === 'OS2' ? this.housingSM : this.housingMM;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const ends: EndMesh[] = [0, 1].map(() => {
        const group = new THREE.Group();
        const housing = new THREE.Mesh(g.housing, hmat);
        const latch = new THREE.Mesh(g.latch, hmat);
        const boot = new THREE.Mesh(g.boot, mat);
        const labelMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
        const label = new THREE.Mesh(g.label, labelMat);
        label.visible = false;
        for (const m of [housing, latch, boot, label]) { m.castShadow = true; group.add(m); }
        this.group.add(group);
        return { group, label, labelMat };
      });
      this.cables.push({ mesh, mat, pos, nrm, samples, ends, visible: true, lastSig: NaN });
    });
  }

  /** `force`: rebuild every cord, or only those it picks (scripted motion) */
  update(force: boolean | ((c: number) => boolean) = false): void {
    const sim = this.world.sim;
    const x = sim.x;
    this.world.cables.forEach((cb, c) => {
      const cm = this.cables[c];
      if (!cm.visible) return;
      if (typeof force === 'function') {
        if (force(c)) this.buildTube(c);
        this.updateEnds(c);
        return;
      }
      // skip cables that did not move (asleep)
      const sig = x[3 * cb.start] + x[3 * (cb.start + (cb.count >> 1)) + 1] * 3.1 + x[3 * (cb.start + cb.count - 1) + 2] * 7.7;
      const asleep = sim.cables[c].asleep;
      if (!force && asleep && sig === cm.lastSig) {
        this.updateEnds(c);
        return;
      }
      cm.lastSig = sig;
      this.buildTube(c);
      this.updateEnds(c);
    });
    // velcro straps
    while (this.straps.children.length < this.world.straps.length) {
      const m = new THREE.Mesh(strapGeo, this.strapMat);
      m.castShadow = true;
      this.straps.add(m);
    }
    while (this.straps.children.length > this.world.straps.length) this.straps.remove(this.straps.children[this.straps.children.length - 1]);
    this.world.straps.forEach((s, k) => {
      const m = this.straps.children[k] as THREE.Mesh;
      const [cx, cy, cz] = this.world.strapCentre(s);
      m.position.set(cx, cy, cz);
      // orient the loop around the mean direction of the cords
      let dx = 0, dy = 0, dz = 0;
      for (const i of s.nodes) {
        const j = sim.segOK[i] ? i + 1 : i - 1;
        const sg = j > i ? 1 : -1;
        let ex = (x[3 * j] - x[3 * i]) * sg, ey = (x[3 * j + 1] - x[3 * i + 1]) * sg, ez = (x[3 * j + 2] - x[3 * i + 2]) * sg;
        if (ex * dx + ey * dy + ez * dz < 0) { ex = -ex; ey = -ey; ez = -ez; }
        dx += ex; dy += ey; dz += ez;
      }
      this.tmp.set(dx, dy, dz).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.tmp);
      const r = sim.bundles[s.bundle].r + 0.0025;
      m.scale.set(r, r, r * 1.8);
    });
  }

  /** shows or hides one cord with its connectors */
  setVisible(c: number, on: boolean): void {
    const cm = this.cables[c];
    cm.visible = on;
    cm.mesh.visible = on;
    for (const e of cm.ends) e.group.visible = on;
    if (on) { this.buildTube(c); this.updateEnds(c); }
  }

  setHighlight(c: number, on: boolean, color = '#3a3a3a'): void {
    const cm = this.cables[c];
    if (!cm) return;
    cm.mat.emissive.set(on ? color : '#000000');
  }

  private updateEnds(c: number): void {
    const cb = this.world.cables[c];
    const cm = this.cables[c];
    const x = this.world.sim.x;
    for (const e of [0, 1]) {
      const [n0, n1] = this.world.endNodes(c, e);
      const g = cm.ends[e].group;
      g.position.set(x[3 * n0], x[3 * n0 + 1], x[3 * n0 + 2]);
      this.tmp.set(x[3 * n0] - x[3 * n1], x[3 * n0 + 1] - x[3 * n1 + 1], x[3 * n0 + 2] - x[3 * n1 + 2]).normalize();
      // plugged: the connector points straight into the port (−z)
      if (cb.ends[e].port) this.tmp.set(0, 0, -1);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.tmp);
      const label = cb.ends[e].label;
      cm.ends[e].label.visible = label !== null;
      if (label !== null) cm.ends[e].labelMat.color.set(SERVICES[label].color);
    }
  }

  /** tube around a Catmull-Rom curve through the nodes, with parallel-transported frames */
  private buildTube(c: number): void {
    const cb = this.world.cables[c];
    const cm = this.cables[c];
    const x = this.world.sim.x;
    const n = cb.count;
    const S = cm.samples;
    const pts = sampleBuf.length >= S * 3 ? sampleBuf : (sampleBuf = new Float64Array(S * 3 * 2));
    let k = 0;
    for (let i = 0; i < n - 1; i++) {
      const i0 = cb.start + Math.max(0, i - 1), i1 = cb.start + i, i2 = cb.start + i + 1, i3 = cb.start + Math.min(n - 1, i + 2);
      for (let s = 0; s < SUB; s++) {
        const u = s / SUB, u2 = u * u, u3 = u2 * u;
        for (let d = 0; d < 3; d++) {
          const p0 = x[3 * i0 + d], p1 = x[3 * i1 + d], p2 = x[3 * i2 + d], p3 = x[3 * i3 + d];
          pts[k * 3 + d] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
        }
        k++;
      }
    }
    for (let d = 0; d < 3; d++) pts[k * 3 + d] = x[3 * (cb.start + n - 1) + d];
    // frames
    let nx = 0, ny = 0, nz = 0;
    const pos = cm.pos, nrm = cm.nrm;
    const R = this.world.radius;
    for (let s = 0; s < S; s++) {
      const a = Math.max(0, s - 1), b = Math.min(S - 1, s + 1);
      let tx = pts[3 * b] - pts[3 * a], ty = pts[3 * b + 1] - pts[3 * a + 1], tz = pts[3 * b + 2] - pts[3 * a + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      if (s === 0) {
        // any vector not parallel to the tangent
        if (Math.abs(ty) < 0.9) { nx = 0; ny = 1; nz = 0; } else { nx = 1; ny = 0; nz = 0; }
      }
      // project the previous normal on the plane of the new tangent
      const dp = nx * tx + ny * ty + nz * tz;
      nx -= dp * tx; ny -= dp * ty; nz -= dp * tz;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-6) { if (Math.abs(ty) < 0.9) { nx = -tz; ny = 0; nz = tx; } else { nx = 0; ny = tz; nz = -ty; } nl = Math.hypot(nx, ny, nz); }
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      for (let r = 0; r < RADIAL; r++) {
        const ang = (r / RADIAL) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
        const o = (s * RADIAL + r) * 3;
        pos[o] = pts[3 * s] + ox * R; pos[o + 1] = pts[3 * s + 1] + oy * R; pos[o + 2] = pts[3 * s + 2] + oz * R;
        nrm[o] = ox; nrm[o + 1] = oy; nrm[o + 2] = oz;
      }
    }
    const geo = cm.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
}

let sampleBuf = new Float64Array(0);
