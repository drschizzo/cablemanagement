// A glow on every free connector, so that none is lost in the heap: cyan when
// lying loose, amber when hooked in the air.

import * as THREE from 'three/webgpu';
import type { World } from '../../game/world';

const LOOSE_COLOR = '#5cd8ff';
const HOOKED_COLOR = '#ffb347';

export class ConnectorGlows {
  readonly group = new THREE.Group();

  /** `carried`: the connector in the hand, which needs no glow */
  update(world: World, clock: number, carried: { cable: number; end: number } | null): void {
    const want: { at: [number, number, number]; hooked: boolean }[] = [];
    world.cables.forEach((cb, c) => cb.ends.forEach((e, k) => {
      if (e.port || (carried && carried.cable === c && carried.end === k)) return;
      want.push({ at: world.connectorTip(c, k), hooked: !!e.parked });
    }));
    const g = this.group;
    while (g.children.length < want.length) g.add(makeGlow());
    g.children.forEach((o, i) => {
      o.visible = i < want.length;
      if (!o.visible) return;
      const w = want[i];
      o.position.set(w.at[0], w.at[1], w.at[2]);
      const pulse = 1 + 0.25 * Math.sin(clock * 4 + i);
      o.scale.setScalar(pulse);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(w.hooked ? HOOKED_COLOR : LOOSE_COLOR);
    });
  }
}

function makeGlow(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 10), new THREE.MeshBasicMaterial({ color: LOOSE_COLOR, transparent: true, opacity: 0.35, depthTest: false }));
  m.renderOrder = 29;
  return m;
}
