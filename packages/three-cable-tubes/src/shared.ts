// What the two ways of drawing the tubes share (tube.ts for WebGLRenderer,
// webgpu.ts for WebGPURenderer): the nodes as the GPU reads them, the stretch
// of tube every segment is drawn with, the options, and the writing of the
// nodes of the cables that moved.

import * as THREE from 'three';

/** how the tubes are drawn (all but `aliases` change their shader) */
export interface TubeOptions {
  /** vertices round a ring, rings per segment (Catmull-Rom in between): both multiples of 4, for the levels of detail */
  radial?: number;
  sub?: number;
  /** radius on screen (px) under which a tube has half its vertices, a quarter */
  lodHalf?: number;
  lodQuarter?: number;
  /**
   * other names of `tubeCoord` and `tubeTint` in the vertex shader, for
   * materials that read their own attributes: { jacket: 'tubeCoord' }
   */
  aliases?: Record<string, 'tubeCoord' | 'tubeTint'>;
}

const DEFAULTS: Required<TubeOptions> = { radial: 16, sub: 8, lodHalf: 6, lodQuarter: 1.5, aliases: {} };

/** texels per row of the node map, and per node */
export const W = 1024;
export const PER = 3;

/**
 * The nodes of the tubes, as the GPU reads them: node i is texel 3i (position,
 * radius: 0 hides the tube), 3i + 1 (normal of its frame, parallel-transported
 * from the first node of the cord, so that the rings do not twist) and 3i + 2
 * (the glow of the cord there, linear RGB).
 */
export class TubeNodes {
  readonly texture: THREE.DataTexture;
  private data: Float32Array;
  /** the box of every node ever written (it only grows), where the tubes may be; their largest radius */
  readonly box = new THREE.Box3();
  radius = 0;

  constructor(nodes: number) {
    const h = Math.max(1, Math.ceil((PER * nodes) / W));
    this.data = new Float32Array(W * h * 4);
    this.texture = new THREE.DataTexture(this.data, W, h, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
  }

  /**
   * The n nodes of `x` from `start`, as a tube of radius R (0: hidden), or of
   * radius R[i] at node i; sent with the next frame.
   */
  write(x: ArrayLike<number>, start: number, n: number, R: number | ArrayLike<number>): void {
    // (Math.sqrt, not Math.hypot: a third of the time)
    const d = this.data;
    let nx = 0, ny = 0, nz = 0;
    for (let j = 0; j < n; j++) {
      const i = start + j, a = start + Math.max(0, j - 1), b = start + Math.min(n - 1, j + 1);
      let tx = x[3 * b] - x[3 * a], ty = x[3 * b + 1] - x[3 * a + 1], tz = x[3 * b + 2] - x[3 * a + 2];
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      if (j === 0) {
        // any vector not parallel to the tangent
        if (Math.abs(ty) < 0.9) { nx = 0; ny = 1; nz = 0; } else { nx = 1; ny = 0; nz = 0; }
      }
      // project the previous normal on the plane of the new tangent
      const dp = nx * tx + ny * ty + nz * tz;
      nx -= dp * tx; ny -= dp * ty; nz -= dp * tz;
      let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl < 1e-6) { if (Math.abs(ty) < 0.9) { nx = -tz; ny = 0; nz = tx; } else { nx = 0; ny = tz; nz = -ty; } nl = Math.sqrt(nx * nx + ny * ny + nz * nz); }
      nx /= nl; ny /= nl; nz /= nl;
      const o = 4 * PER * i, r = typeof R === 'number' ? R : R[i];
      d[o] = x[3 * i]; d[o + 1] = x[3 * i + 1]; d[o + 2] = x[3 * i + 2]; d[o + 3] = r;
      d[o + 4] = nx; d[o + 5] = ny; d[o + 6] = nz;
      grow(this.box, d[o], d[o + 1], d[o + 2], r);
      if (r > this.radius) this.radius = r;
    }
    this.texture.needsUpdate = true;
  }

  /** hides the tube through these nodes (they keep their place) */
  hide(start: number, n: number): void {
    for (let i = start; i < start + n; i++) this.data[4 * PER * i + 3] = 0;
    this.texture.needsUpdate = true;
  }

  /** the glow of the cord at node i (linear RGB); sent with the next frame */
  tint(i: number, c: THREE.Color): void {
    const o = 4 * PER * i + 8;
    this.data[o] = c.r; this.data[o + 1] = c.g; this.data[o + 2] = c.b;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function grow(b: THREE.Box3, x: number, y: number, z: number, r: number): void {
  if (x - r < b.min.x) b.min.x = x - r;
  if (y - r < b.min.y) b.min.y = y - r;
  if (z - r < b.min.z) b.min.z = z - r;
  if (x + r > b.max.x) b.max.x = x + r;
  if (y + r > b.max.y) b.max.y = y + r;
  if (z + r > b.max.z) b.max.z = z + r;
}

/**
 * The stretch of tube every segment is drawn with: sub + 1 rings of radial
 * vertices, each with its ring and its place round it in `normal` (without a
 * normal, three.js would shade it flat), and its triangles three times: every
 * ring and vertex, one in two, one in four.
 */
export function stretch(radial: number, sub: number): { rings: THREE.BufferAttribute; lists: THREE.BufferAttribute[] } {
  const RADIAL = radial, SUB = sub;
  const rings = new Float32Array((SUB + 1) * RADIAL * 3);
  for (let k = 0; k <= SUB; k++) {
    for (let r = 0; r < RADIAL; r++) {
      const o = 3 * (k * RADIAL + r);
      rings[o] = k;
      rings[o + 1] = r;
    }
  }
  const lists = [1, 2, 4].map((step) => {
    const out: number[] = [];
    for (let k = 0; k < SUB; k += step) {
      for (let r = 0; r < RADIAL; r += step) {
        const a = k * RADIAL + r, b = k * RADIAL + ((r + step) % RADIAL), next = step * RADIAL;
        out.push(a, a + next, b, b, a + next, b + next);
      }
    }
    return new THREE.BufferAttribute(new Uint16Array(out), 1);
  });
  return { rings: new THREE.BufferAttribute(rings, 3), lists };
}

export function resolve(o: TubeOptions): Required<TubeOptions> {
  return { ...DEFAULTS, ...o, aliases: { ...o.aliases } };
}

/** a simulation, as a TubeSync reads it: the positions of its nodes, and its cables */
export interface CableSource {
  x: ArrayLike<number>;
  cables: readonly { start: number; count: number; asleep: boolean }[];
}

/**
 * Writes the nodes of the cables that moved: a sleeping cable is written
 * again only if a few of its nodes moved all the same (put somewhere else).
 */
export class TubeSync {
  private last: number[] = [];

  constructor(private nodes: TubeNodes, private radius: number | ArrayLike<number>) {}

  /** writes cable c if it moved (or anyway: `force`); whether it did */
  cable(src: CableSource, c: number, force = false): boolean {
    const x = src.x, cb = src.cables[c];
    const sig = x[3 * cb.start] + x[3 * (cb.start + (cb.count >> 1)) + 1] * 3.1 + x[3 * (cb.start + cb.count - 1) + 2] * 7.7;
    if (!force && cb.asleep && sig === this.last[c]) return false;
    this.last[c] = sig;
    this.nodes.write(x, cb.start, cb.count, this.radius);
    return true;
  }

  /** every cable that moved */
  update(src: CableSource, force = false): void {
    for (let c = 0; c < src.cables.length; c++) this.cable(src, c, force);
  }
}
