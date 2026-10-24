import * as THREE from 'three';
import type { World } from '../game/world';
import { CONNECTOR } from '../game/rack';
import { SERVICES } from '../game/levels';
import { shared } from './dispose';
import { tintable } from './batch';
import { ledLit, type LedGlow } from './ledGlow';
import { JACKET_KIND, jacketed } from './jacket';

const RADIAL = 8;
const SUB = 2; // samples per segment (Catmull-Rom in between)
/** cos and sin of the angle of each vertex around a ring */
const RING_COS = Float64Array.from({ length: RADIAL }, (_, r) => Math.cos((r / RADIAL) * Math.PI * 2));
const RING_SIN = Float64Array.from({ length: RADIAL }, (_, r) => Math.sin((r / RADIAL) * Math.PI * 2));

export const FIBRE_COLORS = { OS2: '#f2c12e', OM4: '#3cc9cf', CU: '#3d7fe0' } as const;

interface CableMesh {
  /** first vertex of the cord in the shared tube buffers */
  v0: number;
  samples: number;
  visible: boolean;
  lastSig: number;
  /** linear colour of the cord (its boots too) */
  color: THREE.Color;
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

/** the parts of one kind of connector, each instanced over every end of the cords (2c + e) */
interface Plugs {
  housing: THREE.InstancedMesh;
  latch: THREE.InstancedMesh;
  boot: THREE.InstancedMesh;
  label: THREE.InstancedMesh;
  /** glow of the boots, with their cord */
  tint: THREE.InstancedBufferAttribute;
}

const strapGeo = shared(new THREE.TorusGeometry(1, 0.22, 8, 20));
const Z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const HOUSING = { OS2: new THREE.Color('#2d6fd8'), OM4: new THREE.Color('#d9cfa3') };

/**
 * Every cord of a world drawn in one mesh (their tubes share one buffer, coloured
 * per vertex), and their connectors in a handful of instanced meshes.
 */
export class CableView {
  group = new THREE.Group();
  cables: CableMesh[] = [];
  private tube: THREE.Mesh;
  private pos: Float32Array;
  private nrm: Float32Array;
  private tint: Float32Array;
  private plugs: { fibre: Plugs; copper: Plugs };
  private straps: THREE.InstancedMesh | null = null;
  private strapMat = new THREE.MeshStandardMaterial({ color: '#1b2a4a', roughness: 0.9 });
  private tmp = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private one = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private scale = new THREE.Vector3();
  /** instanced meshes whose matrices or colours changed this frame: only those are sent to the GPU */
  private moved = new Set<THREE.InstancedMesh>();
  private recoloured = new Set<THREE.InstancedMesh>();
  /** vertices of the tube rebuilt this frame: one range sent to the GPU, not one per cord */
  private dirtyLo = Infinity;
  private dirtyHi = -Infinity;

  constructor(private world: World) {
    let verts = 0;
    world.cables.forEach((cb) => {
      const samples = (cb.count - 1) * SUB + 1;
      this.cables.push({ v0: verts, samples, visible: true, lastSig: NaN, color: new THREE.Color(cb.color ?? FIBRE_COLORS[cb.type]) });
      verts += samples * RADIAL;
    });
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    this.tint = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    // length along the cord at rest, angle around it, kind: what the jacket shader draws with
    const jacket = new Float32Array(verts * 4);
    const idx: number[] = [];
    this.cables.forEach((cm, k) => {
      for (let v = cm.v0; v < cm.v0 + cm.samples * RADIAL; v++) cm.color.toArray(colors, 3 * v);
      const kind = JACKET_KIND[world.cables[k].type];
      for (let s = 0; s < cm.samples; s++) {
        for (let r = 0; r < RADIAL; r++) {
          const o = 4 * (cm.v0 + s * RADIAL + r);
          jacket[o] = (s / SUB) * world.seg + k * 0.37;
          jacket[o + 1] = RING_COS[r];
          jacket[o + 2] = RING_SIN[r];
          jacket[o + 3] = kind;
        }
      }
      for (let s = 0; s < cm.samples - 1; s++) {
        for (let r = 0; r < RADIAL; r++) {
          const a = cm.v0 + s * RADIAL + r, b = cm.v0 + s * RADIAL + ((r + 1) % RADIAL);
          const c = a + RADIAL, d = b + RADIAL;
          idx.push(a, c, b, b, c, d);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('emissiveTint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('jacket', new THREE.BufferAttribute(jacket, 4));
    geo.setIndex(idx);
    this.tube = new THREE.Mesh(geo, jacketed(tintable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0 }))));
    this.tube.castShadow = true;
    this.tube.receiveShadow = true;
    this.tube.frustumCulled = false;
    this.group.add(this.tube);

    const n = 2 * world.cables.length;
    const make = (copper: boolean, housingMat: THREE.Material): Plugs => {
      const g = connectorGeos(world.radius, copper);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage);
      g.boot.setAttribute('emissiveTint', tint);
      const inst = (geo: THREE.BufferGeometry, m: THREE.Material) => {
        const im = new THREE.InstancedMesh(geo, m, n);
        im.castShadow = true;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, this.col.set('#ffffff')); }
        this.moved.add(im);
        this.recoloured.add(im);
        this.group.add(im);
        return im;
      };
      return {
        housing: inst(g.housing, housingMat),
        latch: inst(g.latch, housingMat),
        boot: inst(g.boot, tintable(new THREE.MeshStandardMaterial({ roughness: 0.42 }))),
        label: inst(g.label, new THREE.MeshStandardMaterial({ roughness: 0.6 })),
        tint,
      };
    };
    this.plugs = {
      fibre: make(false, new THREE.MeshStandardMaterial({ roughness: 0.4 })),
      copper: make(true, new THREE.MeshPhysicalMaterial({ color: '#e8f0f4', roughness: 0.15, transmission: 0.6, thickness: 0.004, transparent: true, opacity: 0.85 })),
    };
    world.cables.forEach((cb, c) => {
      const p = this.plugOf(c);
      for (const e of [0, 1]) {
        p.boot.setColorAt(2 * c + e, this.cables[c].color);
        if (cb.type !== 'CU') { p.housing.setColorAt(2 * c + e, HOUSING[cb.type]); p.latch.setColorAt(2 * c + e, HOUSING[cb.type]); }
      }
    });
  }

