// The tubes of the cords, swept on the GPU. The CPU used to turn every node into
// SUB rings of RADIAL vertices (positions and normals) and send them all each
// frame a cord moved: the bigger the tube, the more of the frame went into it.
// Now it only sends the nodes, two texels each (position and radius, the normal
// of a frame carried along the cord), and the vertex shader finds its own point:
// the Catmull-Rom curve between the nodes, its tangent, the ring around it. The
// geometry never changes; a finer tube costs the GPU more vertices, not the CPU
// a bigger loop and a bigger upload.
//
// Those vertices are not free on the GPU either: the cords are drawn in five
// passes (the image, its shadow, the normals of the reflections and of the
// ambient occlusion, the mask of the reflections). Only the image shows their
// outline and their shading, so only it draws the fine tube: the other passes
// draw every other ring, every other vertex round it (a quarter of the work),
// from the same vertices. And a cord a few pixels wide needs no 16 sides: as its
// radius on screen shrinks, every other vertex (then three in four) folds onto
// its neighbour, along the cord and around it, and their triangles, flat, are
// dropped before they cost a pixel. The mesh stays whole: it is the same one.

import * as THREE from 'three';

/** vertices round a ring, rings per segment (Catmull-Rom in between): both multiples of 4, for the levels of detail */
export const RADIAL = 16;
export const SUB = 8;
/** radius on screen (px) under which a tube has half its vertices, a quarter */
const LOD_HALF = 6;
const LOD_QUARTER = 1.5;
/** texels per row of the node map */
const W = 1024;

/** vertices and triangle indices of a tube through n nodes, fine (the image) and coarse (the other passes) */
export const tubeVerts = (n: number) => ((n - 1) * SUB + 1) * RADIAL;
export const tubeIndices = (n: number) => (n - 1) * SUB * RADIAL * 6;
export const coarseIndices = (n: number) => tubeIndices(n) / 4;

/**
 * The nodes of the tubes, as the GPU reads them: node i is texel 2i (position,
 * radius: 0 hides the tube) and 2i + 1 (normal of its frame, parallel-transported
 * from the first node of the cord, so that the rings do not twist).
 */
export class TubeNodes {
  readonly texture: THREE.DataTexture;
  private data: Float32Array;

  constructor(nodes: number) {
    const h = Math.max(1, Math.ceil((2 * nodes) / W));
    this.data = new Float32Array(W * h * 4);
    this.texture = new THREE.DataTexture(this.data, W, h, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
  }

  /** the n nodes of `x` from `start`, as a tube of radius R (0: hidden); sent with the next frame */
  write(x: ArrayLike<number>, start: number, n: number, R: number): void {
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
      const o = 8 * i;
      d[o] = x[3 * i]; d[o + 1] = x[3 * i + 1]; d[o + 2] = x[3 * i + 2]; d[o + 3] = R;
      d[o + 4] = nx; d[o + 5] = ny; d[o + 6] = nz;
    }
    this.texture.needsUpdate = true;
  }

