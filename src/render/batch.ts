// Fewer objects for the GPU: every mesh costs a draw call in each pass (shadow,
// beauty, normals for the reflections and the ambient occlusion), so a rack of
// a thousand small parts was drawn thousands of times a frame. Parts that never
// move are merged by material; parts repeated by the hundred (connectors, port
// LEDs) are instanced, with a colour and a glow of their own per instance.

import * as THREE from 'three';

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
  const mtx = new THREE.Matrix4(), nm = new THREE.Matrix3();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const names = KEEP.filter((n) => b.meshes.every((m) => m.geometry.getAttribute(n)));
    if (!names.includes('position')) continue;
    // laid straight into one indexed geometry, each part moved as it stood (copying each
    // part unindexed, moving it, then merging the copies took ten times as long)
    let verts = 0, idx = 0;
    for (const m of b.meshes) {
      const g = m.geometry;
      verts += g.attributes.position.count;
      idx += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(3 * verts), index = new Uint32Array(idx);
    const nrm = names.includes('normal') ? new Float32Array(3 * verts) : null;
    const uv = names.includes('uv') ? new Float32Array(2 * verts) : null;
    let v = 0, i = 0;
    for (const m of b.meshes) {
      const g = m.geometry;
      mtx.multiplyMatrices(inv, m.matrixWorld);
      nm.getNormalMatrix(mtx);
      const e = mtx.elements, f = nm.elements;
      const P = g.attributes.position, n = P.count;
      for (let k = 0; k < n; k++) {
        const x = P.getX(k), y = P.getY(k), z = P.getZ(k), o = 3 * (v + k);
        pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      if (nrm) {
        const N = g.attributes.normal;
        for (let k = 0; k < n; k++) {
          const x = N.getX(k), y = N.getY(k), z = N.getZ(k), o = 3 * (v + k);
          const a = f[0] * x + f[3] * y + f[6] * z, c = f[1] * x + f[4] * y + f[7] * z, d = f[2] * x + f[5] * y + f[8] * z;
          const l = Math.sqrt(a * a + c * c + d * d) || 1;
          nrm[o] = a / l; nrm[o + 1] = c / l; nrm[o + 2] = d / l;
        }
      }
      if (uv) {
        const T = g.attributes.uv;
        for (let k = 0; k < n; k++) { uv[2 * (v + k)] = T.getX(k); uv[2 * (v + k) + 1] = T.getY(k); }
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) index[i++] = g.index.getX(k) + v;
      else for (let k = 0; k < n; k++) index[i++] = v + k;
      v += n;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (nrm) merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (uv) merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex(new THREE.BufferAttribute(index, 1));
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
