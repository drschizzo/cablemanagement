// Glows added to a node material by several effects at once (a cord lit up when
// picked, the light of the LEDs on it): each adds its term to the material's
// emissive radiance, none replaces what another put there.

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';

const { materialEmissive } = tsl;

/** adds `term` (linear RGB) to the glow of `m`, after its own emissive colour and the terms already added */
export function addGlow<T extends THREE.MeshStandardNodeMaterial>(m: T, term: ShaderNode): T {
  m.emissiveNode = (m.emissiveNode ?? materialEmissive).add(term);
  m.needsUpdate = true;
  return m;
}
