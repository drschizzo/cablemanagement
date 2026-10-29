// Cords raining on the title screen, before it is tidied: they fall from above
// the racks, one every few tenths of a second, and pile up on the floor in the
// middle of the room. When it is tidied, they are reeled back up into the dark
// they came from, the last one in first.
//
// Decoration only, so not the cable engine: each falling cord is a small chain
// of points (Verlet, lengths kept by projection, a little bending stiffness so
// that it keeps its curls). The cords do not see each other while they fall:
// they land on a height map of the heap, raised by every cord that came to
// rest. A cord at rest is frozen, and costs nothing but its triangles: the
// physics and the nodes sent each frame are those of the few in the air.

import * as THREE from 'three';
import { TubeMesh, TubeNodes } from '@drschizzo/three-cable-tubes';
import { CABLE_R } from '../game/rack';
import { SERVICES } from '../game/services';
import { rng } from '../game/mess/tangle';
import { FIBRE_COLORS, connectorGeos } from '../render/cableView';
import { JACKET_KIND, jacketMaterial, jacketed } from '../render/jacket';

/** cords at most (on screen at once): past it, the oldest, deep in the heap, makes room */
const POOL = 240;
const NODES = 24;
const R = CABLE_R;
/** fixed step of the little simulation (s), and its passes over the constraints */
const STEP = 1 / 120;
const ITER = 8;
const G = 9.81;
/** mean time between two cords (s) */
const EVERY = 0.38;
/** how much of their curl the cords keep, per pass */
const BEND = 0.2;
/** share of the sliding speed lost at each step on the heap */
const FRICTION = 0.45;
/** height map of the heap: cell (m); how high it may grow above the floor in its middle (m), lower away from it */
const CELL = 0.015;
const HEAP_MAX = 0.24;
const HEAP_WIDE = 1.2;
/** a cord at rest raises the heap within this reach (m), domed by this much: a loose heap, full of air */
const REACH = 0.026;
const LOFT = 0.003;
/** the front of a rack, ahead of its rails (m), and half its width with its ducts */
const RACK_FRONT = 0.09;
const RACK_HALF = 0.4;
/** how far above the racks the cords appear, and vanish, out of the frame (m) */
const SKY = 1.8;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

const enum S { Free, Falling, Resting, Leaving }

/** where a rack stands on the floor (m), and which way it faces (rad) */
export interface RackPlace { x: number; z: number; yaw: number }

export interface RainOpts {
  floorY: number;
  topY: number;
  racks: RackPlace[];
  /** middle of the heap on the floor (m), and the spread of the cords around it (m) */
  centre: { x: number; z: number };
  spread: number;
  seed?: number;
}

export class CableRain {
  group = new THREE.Group();
  private o: RainOpts;
  private r: () => number;
  private x = new Float64Array(POOL * NODES * 3);
  private prev = new Float64Array(POOL * NODES * 3);
  /** length of each segment, and distance between every other node at rest (their curl) */
  private seg = new Float64Array(POOL);
  private bend = new Float64Array(POOL * NODES);
  private state = new Uint8Array(POOL);
  private age = new Float64Array(POOL);
  private still = new Float64Array(POOL);
  /** in which order they came to rest (they leave the other way), or when they set off up */
  private order = new Float64Array(POOL);
  private copper = new Uint8Array(POOL);
  /** leaving: the end pulled up, where it was, and its delay (s) */
  private pinEnd = new Uint8Array(POOL);
  private pinFrom = new Float64Array(POOL * 3);
  private rested = 0;
  private next = 0;
  /** slots ever used: what is drawn */
  private used = 0;
  private raining = false;
  private wait = 0;
  private acc = 0;

  private hx0: number;
  private hz0: number;
  private nx: number;
  private nz: number;
  /** the heap (height of its top, m), and the cords of the mess lying on the floor under it */
  private heap: Float32Array;
  private base: Float32Array;
  private racks: { x: number; z: number; c: number; s: number }[];
  /** phases of the lumps of the heap */
  private bumps: number[];

