// The tubes of the cords, swept on the GPU. The CPU used to turn every node into
// `sub` rings of `radial` vertices (positions and normals) and send them all each
// frame a cord moved: the bigger the tube, the more of the frame went into it.
// Now it only sends the nodes, three texels each (position and radius, the
// normal of a frame carried along the cord, the glow of the node), and the
// vertex shader finds its own point: the Catmull-Rom curve between the nodes,
// its tangent, the ring around it.
//
// Nor does the geometry hold a vertex per point of every tube: that was 128
// vertices a node, 10 kB of attributes and indices, and gigabytes for an aisle
// of tall racks. Every segment of every cord is one instance of the same
// stretch of tube (sub + 1 rings: the last one is the first of the next
// segment, drawn twice), with a few numbers of its own: its first node, the
// ends of its cord, its colour, where it starts along the cord.
//
// Those vertices are not free on the GPU either: the cords are drawn in five
// passes (the image, its shadow, the normals of the reflections and of the
// ambient occlusion, the mask of the reflections). Only the image shows their
// outline and their shading, so only it draws the fine tube: the other passes
// draw every other ring, every other vertex round it (a quarter of the work).
// And a cord a few pixels wide needs no 16 sides: as its radius on screen
// shrinks, every other vertex (then three in four) folds onto its neighbour,
// along the cord and around it, and their triangles, flat, are dropped before
// they cost a pixel.
//
// Folded vertices still run the shader, though. When even the nearest of the
// nodes is that far (a whole aisle of racks across the room), the mesh draws
// the coarser lists of triangles instead, a quarter or a sixteenth of the
// vertices: those that would not have folded.
//
//   const nodes = new TubeNodes(nodeCount);
//   const tubes = new TubeMesh(segmentCount, new THREE.MeshStandardMaterial({ vertexColors: true }), nodes);
//   tubes.lay(0, 0, n, color, 0, segLength, 0);   // a cord of n nodes from node 0, on the segments from 0
//   nodes.write(positions, 0, n, radius);          // every frame it moves (or a TubeSync)
//
// Any material draws them: its vertex shader sees `position` and `normal` as
// the point of the tube, and two values of its own, `tubeCoord` (where the
// vertex is along the cord at rest and round it, and the cord's tag) and
// `tubeTint` (the glow of the nearest node). `aliases` gives them other names
// too, for materials written for other geometry.

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
const W = 1024;
const PER = 3;

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
function stretch(radial: number, sub: number): { rings: THREE.BufferAttribute; lists: THREE.BufferAttribute[] } {
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

// The point and normal of the vertex, as the CPU found them before: the curve
// through the four nodes around its stretch, the frame between those of its two
// nodes, set square to the tangent. Then `position` and `normal` stand for them
// in the rest of the shader, whoever wrote it (the material, the normals and
// depth of the passes), and so do `tubeCoord` (where the vertex is along the
// cord at rest, cos and sin of its angle round it, the cord's tag) and
// `tubeTint` (the glow of the node it is nearest to), under their aliases too.
function shaderOf(o: Required<TubeOptions>): { decl: string; main: string; key: string } {
  const SUB = o.sub, RADIAL = o.radial, LOD_HALF = o.lodHalf, LOD_QUARTER = o.lodQuarter;
  const aliases = Object.entries(o.aliases).map(([name, of]) => `#define ${name} ${of}`).join('\n');
  const decl = /* glsl */ `
uniform highp sampler2D tubeNodes;
uniform float tubeHalfHeight;
attribute vec3 tubeSeg;
attribute vec3 tubeArc;
vec4 tubeAt(int k) { return texelFetch(tubeNodes, ivec2(k % ${W}, k / ${W}), 0); }
`;
  const main = /* glsl */ `
  int tI1 = int(tubeSeg.x + 0.5);
  int tA = int(tubeSeg.y + 0.5), tB = int(tubeSeg.z + 0.5);
  int tI0 = max(tI1 - 1, tA), tI2 = min(tI1 + 1, tB), tI3 = min(tI1 + 2, tB);
  int tK = int(normal.x + 0.5), tR = int(normal.y + 0.5);
  // radius on screen (px), from the node of the ring at either end (the ring both segments
  // draw folds the same way in both), from the first node elsewhere
  vec4 tN1 = tubeAt(${PER} * tI1), tN2 = tubeAt(${PER} * tI2);
  vec4 tEnd = tK == ${SUB} ? tN2 : tN1;
  float tPx = tEnd.w * abs(projectionMatrix[1][1]) * tubeHalfHeight / max(1e-4, -(modelViewMatrix * vec4(tEnd.xyz, 1.0)).z);
  int tStep = tPx < ${LOD_QUARTER.toFixed(3)} ? 4 : tPx < ${LOD_HALF.toFixed(3)} ? 2 : 1;
  tK -= tK % tStep;
  tR -= tR % tStep;
  float tU = float(tK) / ${SUB.toFixed(1)}, tU2 = tU * tU, tU3 = tU2 * tU;
  float tAng = float(tR) * ${((2 * Math.PI) / RADIAL).toFixed(8)};
  vec3 tP0 = tubeAt(${PER} * tI0).xyz, tP1 = tN1.xyz, tP2 = tN2.xyz, tP3 = tubeAt(${PER} * tI3).xyz;
  vec3 tC1 = -tP0 + tP2, tC2 = 2.0 * tP0 - 5.0 * tP1 + 4.0 * tP2 - tP3, tC3 = -tP0 + 3.0 * tP1 - 3.0 * tP2 + tP3;
  vec3 tCentre = 0.5 * (2.0 * tP1 + tC1 * tU + tC2 * tU2 + tC3 * tU3);
  vec3 tT = tC1 + 2.0 * tC2 * tU + 3.0 * tC3 * tU2;
  if (dot(tT, tT) < 1e-14) tT = tP2 - tP0;
  tT = normalize(tT);
  vec3 tN = mix(tubeAt(${PER} * tI1 + 1).xyz, tubeAt(${PER} * tI2 + 1).xyz, tU);
  tN -= dot(tN, tT) * tT;
  tN = dot(tN, tN) < 1e-12 ? normalize(cross(tT, abs(tT.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))) : normalize(tN);
  vec3 tubeNormal = tN * cos(tAng) + cross(tT, tN) * sin(tAng);
  vec3 tubePos = tCentre + tubeNormal * tEnd.w;
  vec4 tubeCoord = vec4(tubeArc.x + tU * tubeArc.y, cos(tAng), sin(tAng), tubeArc.z);
  vec3 tubeTint = tubeAt(${PER} * (tU < 0.5 ? tI1 : tI2) + 2).rgb;
#define position tubePos
#define normal tubeNormal
${aliases}
`;
  return { decl, main, key: `tube-${RADIAL}-${SUB}-${LOD_HALF}-${LOD_QUARTER}-${Object.entries(o.aliases).join(',')}` };
}

function resolve(o: TubeOptions): Required<TubeOptions> {
  return { ...DEFAULTS, ...o, aliases: { ...o.aliases } };
}

/** half the height of what is being drawn into (px), set before each draw */
const tubeHalfHeight = { value: 500 };
const size = new THREE.Vector2();
const sphere = new THREE.Sphere();
const eye = new THREE.Vector3();

/** the materials made to draw tubes (their copies are not) */
const sweptSet = new WeakSet<THREE.Material>();

/** makes a material draw the tubes of these nodes (any material: its shader only has to start with `void main() {`) */
export function swept<T extends THREE.Material>(m: T, nodes: TubeNodes, options: TubeOptions = {}): T {
  const sh = shaderOf(resolve(options));
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.uniforms.tubeNodes = { value: nodes.texture };
    s.uniforms.tubeHalfHeight = tubeHalfHeight;
    s.vertexShader = s.vertexShader.replace('void main() {', `${sh.decl}\nvoid main() {\n${sh.main}`);
  };
  m.customProgramCacheKey = () => `${prevKey}-${sh.key}`;
  sweptSet.add(m);
  return m;
}

