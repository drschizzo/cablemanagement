// Glows added to a node material by several effects at once (a cord lit up when
// picked, the light of the LEDs on it): each adds its term to the material's
// emissive radiance, none replaces what another put there. The same terms in
// the same order give the same node: three builds a shader per graph of nodes,
// and materials made alike share one.

import * as THREE from 'three/webgpu';
import { tsl, type ShaderNode } from './tsl';

const { materialEmissive } = tsl;

/** the sums made so far: by the glow they add to, then by the term added */
const sums = new WeakMap<ShaderNode, WeakMap<ShaderNode, ShaderNode>>();

/** adds `term` (linear RGB) to the glow of `m`, after its own emissive colour and the terms already added */
export function addGlow<T extends THREE.MeshStandardNodeMaterial>(m: T, term: ShaderNode): T {
  const base = m.emissiveNode ?? materialEmissive;
  let byTerm = sums.get(base);
  if (!byTerm) sums.set(base, (byTerm = new WeakMap()));
  let sum = byTerm.get(term);
  if (!sum) byTerm.set(term, (sum = base.add(term)));
  m.emissiveNode = sum;
  m.needsUpdate = true;
  return m;
}
