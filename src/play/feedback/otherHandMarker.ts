// The other hand: a soft glow round the point where it holds a cord still,
// seen through the cords.

import * as THREE from 'three/webgpu';
import type { RackCableSim } from '../../game/physics/rackCableSim';

export class OtherHandMarker {
  readonly group = new THREE.Group();

  constructor() {
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.35, depthTest: false }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, opacity: 0.9, depthTest: false }));
    for (const o of [glow, core]) { o.renderOrder = 31; this.group.add(o); }
    this.group.visible = false;
  }

  /** where the other hand holds (it lets go when the cords are rebuilt) */
  follow(sim: RackCableSim): void {
    this.group.visible = sim.holdNode >= 0;
    if (sim.holdNode >= 0) this.group.position.set(sim.holdTarget[0], sim.holdTarget[1], sim.holdTarget[2]);
  }
}