  /** the cords take the light of these LEDs (those of the cabinet they hang in front of); once */
  lightBy(glow: LedGlow): void {
    if (this.litBy) return;
    this.litBy = glow;
    ledLit(this.tube.material as THREE.MeshStandardMaterial, glow);
  }

  private litBy: LedGlow | null = null;

  private plugOf(c: number): Plugs {
    return this.world.cables[c].type === 'CU' ? this.plugs.copper : this.plugs.fibre;
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
    this.flush();
    this.updateStraps();
  }

  /** velcro straps */
  private updateStraps(): void {
    const sim = this.world.sim, x = sim.x;
    const list = this.world.straps;
    if (list.length > (this.straps?.instanceMatrix.count ?? 0)) {
      if (this.straps) { this.group.remove(this.straps); this.straps.dispose(); }
      this.straps = new THREE.InstancedMesh(strapGeo, this.strapMat, Math.max(16, 2 * list.length));
      this.straps.castShadow = true;
      this.straps.frustumCulled = false;
      this.group.add(this.straps);
    }
    if (!this.straps) return;
    this.straps.count = list.length;
    list.forEach((s, k) => {
      const [cx, cy, cz] = this.world.strapCentre(s);
      // orient the loop around the mean direction of the cords
      let dx = 0, dy = 0, dz = 0;
      for (const i of s.nodes) {
        const j = sim.segOK[i] ? i + 1 : i - 1;
        const sg = j > i ? 1 : -1;
        let ex = (x[3 * j] - x[3 * i]) * sg, ey = (x[3 * j + 1] - x[3 * i + 1]) * sg, ez = (x[3 * j + 2] - x[3 * i + 2]) * sg;
        if (ex * dx + ey * dy + ez * dz < 0) { ex = -ex; ey = -ey; ez = -ez; }
        dx += ex; dy += ey; dz += ez;
      }
      this.q.setFromUnitVectors(Z, this.tmp.set(dx, dy, dz).normalize());
      const r = sim.bundles[s.bundle].r + 0.0025;
      this.m4.compose(this.tmp.set(cx, cy, cz), this.q, this.scale.set(r, r, r * 1.8));
      this.putMatrix(this.straps!, k, this.m4);
    });
    if (this.moved.delete(this.straps)) this.straps.instanceMatrix.needsUpdate = true;
  }

  /** sets one instance's matrix, and remembers its mesh for the upload if it changed */
  private putMatrix(im: THREE.InstancedMesh, i: number, m: THREE.Matrix4): void {
    const a = im.instanceMatrix.array, e = m.elements, o = 16 * i;
    for (let k = 0; k < 16; k++) {
      if (a[o + k] !== Math.fround(e[k])) { im.setMatrixAt(i, m); this.moved.add(im); return; }
    }
  }

  private putColor(im: THREE.InstancedMesh, i: number, c: THREE.Color): void {
    const a = im.instanceColor!.array, o = 3 * i;
    if (a[o] === Math.fround(c.r) && a[o + 1] === Math.fround(c.g) && a[o + 2] === Math.fround(c.b)) return;
    im.setColorAt(i, c);
    this.recoloured.add(im);
  }

  /** shows or hides one cord with its connectors */
  setVisible(c: number, on: boolean): void {
    const cm = this.cables[c];
    cm.visible = on;
    if (on) { this.buildTube(c); this.updateEnds(c); }
    else {
      // every vertex of the tube on one point: nothing left to draw
      this.pos.fill(0, 3 * cm.v0, 3 * (cm.v0 + cm.samples * RADIAL));
      this.dirty(cm);
      const p = this.plugOf(c);
      for (const e of [0, 1]) for (const im of [p.housing, p.latch, p.boot, p.label]) this.putMatrix(im, 2 * c + e, ZERO);
    }
    this.flush();
  }

