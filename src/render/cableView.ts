import * as THREE from 'three';
import type { World } from '../game/world';
import { CONNECTOR } from '../game/rack';
import { SERVICES } from '../game/levels';
import { shared } from './dispose';
import { tintable } from './batch';
import { bevelBox } from './bevel';
import { ledLit, type LedGlow } from './ledGlow';
import { JACKET_KIND, jacketed } from './jacket';
import { TubeMesh, TubeNodes } from './tube';

export const FIBRE_COLORS = { OS2: '#f2c12e', OM4: '#3cc9cf', CU: '#3d7fe0' } as const;

interface CableMesh {
  visible: boolean;
  lastSig: number;
  /** linear colour of the cord (its boots too) */
  color: THREE.Color;
}

/** connector meshes: an LC plug for fibre, a clear RJ45 plug for copper */
export function connectorGeos(radius: number, copper: boolean) {
  const housing = copper
    ? bevelBox(0.0118, 0.0085, 0.022, 0.0008).translate(0, 0, CONNECTOR - 0.011)
    : bevelBox(0.0062, 0.0082, 0.022, 0.0006).translate(0, 0, CONNECTOR - 0.011);
  const latch = copper
    ? bevelBox(0.005, 0.002, 0.014, 0.0004).translate(0, 0.0052, CONNECTOR - 0.016)
    : bevelBox(0.003, 0.002, 0.012, 0.0004).translate(0, 0.005, CONNECTOR - 0.012);
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
const pinchGeo = shared(new THREE.TorusGeometry(1, 0.22, 6, 14));
/** the rings of a pinch: barely pinched, at its firmest, under the pointer (about to be let go) */
const PINCH_SOFT = new THREE.Color('#2f5866'), PINCH_FIRM = new THREE.Color('#6fe3ff'), PINCH_HOVER = new THREE.Color('#ff8a4c');
const Z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const HOUSING = { OS2: new THREE.Color('#2d6fd8'), OM4: new THREE.Color('#d9cfa3') };
/** how clear an RJ45 plug is (its transmission) */
const CLEAR = 0.6;

/**
 * Every cord of a world drawn in one mesh (a segment an instance, swept on the
 * GPU from their nodes), and their connectors in a handful of instanced meshes.
 */
export class CableView {
  group = new THREE.Group();
  cables: CableMesh[] = [];
  private tube: TubeMesh;
  private nodes: TubeNodes;
  private plugs: { fibre: Plugs; copper: Plugs };
  private straps: THREE.InstancedMesh | null = null;
  private strapMat = new THREE.MeshStandardMaterial({ color: '#1b2a4a', roughness: 0.9 });
  /** a ring round every pinched node */
  private pinchMarks: THREE.InstancedMesh | null = null;
  private pinchMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  /** the pinch under the pointer, or −1 */
  pinchHover = -1;
  /** the cord whose pinches are shown (under the pointer, or in hand), or −1: none */
  pinchShown = -1;
  /** how many cords are visible */
  private shown: number;
  private tmp = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private one = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private scale = new THREE.Vector3();
  /** instanced meshes whose matrices or colours changed this frame: only those are sent to the GPU */
  private moved = new Set<THREE.InstancedMesh>();
  private recoloured = new Set<THREE.InstancedMesh>();

  constructor(private world: World) {
    let segments = 0, nodes = 0;
    world.cables.forEach((cb) => {
      this.cables.push({ visible: true, lastSig: NaN, color: new THREE.Color(cb.color ?? FIBRE_COLORS[cb.type]) });
      segments += cb.count - 1;
      nodes = Math.max(nodes, cb.start + cb.count);
    });
    this.nodes = new TubeNodes(nodes);
    this.shown = this.cables.length;
    this.tube = new TubeMesh(segments, jacketed(tintable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0 }))), this.nodes);
    let at = 0;
    world.cables.forEach((cb, k) => {
      // each cord's marking from its own place along the print
      this.tube.lay(at, cb.start, cb.count, this.cables[k].color, k * 0.37, world.seg, JACKET_KIND[cb.type]);
      at += cb.count - 1;
    });
    this.tube.castShadow = true;
    this.tube.receiveShadow = true;
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
      copper: make(true, new THREE.MeshPhysicalMaterial({ color: '#e8f0f4', roughness: 0.15, transmission: CLEAR, thickness: 0.004, transparent: true, opacity: 0.85 })),
    };
    world.cables.forEach((cb, c) => {
      const p = this.plugOf(c);
      for (const e of [0, 1]) {
        p.boot.setColorAt(2 * c + e, this.cables[c].color);
        if (cb.type !== 'CU') { p.housing.setColorAt(2 * c + e, HOUSING[cb.type]); p.latch.setColorAt(2 * c + e, HOUSING[cb.type]); }
      }
    });
  }

  /** the cords and their plugs take the light of these LEDs (those of the cabinet they hang in front of); once */
  lightBy(glow: LedGlow): void {
    if (this.litBy) return;
    this.litBy = glow;
    const mats = new Set([this.tube.material, ...Object.values(this.plugs).flatMap((p) => [p.housing.material, p.latch.material, p.boot.material, p.label.material])]);
    for (const m of mats) ledLit(m as THREE.MeshStandardMaterial, glow);
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
    // a clear plug costs the frame a pass of its own (the scene behind it, drawn again):
    // not worth it on cords a pixel or two wide
    (this.plugs.copper.housing.material as THREE.MeshPhysicalMaterial).transmission = this.tube.level === 2 ? 0 : CLEAR;
    this.updateStraps();
    this.updatePinches();
  }

  /** pinches of the cord shown: a ring round each of their nodes, brighter the firmer the pinch */
  private updatePinches(): void {
    const sim = this.world.sim, x = sim.x;
    let total = 0;
    for (const p of sim.pinches) total += p.n;
    if (total > (this.pinchMarks?.instanceMatrix.count ?? 0)) {
      if (this.pinchMarks) { this.group.remove(this.pinchMarks); this.pinchMarks.dispose(); }
      const cap = Math.max(32, 2 * total);
      this.pinchMarks = new THREE.InstancedMesh(pinchGeo, this.pinchMat, cap);
      this.pinchMarks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3 * cap), 3);
      this.pinchMarks.frustumCulled = false;
      this.group.add(this.pinchMarks);
    }
    const im = this.pinchMarks;
    if (!im) return;
    im.count = total;
    let k = 0;
    sim.pinches.forEach((p, j) => {
      const c = sim.cableOf[p.a];
      const shown = c === this.pinchShown && this.cables[c].visible;
      this.col.copy(PINCH_SOFT).lerp(PINCH_FIRM, p.s);
      if (j === this.pinchHover) this.col.copy(PINCH_HOVER);
      const r = sim.radius[p.a] * (1.35 + 0.35 * p.s);
      for (let i = p.a; i < p.a + p.n; i++, k++) {
        if (!shown) { this.putMatrix(im, k, ZERO); continue; }
        const i0 = sim.segOK[i - 1] && sim.cableOf[i - 1] === sim.cableOf[i] ? i - 1 : i;
        const i1 = sim.segOK[i] ? i + 1 : i;
        this.q.setFromUnitVectors(Z, this.tmp.set(x[3 * i1] - x[3 * i0], x[3 * i1 + 1] - x[3 * i0 + 1], x[3 * i1 + 2] - x[3 * i0 + 2]).normalize());
        this.m4.compose(this.tmp.set(x[3 * i], x[3 * i + 1], x[3 * i + 2]), this.q, this.scale.set(r, r, r));
        this.putMatrix(im, k, this.m4);
        this.putColor(im, k, this.col);
      }
    });
    if (this.moved.delete(im)) im.instanceMatrix.needsUpdate = true;
    if (this.recoloured.delete(im)) im.instanceColor!.needsUpdate = true;
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
    if (cm.visible !== on) this.shown += on ? 1 : -1;
    cm.visible = on;
    // none left: the tubes and plugs of radius and scale 0 would still be run through the GPU
    for (const o of this.group.children) if (o !== this.straps && o !== this.pinchMarks) o.visible = this.shown > 0;
    if (on) { this.buildTube(c); this.updateEnds(c); }
    else {
      // a tube of radius 0: nothing left to draw
      const cb = this.world.cables[c];
      this.nodes.hide(cb.start, cb.count);
      const p = this.plugOf(c);
      for (const e of [0, 1]) for (const im of [p.housing, p.latch, p.boot, p.label]) this.putMatrix(im, 2 * c + e, ZERO);
    }
    this.flush();
  }

  setHighlight(c: number, on: boolean, color = '#3a3a3a'): void {
    const cm = this.cables[c];
    if (!cm) return;
    this.col.set(on ? color : '#000000');
    const cb = this.world.cables[c];
    for (let i = cb.start; i < cb.start + cb.count; i++) this.nodes.tint(i, this.col);
    const p = this.plugOf(c);
    for (const e of [0, 1]) this.col.toArray(p.tint.array, 3 * (2 * c + e));
    p.tint.needsUpdate = true;
  }

  /** a glow per node of one cord (null: none), e.g. how each stretch is held */
  setNodeTints(c: number, colors: (THREE.Color | null)[]): void {
    const cm = this.cables[c];
    if (!cm) return;
    const black = new THREE.Color(0, 0, 0);
    const cb = this.world.cables[c];
    for (let k = 0; k < cb.count; k++) this.nodes.tint(cb.start + k, colors[Math.min(colors.length - 1, k)] ?? black);
  }

  /** sends what changed this frame to the GPU */
  private flush(): void {
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

  private buildTube(c: number): void {
    const cb = this.world.cables[c];
    this.nodes.write(this.world.sim.x, cb.start, cb.count, this.world.radius);
  }
}
