// Freeing what a scene graph holds on the GPU: geometries, materials and their
// textures. A resource made once and reused by every level (module-level
// materials, cached textures) is marked with shared() and never freed: freeing
// it would only force three.js to upload or compile it again on its next use.

import * as THREE from 'three';
import type { TubeMesh } from '@drschizzo/three-cable-tubes/webgpu';
import type { InstancedParts } from './instancedParts';

type Resource = THREE.BufferGeometry | THREE.Material | THREE.Texture;

/** marks a resource that outlives the objects using it; returns it */
export function shared<T extends Resource>(r: T): T {
  r.userData.shared = true;
  return r;
}

const TEXTURE_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap'] as const;

function free(r: Resource | null | undefined, done: Set<Resource>): void {
  if (!r || done.has(r) || r.userData.shared) return;
  done.add(r);
  r.dispose();
}

/** frees every geometry, material and texture under `root` that is not shared() */
export function disposeTree(root: THREE.Object3D): void {
  const done = new Set<Resource>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // the per-copy buffers of instanced parts (instancedParts.ts)
    if ((o as InstancedParts).isInstancedParts) (o as InstancedParts).dispose();
    // the copy it made of its material, and its nodes (three-cable-tubes)
    if ((o as TubeMesh).isTubeMesh) (o as TubeMesh).dispose();
    if (m.geometry) free(m.geometry, done);
    if (!m.material) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mat.userData.shared) continue;
      for (const slot of TEXTURE_SLOTS) free((mat as unknown as Record<string, THREE.Texture | null>)[slot], done);
      free(mat, done);
    }
  });
}