  setHighlight(c: number, on: boolean, color = '#3a3a3a'): void {
    const cm = this.cables[c];
    if (!cm) return;
    this.col.set(on ? color : '#000000');
    for (let v = cm.v0; v < cm.v0 + cm.samples * RADIAL; v++) this.col.toArray(this.tint, 3 * v);
    const a = this.tube.geometry.attributes.emissiveTint as THREE.BufferAttribute;
    a.addUpdateRange(3 * cm.v0, 3 * cm.samples * RADIAL);
    a.needsUpdate = true;
    const p = this.plugOf(c);
    for (const e of [0, 1]) this.col.toArray(p.tint.array, 3 * (2 * c + e));
    p.tint.needsUpdate = true;
  }

  /** a glow per node of one cord (null: none), e.g. how each stretch is held */
  setNodeTints(c: number, colors: (THREE.Color | null)[]): void {
    const cm = this.cables[c];
    if (!cm) return;
    const black = new THREE.Color(0, 0, 0);
    for (let s = 0; s < cm.samples; s++) {
      const col = colors[Math.min(colors.length - 1, Math.round(s / SUB))] ?? black;
      for (let r = 0; r < RADIAL; r++) col.toArray(this.tint, 3 * (cm.v0 + s * RADIAL + r));
    }
    const a = this.tube.geometry.attributes.emissiveTint as THREE.BufferAttribute;
    a.addUpdateRange(3 * cm.v0, 3 * cm.samples * RADIAL);
    a.needsUpdate = true;
  }

  private dirty(cm: CableMesh): void {
    this.dirtyLo = Math.min(this.dirtyLo, cm.v0);
    this.dirtyHi = Math.max(this.dirtyHi, cm.v0 + cm.samples * RADIAL);
  }

  /** sends what changed this frame to the GPU */
  private flush(): void {
    if (this.dirtyHi > this.dirtyLo) {
      const geo = this.tube.geometry;
      for (const n of ['position', 'normal']) {
        const a = geo.attributes[n] as THREE.BufferAttribute;
        a.addUpdateRange(3 * this.dirtyLo, 3 * (this.dirtyHi - this.dirtyLo));
        a.needsUpdate = true;
      }
      this.dirtyLo = Infinity;
      this.dirtyHi = -Infinity;
    }
    for (const im of this.moved) im.instanceMatrix.needsUpdate = true;
    for (const im of this.recoloured) im.instanceColor!.needsUpdate = true;
    this.moved.clear();
    this.recoloured.clear();
  }

  private updateEnds(c: number): void {
    const cb = this.world.cables[c];
    const x = this.world.sim.x;
    const p = this.plugOf(c);
    for (const e of [0, 1]) {
      const [n0, n1] = this.world.endNodes(c, e);
      this.tmp.set(x[3 * n0] - x[3 * n1], x[3 * n0 + 1] - x[3 * n1 + 1], x[3 * n0 + 2] - x[3 * n1 + 2]).normalize();
      // plugged: the connector points straight into the port (−z)
      if (cb.ends[e].port) this.tmp.set(0, 0, -1);
      this.q.setFromUnitVectors(Z, this.tmp);
      this.m4.compose(this.tmp.set(x[3 * n0], x[3 * n0 + 1], x[3 * n0 + 2]), this.q, this.one);
      const i = 2 * c + e;
      this.putMatrix(p.housing, i, this.m4);
      this.putMatrix(p.latch, i, this.m4);
      this.putMatrix(p.boot, i, this.m4);
      const label = cb.ends[e].label;
      if (label === null) this.putMatrix(p.label, i, ZERO);
      else { this.putMatrix(p.label, i, this.m4); this.putColor(p.label, i, this.col.set(SERVICES[label].color)); }
    }
  }

  /** tube around a Catmull-Rom curve through the nodes, with parallel-transported frames */
  private buildTube(c: number): void {
    const cb = this.world.cables[c];
    const cm = this.cables[c];
    const x = this.world.sim.x;
    const n = cb.count;
    const V = cm.v0;
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
    const pos = this.pos, nrm = this.nrm;
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
        const ca = RING_COS[r], sa = RING_SIN[r];
        const ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
        const o = (V + s * RADIAL + r) * 3;
        pos[o] = pts[3 * s] + ox * R; pos[o + 1] = pts[3 * s + 1] + oy * R; pos[o + 2] = pts[3 * s + 2] + oz * R;
        nrm[o] = ox; nrm[o + 1] = oy; nrm[o + 2] = oz;
      }
    }
    this.dirty(cm);
  }
}

let sampleBuf = new Float64Array(0);