  /** hides the tube through these nodes (they keep their place) */
  hide(start: number, n: number): void {
    for (let i = start; i < start + n; i++) this.data[8 * i + 3] = 0;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/**
 * Lays out one tube through the n nodes from `start`, from vertex v0 (a whole
 * number of rings: the shader takes the angle of a vertex around the cord from
 * its index). In `tube` (vec3 per vertex, the geometry's `normal`: without one,
 * three.js would shade it flat) the node its ring follows plus how far towards
 * the next, the first and last nodes of the cord; its triangles in `idx` from
 * i0, and those of the coarse tube in `coarse` from i0 / 4.
 */
export function layTube(tube: Float32Array, v0: number, start: number, n: number, idx: Uint32Array, coarse: Uint32Array, i0: number): void {
  const S = (n - 1) * SUB + 1;
  for (let s = 0; s < S; s++) {
    for (let r = 0; r < RADIAL; r++) {
      const o = 3 * (v0 + s * RADIAL + r);
      tube[o] = start + s / SUB;
      tube[o + 1] = start;
      tube[o + 2] = start + n - 1;
    }
  }
  const quads = (out: Uint32Array, k: number, step: number) => {
    const next = step * RADIAL;
    for (let s = 0; s < S - 1; s += step) {
      for (let r = 0; r < RADIAL; r += step) {
        const a = v0 + s * RADIAL + r, b = v0 + s * RADIAL + ((r + step) % RADIAL);
        out[k++] = a; out[k++] = a + next; out[k++] = b;
        out[k++] = b; out[k++] = a + next; out[k++] = b + next;
      }
    }
  };
  quads(idx, i0, 1);
  quads(coarse, i0 / 4, 2);
}

// The point and normal of the vertex, as the CPU found them before: the curve
// through the four nodes around its stretch, the frame between those of its two
// nodes, set square to the tangent. Then `position` and `normal` stand for them
// in the rest of the shader, whoever wrote it (the jacket, the glow of the LEDs,
// the normals and depth of the passes).
const DECL = /* glsl */ `
uniform highp sampler2D tubeNodes;
uniform float tubeHalfHeight;
vec4 tubeAt(int k) { return texelFetch(tubeNodes, ivec2(k % ${W}, k / ${W}), 0); }
`;
const MAIN = /* glsl */ `
  int tI1 = int(normal.x);
  int tA = int(normal.y + 0.5), tB = int(normal.z + 0.5);
  vec4 tN1 = tubeAt(2 * tI1);
  // radius on screen (px), from the first node of the stretch: the same for all its vertices
  float tPx = tN1.w * abs(projectionMatrix[1][1]) * tubeHalfHeight / max(1e-4, -(modelViewMatrix * vec4(tN1.xyz, 1.0)).z);
  int tStep = tPx < ${LOD_QUARTER.toFixed(1)} ? 4 : tPx < ${LOD_HALF.toFixed(1)} ? 2 : 1;
  int tK = int((normal.x - float(tI1)) * ${SUB.toFixed(1)} + 0.5), tR = gl_VertexID % ${RADIAL};
  tK -= tK % tStep;
  tR -= tR % tStep;
  float tU = float(tK) / ${SUB.toFixed(1)}, tU2 = tU * tU, tU3 = tU2 * tU;
  float tAng = float(tR) * ${((2 * Math.PI) / RADIAL).toFixed(8)};
  int tI0 = max(tI1 - 1, tA), tI2 = min(tI1 + 1, tB), tI3 = min(tI1 + 2, tB);
  vec3 tP0 = tubeAt(2 * tI0).xyz, tP1 = tN1.xyz, tP2 = tubeAt(2 * tI2).xyz, tP3 = tubeAt(2 * tI3).xyz;
  vec3 tC1 = -tP0 + tP2, tC2 = 2.0 * tP0 - 5.0 * tP1 + 4.0 * tP2 - tP3, tC3 = -tP0 + 3.0 * tP1 - 3.0 * tP2 + tP3;
  vec3 tCentre = 0.5 * (2.0 * tP1 + tC1 * tU + tC2 * tU2 + tC3 * tU3);
  vec3 tT = tC1 + 2.0 * tC2 * tU + 3.0 * tC3 * tU2;
  if (dot(tT, tT) < 1e-14) tT = tP2 - tP0;
  tT = normalize(tT);
  vec3 tN = mix(tubeAt(2 * tI1 + 1).xyz, tubeAt(2 * tI2 + 1).xyz, tU);
  tN -= dot(tN, tT) * tT;
  tN = dot(tN, tN) < 1e-12 ? normalize(cross(tT, abs(tT.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))) : normalize(tN);
  vec3 tubeNormal = tN * cos(tAng) + cross(tT, tN) * sin(tAng);
  vec3 tubePos = tCentre + tubeNormal * tN1.w;
#define position tubePos
#define normal tubeNormal
`;

/** half the height of what is being drawn into (px), set before each draw */
const tubeHalfHeight = { value: 500 };
const size = new THREE.Vector2();

/** the materials made to draw tubes (their copies are not) */
const sweptSet = new WeakSet<THREE.Material>();

/** makes a material draw the tubes of these nodes (any material: its shader only has to start with `void main() {`) */
export function swept<T extends THREE.Material>(m: T, nodes: TubeNodes): T {
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.uniforms.tubeNodes = { value: nodes.texture };
    s.uniforms.tubeHalfHeight = tubeHalfHeight;
    s.vertexShader = s.vertexShader.replace('void main() {', `${DECL}\nvoid main() {\n${MAIN}`);
  };
  m.customProgramCacheKey = () => `${prevKey}-tube`;
  sweptSet.add(m);
  return m;
}

/**
 * The mesh of the tubes. Its geometry has no positions of its own, so every
 * material it is drawn with must be swept: its shadow, and the materials the
 * passes put in place of its own (the normals of the reflections and of the
 * ambient occlusion, the mask of the reflections), for which it hands a swept
 * copy of each, made once.
 */
export class TubeMesh extends THREE.Mesh {
  readonly isTubeMesh = true;
  private copies = new Map<THREE.Material, THREE.Material>();
  /** its material, or the one a pass put in its place for a while */
  private own!: THREE.Material;
  private fine: THREE.BufferAttribute;
  private coarse: THREE.BufferAttribute;
  /** how many indices of each to draw (the first tubes only) */
  private drawn = { fine: Infinity, coarse: Infinity };

