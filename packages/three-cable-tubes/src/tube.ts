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
import { PER, W, resolve, stretch, type TubeNodes, type TubeOptions } from './shared';

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
