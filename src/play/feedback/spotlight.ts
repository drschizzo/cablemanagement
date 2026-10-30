// A pulsing frame around a region of the cabinet (the tutorial points with it).

import * as THREE from 'three/webgpu';
import { disposeTree } from '../../render/dispose';

export interface Box3Like {
  min: [number, number, number];
  max: [number, number, number];
}

export class Spotlight {
  private frame: THREE.Group | null = null;
  private time = 0;

  constructor(private scene: THREE.Scene) {}

  /** frames `box`, or takes the frame away (null) */
  set(box: Box3Like | null): void {
    if (this.frame) {
      this.scene.remove(this.frame);
      disposeTree(this.frame);
      this.frame = null;
    }
    if (!box) return;
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.12, depthWrite: false }));
    fill.userData.base = 0.12;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#8fe0ff', transparent: true, opacity: 0.9, depthTest: false }));
    edges.userData.base = 0.9;
    edges.renderOrder = 20;
    g.add(fill, edges);
    g.position.set((box.max[0] + box.min[0]) / 2, (box.max[1] + box.min[1]) / 2, (box.max[2] + box.min[2]) / 2);
    this.frame = g;
    this.scene.add(g);
  }

  /** the frame pulses */
  update(dt: number): void {
    if (!this.frame) return;
    this.time += dt;
    const a = 0.35 + 0.35 * Math.sin(this.time * 5);
    this.frame.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && 'opacity' in m) m.opacity = o.userData.base * (0.5 + a);
    });
  }
}