  /** `geo`: the fine triangles as its index; `coarse`: the others (see layTube) */
  constructor(geo: THREE.BufferGeometry, coarse: Uint32Array, private main: THREE.Material, private nodes: TubeNodes) {
    super(geo, swept(main, nodes));
    this.own = main;
    this.fine = geo.index!;
    this.coarse = new THREE.BufferAttribute(coarse, 1);
    Object.defineProperty(this, 'material', {
      get: () => {
        let root = this.parent;
        while (root?.parent) root = root.parent;
        const over = (root as THREE.Scene | null)?.isScene ? (root as THREE.Scene).overrideMaterial : null;
        return this.sweptOf(over && this.own.allowOverride ? over : this.own);
      },
      set: (m: THREE.Material) => { this.own = m; },
    });
    this.customDepthMaterial = swept(new THREE.MeshDepthMaterial(), nodes);
    this.customDistanceMaterial = swept(new THREE.MeshDistanceMaterial(), nodes);
    this.frustumCulled = false;
    // the fine tube for the image only
    this.onBeforeRender = (r, _s, _c, _g, m) => {
      const t = r.getRenderTarget();
      tubeHalfHeight.value = (t ? t.height : r.getDrawingBufferSize(size).y) / 2;
      this.lod(m === this.main);
    };
    this.onBeforeShadow = () => this.lod(false);
  }

  /** draws only the first tubes: `fine` indices of the fine tube, as many tubes of the coarse one */
  setDrawn(fine: number, coarse: number): void {
    this.drawn.fine = fine;
    this.drawn.coarse = coarse;
  }

  private lod(fine: boolean): void {
    this.geometry.index = fine ? this.fine : this.coarse;
    this.geometry.drawRange.count = fine ? this.drawn.fine : this.drawn.coarse;
  }

  private sweptOf(m: THREE.Material): THREE.Material {
    if (sweptSet.has(m)) return m;
    let c = this.copies.get(m);
    if (!c) {
      c = swept(m.clone(), this.nodes);
      // drawn as it is when the scene is drawn with another material
      c.allowOverride = false;
      this.copies.set(m, c);
    }
    return c;
  }

  /** frees what is its own beyond its geometry and material (disposeTree frees those) */
  dispose(): void {
    // (the geometry frees only the index it holds)
    this.geometry.index = this.fine;
    for (const m of [...this.copies.values(), this.customDepthMaterial!, this.customDistanceMaterial!]) m.dispose();
    this.copies.clear();
    this.nodes.dispose();
  }
}