/**
 * The mesh of the tubes: `segments` instances of the stretch of tube, laid
 * along the cords by lay(). Its geometry has no positions of its own, so every
 * material it is drawn with must be swept: its shadow, and the materials the
 * passes put in place of its own (the normals of the reflections and of the
 * ambient occlusion, the mask of the reflections), for which it hands a swept
 * copy of each, made once.
 */
export class TubeMesh extends THREE.Mesh {
  readonly isTubeMesh = true;
  declare geometry: THREE.InstancedBufferGeometry;
  private copies = new Map<THREE.Material, THREE.Material>();
  /** its material, or the one a pass put in its place for a while */
  private own!: THREE.Material;
  /** the triangle lists of the stretch, finest first */
  private lists: THREE.BufferAttribute[];
  /** per segment: first node, first and last of its cord; colour; start along the cord (m), length, kind */
  private seg: THREE.InstancedBufferAttribute;
  private color: THREE.InstancedBufferAttribute;
  private arc: THREE.InstancedBufferAttribute;
  /** the finest list the nearest node needs from where the camera stands (0, 1, 2), as of the last image */
  level = 0;
  private options: Required<TubeOptions>;

  constructor(segments: number, private main: THREE.Material, private nodes: TubeNodes, options: TubeOptions = {}) {
    const o = resolve(options);
    const geo = new THREE.InstancedBufferGeometry();
    const { rings, lists } = stretch(o.radial, o.sub);
    geo.setAttribute('normal', rings);
    const seg = new THREE.InstancedBufferAttribute(new Float32Array(3 * segments), 3);
    const color = new THREE.InstancedBufferAttribute(new Float32Array(3 * segments), 3);
    const arc = new THREE.InstancedBufferAttribute(new Float32Array(3 * segments), 3);
    geo.setAttribute('tubeSeg', seg);
    geo.setAttribute('color', color);
    geo.setAttribute('tubeArc', arc);
    geo.setIndex(lists[0]);
    geo.instanceCount = segments;
    super(geo, swept(main, nodes, o));
    this.options = o;
    this.own = main;
    this.lists = lists;
    this.seg = seg;
    this.color = color;
    this.arc = arc;
    Object.defineProperty(this, 'material', {
      get: () => {
        let root = this.parent;
        while (root?.parent) root = root.parent;
        const over = (root as THREE.Scene | null)?.isScene ? (root as THREE.Scene).overrideMaterial : null;
        return this.sweptOf(over && this.own.allowOverride ? over : this.own);
      },
      set: (m: THREE.Material) => { this.own = m; },
    });
    this.customDepthMaterial = swept(new THREE.MeshDepthMaterial(), nodes, o);
    this.customDistanceMaterial = swept(new THREE.MeshDistanceMaterial(), nodes, o);
    this.frustumCulled = false;
    // the fine tube for the image only
    this.onBeforeRender = (r, _s, c, _g, m) => {
      const t = r.getRenderTarget();
      tubeHalfHeight.value = (t ? t.height : r.getDrawingBufferSize(size).y) / 2;
      if (m === this.main) this.level = this.levelFor(c);
      this.lod(m === this.main ? this.level : this.level + 1);
    };
    // (before the image: from the camera, at the size of the last one)
    this.onBeforeShadow = (_r, _o, c) => { this.level = this.levelFor(c); this.lod(this.level + 1); };
  }

