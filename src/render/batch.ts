// Fewer objects for the GPU: every mesh costs a draw call in each pass (shadow,
// beauty, normals for the reflections and the ambient occlusion), so a rack of
// a thousand small parts was drawn thousands of times a frame. Parts that never
// move are merged by material; parts repeated by the hundred (connectors, port
// LEDs) are instanced, with a colour and a glow of their own per instance.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A standard material that adds the `emissiveTint` attribute (linear RGB, per
 * vertex or per instance) to its glow: one material for parts that light up
 * one at a time.
 */
export function tintable<T extends THREE.MeshStandardMaterial>(m: T): T {
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 emissiveTint;\nvarying vec3 vEmissiveTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmissiveTint = emissiveTint;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmissiveTint;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmissiveTint;');
  };
  m.customProgramCacheKey = () => 'tint';
  return m;
}

const KEEP = ['position', 'normal', 'uv'];

/**
 * Merges the meshes under `root` that `ok` accepts into one mesh per material
 * (and shadow flags), baked into the frame of `root`. The parts must not move
 * afterwards, nor be shown or hidden on their own.
 */
export function mergeStatic(root: THREE.Object3D, ok: (m: THREE.Mesh) => boolean = () => true): void {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; order: number; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.children.length || !m.visible || !ok(m)) return;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, meshes: [] }));
    b.meshes.push(m);
  });
  const mtx = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const names = KEEP.filter((n) => b.meshes.every((m) => m.geometry.getAttribute(n)));
    const geos = b.meshes.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      g.clearGroups();
      g = g.applyMatrix4(mtx.multiplyMatrices(inv, m.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    for (const m of b.meshes) {
      m.removeFromParent();
      if (!m.geometry.userData.shared) m.geometry.dispose();
    }
    const out = new THREE.Mesh(merged, b.mat);
    out.castShadow = b.cast;
    out.receiveShadow = b.receive;
    out.renderOrder = b.order;
    root.add(out);
  }
}
