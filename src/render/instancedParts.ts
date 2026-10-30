// Parts repeated by the hundred (connectors, LEDs, velcros): one mesh for
// all of a kind, each copy with its own matrix and colour. three's
// InstancedMesh does the same, but builds a shader of its own for every such
// mesh (its uuid is part of the key of its shader), for the image and again
// for the shadows: a cabinet holds dozens, and each new one stalled the page
// while its shaders were made. Here the matrices and colours are attributes
// of the geometry, read by nodes built once: every mesh of a material shares
// its shader.

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';

const { Fn, attribute, mat4, materialColor, normalLocal, positionLocal, transformNormal, vec4 } = tsl;

/** the matrix of the copy being drawn */
export const partMatrix: ShaderNode = mat4(...[0, 1, 2, 3].map((k) => attribute(`partMatrix${k}`, 'vec4')));

/** where a vertex of a part lies, its copy placed (its normal turned with it) */
const PART_POSITION = Fn(() => {
  normalLocal.assign(transformNormal(normalLocal, partMatrix));
  return partMatrix.mul(vec4(positionLocal, 1)).xyz;
})();

/** the colour of the material, times the copy's own */
const PART_COLOR = materialColor.mul(vec4(attribute('partColor', 'vec3'), 1));

/**
 * Copies of a geometry, drawn in one call: `capacity` at most, the first
 * `drawn` of them. Its material places them (`positionNode`) and tints them
 * (`colorNode`), unless it does so itself.
 */
export class InstancedParts extends THREE.Mesh<THREE.InstancedBufferGeometry, THREE.NodeMaterial> {
  readonly isInstancedParts = true;
  /**
   * 16 floats a copy, column-major, as Matrix4.toArray writes them. (Not
   * `instanceMatrix`, nor `instanceColor` below: three reads those names on
   * any object, and tinted these parts black with a colour it never set.)
   */
  readonly matrices: THREE.InstancedInterleavedBuffer;
  /** linear RGB, white until set */
  readonly colors: THREE.InstancedBufferAttribute;

  constructor(geometry: THREE.BufferGeometry, material: THREE.NodeMaterial, readonly capacity: number) {
    const geo = new THREE.InstancedBufferGeometry();
    // (the geometry's own attributes, shared, not copied)
    geo.index = geometry.index;
    for (const [name, a] of Object.entries(geometry.attributes)) geo.setAttribute(name, a);
    const matrices = new THREE.InstancedInterleavedBuffer(new Float32Array(16 * capacity), 16, 1);
    for (let k = 0; k < 4; k++) geo.setAttribute(`partMatrix${k}`, new THREE.InterleavedBufferAttribute(matrices, 4, 4 * k));
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(3 * capacity).fill(1), 3);
    geo.setAttribute('partColor', colors);
    geo.instanceCount = capacity;
    material.positionNode ??= PART_POSITION;
    material.colorNode ??= PART_COLOR;
    super(geo, material);
    this.matrices = matrices;
    this.colors = colors;
    // (its bounds are those of one copy)
    this.frustumCulled = false;
  }

  /** how many copies are drawn, from the first */
  get drawn(): number {
    return this.geometry.instanceCount;
  }

  set drawn(n: number) {
    this.geometry.instanceCount = n;
  }

  setMatrixAt(i: number, m: THREE.Matrix4): void {
    m.toArray(this.matrices.array, 16 * i);
  }

  getMatrixAt(i: number, m: THREE.Matrix4): THREE.Matrix4 {
    return m.fromArray(this.matrices.array, 16 * i);
  }

  setColorAt(i: number, c: THREE.Color): void {
    c.toArray(this.colors.array, 3 * i);
  }

  /** frees its buffers (the geometry it copies is its owner's) */
  dispose(): void {
    this.geometry.dispose();
  }
}