  /**
   * Lays the cord through the n nodes from `start` on the segments from `at`
   * (n − 1 of them): its colour, and along it, where its first segment starts
   * and the length at rest of a segment (m), and a tag of the caller's (the
   * last of `tubeCoord`).
   */
  lay(at: number, start: number, n: number, color: THREE.Color, arc0: number, seg: number, tag: number): void {
    const s = this.seg.array as Float32Array, c = this.color.array as Float32Array, a = this.arc.array as Float32Array;
    for (let j = 0; j < n - 1; j++) {
      const o = 3 * (at + j);
      s[o] = start + j; s[o + 1] = start; s[o + 2] = start + n - 1;
      c[o] = color.r; c[o + 1] = color.g; c[o + 2] = color.b;
      a[o] = arc0 + j * seg; a[o + 1] = seg; a[o + 2] = tag;
    }
    for (const attr of [this.seg, this.color, this.arc]) {
      attr.addUpdateRange(3 * at, 3 * (n - 1));
      attr.needsUpdate = true;
    }
  }

  /** draws only the first segments */
  setDrawn(segments: number): void {
    this.geometry.instanceCount = segments;
  }

  /**
   * The finest list the image needs: none of the nodes is nearer the camera
   * than the edge of their box, so if a tube there is thin enough on screen
   * for the shader to fold its vertices (see `shaderOf`), all of them are.
   */
  private levelFor(camera: THREE.Camera): number {
    const b = this.nodes.box;
    if (b.isEmpty() || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return 0;
    b.getBoundingSphere(sphere).applyMatrix4(this.matrixWorld);
    eye.setFromMatrixPosition(camera.matrixWorld);
    // (a little nearer: the shader goes by the depth, a little less than the distance off the axis)
    const d = Math.max(1e-3, 0.9 * (eye.distanceTo(sphere.center) - sphere.radius));
    const px = this.nodes.radius * camera.projectionMatrix.elements[5] * tubeHalfHeight.value / d;
    return px < this.options.lodQuarter ? 2 : px < this.options.lodHalf ? 1 : 0;
  }

  private lod(level: number): void {
    this.geometry.index = this.lists[Math.min(level, this.lists.length - 1)];
  }

  private sweptOf(m: THREE.Material): THREE.Material {
    if (sweptSet.has(m)) return m;
    let c = this.copies.get(m);
    if (!c) {
      c = swept(m.clone(), this.nodes, this.options);
      // drawn as it is when the scene is drawn with another material
      c.allowOverride = false;
      this.copies.set(m, c);
    }
    return c;
  }

  /** frees what is its own beyond its geometry and material (disposeTree frees those) */
  dispose(): void {
    // (the geometry frees only the index it holds)
    this.geometry.index = this.lists[0];
    for (const m of [...this.copies.values(), this.customDepthMaterial!, this.customDistanceMaterial!]) m.dispose();
    this.copies.clear();
    this.nodes.dispose();
  }
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