  private tube: TubeMesh;
  private nodes = new TubeNodes(POOL * NODES);
  private moved = new Uint8Array(POOL);
  private plugs: { boot: THREE.InstancedMesh; housing: THREE.InstancedMesh }[];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();

  constructor(o: RainOpts) {
    this.o = o;
    this.r = rng(o.seed ?? 0x2545f491);
    // the floor between the racks, with a margin
    const half = 2.2;
    this.hx0 = o.centre.x - half;
    this.hz0 = o.centre.z - half;
    this.nx = this.nz = Math.ceil((2 * half) / CELL) + 1;
    this.base = new Float32Array(this.nx * this.nz).fill(o.floorY);
    this.heap = Float32Array.from(this.base);
    this.bumps = [0, 0, 0, 0].map(() => this.r() * 2 * Math.PI);
    this.racks = o.racks.map((p) => ({ x: p.x, z: p.z, c: Math.cos(p.yaw), s: Math.sin(p.yaw) }));

    this.tube = new TubeMesh(POOL * (NODES - 1), jacketed(jacketMaterial()), this.nodes);
    this.tube.castShadow = this.tube.receiveShadow = true;
    this.tube.setDrawn(0);
    this.group.add(this.tube);

    // two plugs per cord: a clear RJ45 on copper, an LC on fibre (opaque: a transmissive
    // material would cost the whole scene drawn once more)
    const kinds = [
      { copper: false, housing: new THREE.MeshStandardMaterial({ roughness: 0.4 }) },
      { copper: true, housing: new THREE.MeshStandardMaterial({ color: '#cfd8dc', roughness: 0.18 }) },
    ];
    this.plugs = kinds.map(({ copper, housing }) => {
      const g = connectorGeos(R, copper);
      const inst = (geo: THREE.BufferGeometry, m: THREE.Material) => {
        const im = new THREE.InstancedMesh(geo, m, 2 * POOL);
        im.castShadow = true;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < 2 * POOL; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, this.col.set('#ffffff')); }
        this.group.add(im);
        return im;
      };
      return { boot: inst(g.boot, new THREE.MeshStandardMaterial({ roughness: 0.42 })), housing: inst(g.housing, housing) };
    });
  }

  /** cords already on the floor (world coordinates, every 3 values a node): the heap starts on them */
  support(x: ArrayLike<number>, radius: number): void {
    for (let i = 0; i < x.length; i += 3) {
      // only what lies on the floor: a cord hanging from a rack is no shelf
      if (x[i + 1] < this.o.floorY + 0.1) this.splat(this.base, x[i], x[i + 1], x[i + 2], radius, 0.012, 0);
    }
    this.heap.set(this.base);
  }

  /** cords fall and pile up */
  start(): void {
    if (this.raining) return;
    this.raining = true;
    this.wait = 0;
  }

  /** no more cords, and those there are go back up where they came from, the last one in first */
  stop(): void {
    if (!this.raining) return;
    this.raining = false;
    const out: number[] = [];
    for (let c = 0; c < POOL; c++) if (this.state[c] === S.Falling || this.state[c] === S.Resting) out.push(c);
    // those still in the air first, then from the top of the heap down
    const key = (c: number) => (this.state[c] === S.Falling ? Infinity : this.order[c]);
    out.sort((a, b) => key(b) - key(a));
    const gap = Math.min(0.03, 1.6 / Math.max(1, out.length));
    out.forEach((c, k) => this.leave(c, k * gap));
    this.heap.set(this.base);
    this.rested = 0;
  }

  dispose(): void {
    this.tube.geometry.dispose();
    (this.tube.material as THREE.Material).dispose();
    this.tube.dispose();
    for (const p of this.plugs) {
      for (const im of [p.boot, p.housing]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); im.dispose(); }
    }
  }

  tick(dt: number): void {
    if (this.raining) {
      this.wait -= dt;
      while (this.wait <= 0) {
        this.spawn();
        this.wait += EVERY * (0.4 + 1.2 * this.r());
      }
    }
    this.acc = Math.min(this.acc + dt, 4 * STEP);
    this.moved.fill(0);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (let c = 0; c < this.used; c++) {
        const st = this.state[c];
        if (st === S.Falling) this.fall(c);
        else if (st === S.Leaving) this.rise(c);
      }
    }
    this.draw();
  }

  // ------------------------------------------------------------ the cords

  private spawn(): void {
    // the next slot in turn, unless still in the air
    let c = -1;
    for (let k = 0; k < POOL; k++) {
      const j = (this.next + k) % POOL;
      if (this.state[j] === S.Free || this.state[j] === S.Resting) { c = j; break; }
    }
    if (c < 0) return;
    this.next = (c + 1) % POOL;
    this.used = Math.max(this.used, c + 1);
    const r = this.r;
    // 1.1 to 2 m of cord, drawn as a curly line: it turns about an axis, more or less
    const len = 1.1 + 0.9 * r();
    const seg = len / (NODES - 1);
    this.seg[c] = seg;
    const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const dir = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const turn = (0.3 + 0.45 * r()) * (r() < 0.5 ? -1 : 1);
    const x = this.x, o = c * NODES * 3;
    let px = 0, py = 0, pz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < NODES; i++) {
      x[o + 3 * i] = px; x[o + 3 * i + 1] = py; x[o + 3 * i + 2] = pz;
      cx += px; cy += py; cz += pz;
      dir.applyAxisAngle(axis, turn + (r() - 0.5) * 0.9);
      // the axis wanders too: loops, not a spring
      axis.applyAxisAngle(dir, (r() - 0.5) * 0.8);
      px += dir.x * seg; py += dir.y * seg; pz += dir.z * seg;
    }
    // where it lands: around the middle of the heap, wider as the heap grows —
    // up to the pool: past it the oldest cords make room, the heap no longer
    // grows, and a spread that kept widening let cords fall right in front of
    // the camera, across the whole screen
    const spread = this.o.spread * (1 + Math.min(this.rested, POOL) / 250);
    const g = () => (r() + r() + r() - 1.5) * 1.15;
    const tx = this.o.centre.x + g() * spread, tz = this.o.centre.z + g() * spread * 0.8;
    const ty = this.o.topY + SKY + r() * 0.6;
    cx /= NODES; cy /= NODES; cz /= NODES;
    // a push down, a little sideways, and a slow tumble
    const vx = (r() - 0.5) * 0.4, vy = -(0.5 + 1.5 * r()), vz = (r() - 0.5) * 0.4;
    const w = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(4);
    for (let i = 0; i < NODES; i++) {
      const j = o + 3 * i;
      const lx = x[j] - cx, ly = x[j + 1] - cy, lz = x[j + 2] - cz;
      x[j] = tx + lx; x[j + 1] = ty + ly; x[j + 2] = tz + lz;
      this.prev[j] = x[j] - (vx + w.y * lz - w.z * ly) * STEP;
      this.prev[j + 1] = x[j + 1] - (vy + w.z * lx - w.x * lz) * STEP;
      this.prev[j + 2] = x[j + 2] - (vz + w.x * ly - w.y * lx) * STEP;
    }
    for (let i = 0; i < NODES - 2; i++) {
      const a = o + 3 * i, b = a + 6;
      this.bend[c * NODES + i] = Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]);
    }
    this.state[c] = S.Falling;
    this.age[c] = 0;
    this.still[c] = 0;
    // mostly copper, in the colours of the services; some fibre
    const kind = r();
    const copper = kind < 0.72;
    this.copper[c] = copper ? 1 : 0;
    const type = copper ? 'CU' : kind < 0.86 ? 'OS2' : 'OM4';
    const color = copper ? (r() < 0.25 ? FIBRE_COLORS.CU : SERVICES[Math.floor(r() * SERVICES.length)].color) : FIBRE_COLORS[type];
    this.col.set(color);
    this.tube.lay(c * (NODES - 1), c * NODES, NODES, this.col, r() * 3, seg, JACKET_KIND[type]);
    // the plugs of the other kind, out of sight
    for (const e of [0, 1]) {
      const other = this.plugs[1 - this.copper[c]];
      other.boot.setMatrixAt(2 * c + e, ZERO);
      other.housing.setMatrixAt(2 * c + e, ZERO);
      const p = this.plugs[this.copper[c]];
      p.boot.setColorAt(2 * c + e, this.col);
      if (!copper) p.housing.setColorAt(2 * c + e, this.col.set(type === 'OS2' ? '#2d6fd8' : '#d9cfa3'));
      this.col.set(color);
    }
    for (const p of this.plugs) { p.boot.instanceColor!.needsUpdate = true; p.housing.instanceColor!.needsUpdate = true; }
  }

  /** one step of a falling cord; it is frozen into the heap once it has come to rest */
  private fall(c: number): void {
    const x = this.x, p = this.prev, o = c * NODES * 3;
    let most = 0;
    for (let j = o; j < o + NODES * 3; j += 3) {
      const vx = (x[j] - p[j]) * 0.998, vy = (x[j + 1] - p[j + 1]) * 0.998, vz = (x[j + 2] - p[j + 2]) * 0.998;
      most = Math.max(most, vx * vx + vy * vy + vz * vz);
      p[j] = x[j]; p[j + 1] = x[j + 1]; p[j + 2] = x[j + 2];
      x[j] += vx; x[j + 1] += vy - G * STEP * STEP; x[j + 2] += vz;
    }
    for (let it = 0; it < ITER; it++) {
      this.lengths(c, -1);
      // its curls, loosely
      for (let i = 0; i < NODES - 2; i++) this.distance(o + 3 * i, o + 3 * i + 6, this.bend[c * NODES + i], BEND, 0.5);
      for (let j = o; j < o + NODES * 3; j += 3) this.collide(j);
    }
    this.moved[c] = 1;
    this.age[c] += STEP;
    // at rest a moment (under 4 cm/s), or long enough
    this.still[c] = most < (0.04 * STEP) ** 2 ? this.still[c] + STEP : 0;
    if (this.still[c] > 0.25 || this.age[c] > 8) {
      this.state[c] = S.Resting;
      this.order[c] = this.rested++;
      for (let i = 0; i < NODES; i++) {
        const j = o + 3 * i;
        this.splat(this.heap, x[j], x[j + 1], x[j + 2], R, REACH, LOFT);
        if (i < NODES - 1) this.splat(this.heap, (x[j] + x[j + 3]) / 2, (x[j + 1] + x[j + 4]) / 2, (x[j + 2] + x[j + 5]) / 2, R, REACH, LOFT);
      }
    }
  }

  /** sets a cord off up, its upper end first, in `delay` s */
  private leave(c: number, delay: number): void {
    const o = c * NODES * 3;
    const e = this.x[o + 1] > this.x[o + 3 * (NODES - 1) + 1] ? 0 : NODES - 1;
    this.pinEnd[c] = e;
    for (let d = 0; d < 3; d++) this.pinFrom[3 * c + d] = this.x[o + 3 * e + d];
    this.state[c] = S.Leaving;
    this.age[c] = -delay;
    // drops what it was doing in the air: a cord still falling leaves from where it is
    this.prev.set(this.x.subarray(o, o + NODES * 3), o);
  }

  /** one step of a cord reeled up by one end: it drags the rest out of the heap, then out of sight */
  private rise(c: number): void {
    this.age[c] += STEP;
    const t = this.age[c];
    if (t <= 0) return;
    const x = this.x, p = this.prev, o = c * NODES * 3;
    for (let j = o; j < o + NODES * 3; j += 3) {
      const vx = (x[j] - p[j]) * 0.99, vy = (x[j + 1] - p[j + 1]) * 0.99, vz = (x[j + 2] - p[j + 2]) * 0.99;
      p[j] = x[j]; p[j + 1] = x[j + 1]; p[j + 2] = x[j + 2];
      x[j] += vx; x[j + 1] += vy - G * STEP * STEP; x[j + 2] += vz;
    }
    // slowly at first (it comes unstuck), then faster and faster
    const pin = o + 3 * this.pinEnd[c];
    x[pin] = this.pinFrom[3 * c];
    x[pin + 1] = this.pinFrom[3 * c + 1] + 0.25 * t + 2.6 * t * t;
    x[pin + 2] = this.pinFrom[3 * c + 2];
    for (let it = 0; it < ITER; it++) {
      this.lengths(c, pin);
      for (let j = o; j < o + NODES * 3; j += 3) {
        if (x[j + 1] < this.o.floorY + R) { x[j + 1] = this.o.floorY + R; p[j] += (x[j] - p[j]) * FRICTION; p[j + 2] += (x[j + 2] - p[j + 2]) * FRICTION; }
      }
    }
    this.moved[c] = 1;
    let low = Infinity;
    for (let j = o + 1; j < o + NODES * 3; j += 3) low = Math.min(low, x[j]);
    if (low > this.o.topY + SKY || t > 4) {
      this.state[c] = S.Free;
      this.nodes.hide(c * NODES, NODES);
    }
  }

  /** the length of every segment; node `pin` (offset in x) does not move */
  private lengths(c: number, pin: number): void {
    const o = c * NODES * 3, seg = this.seg[c];
    for (let j = o; j < o + (NODES - 1) * 3; j += 3) {
      this.distance(j, j + 3, seg, 1, j === pin ? 0 : j + 3 === pin ? 1 : 0.5);
    }
  }

  /** brings two nodes (offsets in x) towards `rest` apart; `share`: how much of the move the first takes */
  private distance(a: number, b: number, rest: number, k: number, share: number): void {
    const x = this.x;
    const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-9) return;
    const f = (k * (l - rest)) / l;
    const fa = f * share, fb = f * (1 - share);
    x[a] += dx * fa; x[a + 1] += dy * fa; x[a + 2] += dz * fa;
    x[b] -= dx * fb; x[b + 1] -= dy * fb; x[b + 2] -= dz * fb;
  }

  /** the node at offset j on the heap (it slides down its slopes) and out of the racks */
  private collide(j: number): void {
    const x = this.x, p = this.prev;
    const top = this.height(x[j], x[j + 2]) + R;
    if (x[j + 1] < top) {
      // the slope of the heap there: pushed out along it, the node slides down
      const gx = (this.height(x[j] + CELL, x[j + 2]) - this.height(x[j] - CELL, x[j + 2])) / (2 * CELL);
      const gz = (this.height(x[j], x[j + 2] + CELL) - this.height(x[j], x[j + 2] - CELL)) / (2 * CELL);
      const n2 = 1 + gx * gx + gz * gz;
      const pen = top - x[j + 1];
      x[j] -= (gx * pen) / n2;
      x[j + 2] -= (gz * pen) / n2;
      x[j + 1] = top;
      // no bounce, and some friction
      p[j + 1] = x[j + 1];
      p[j] += (x[j] - p[j]) * FRICTION;
      p[j + 2] += (x[j + 2] - p[j + 2]) * FRICTION;
    }
    if (x[j + 1] > this.o.topY + 0.1) return;
    for (const r of this.racks) {
      // in the frame of the rack: its front faces +z
      const dx = x[j] - r.x, dz = x[j + 2] - r.z;
      const lx = r.c * dx - r.s * dz, lz = r.s * dx + r.c * dz;
      if (Math.abs(lx) > RACK_HALF || lz > RACK_FRONT || lz < -0.5) continue;
      x[j] = r.x + r.c * lx + r.s * RACK_FRONT;
      x[j + 2] = r.z - r.s * lx + r.c * RACK_FRONT;
    }
  }

  // ------------------------------------------------------------ the heap

  private height(wx: number, wz: number): number {
    const fx = (wx - this.hx0) / CELL, fz = (wz - this.hz0) / CELL;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= this.nx - 1 || iz >= this.nz - 1) return this.o.floorY;
    const u = fx - ix, w = fz - iz, h = this.heap, k = iz * this.nx + ix;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - w) + (h[k + this.nx] * (1 - u) + h[k + this.nx + 1] * u) * w;
  }

  /**
   * How high the heap may grow there: lower away from its middle (the cords that
   * reach it roll off its sides), and lumpy, as a heap thrown down is: a smooth
   * cap reads as an invisible dome the cords lie on.
   */
  private cap(wx: number, wz: number): number {
    const dx = wx - this.o.centre.x, dz = wz - this.o.centre.z;
    const d2 = (dx * dx + dz * dz) / (HEAP_WIDE * HEAP_WIDE);
    const b = this.bumps;
    const lumps = Math.sin(wx * 9 + b[0]) * Math.sin(wz * 8 + b[1]) + 0.6 * Math.sin(wx * 17 + wz * 5 + b[2]) * Math.sin(wz * 15 - wx * 6 + b[3]);
    return this.o.floorY + HEAP_MAX * Math.max(0.1, 1 - d2) * (0.65 + 0.35 * lumps / 1.6);
  }

  /** raises `map` under a node of a cord lying there: a dome of `reach` around it, `loft` above its top */
  private splat(map: Float32Array, wx: number, wy: number, wz: number, r: number, reach: number, loft: number): void {
    const cx = (wx - this.hx0) / CELL, cz = (wz - this.hz0) / CELL, n = Math.ceil(reach / CELL);
    const cap = this.cap(wx, wz);
    for (let iz = Math.max(0, Math.floor(cz) - n); iz <= Math.min(this.nz - 1, Math.ceil(cz) + n); iz++) {
      for (let ix = Math.max(0, Math.floor(cx) - n); ix <= Math.min(this.nx - 1, Math.ceil(cx) + n); ix++) {
        const d2 = ((ix - cx) ** 2 + (iz - cz) ** 2) * CELL * CELL;
        if (d2 > reach * reach) continue;
        const h = Math.min(cap, wy + Math.sqrt(1 - d2 / (reach * reach)) * (r + loft));
        const k = iz * this.nx + ix;
        if (h > map[k]) map[k] = h;
      }
    }
  }

  // ------------------------------------------------------------ drawing

  /** sends the nodes and plugs of the cords that moved (the GPU sweeps their tubes) */
  private draw(): void {
    this.tube.setDrawn(this.used * (NODES - 1));
    let any = false;
    for (let c = 0; c < this.used; c++) {
      if (this.moved[c] !== 1) continue;
      if (this.state[c] !== S.Free) this.nodes.write(this.x, c * NODES, NODES, R);
      this.ends(c);
      any = true;
    }
    if (!any) return;
    for (const p of this.plugs) p.boot.instanceMatrix.needsUpdate = p.housing.instanceMatrix.needsUpdate = true;
  }

  private ends(c: number): void {
    const p = this.plugs[this.copper[c]], x = this.x, o = c * NODES * 3;
    for (const e of [0, 1]) {
      const i = 2 * c + e;
      if (this.state[c] === S.Free) { p.boot.setMatrixAt(i, ZERO); p.housing.setMatrixAt(i, ZERO); continue; }
      const n0 = o + 3 * (e ? NODES - 1 : 0), n1 = o + 3 * (e ? NODES - 2 : 1);
      this.q.setFromUnitVectors(Z, this.v.set(x[n0] - x[n1], x[n0 + 1] - x[n1 + 1], x[n0 + 2] - x[n1 + 2]).normalize());
      this.m4.compose(this.v.set(x[n0], x[n0 + 1], x[n0 + 2]), this.q, this.one);
      p.boot.setMatrixAt(i, this.m4);
      p.housing.setMatrixAt(i, this.m4);
    }
  }
}
