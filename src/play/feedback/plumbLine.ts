// The depth cue while carrying a cord: a plumb line from the held point to the
// floor, a ring where it lands, and a tick on the equipment face.

import * as THREE from 'three/webgpu';
import { FRONT_Z, ROOM_FLOOR, type Rack } from '../../game/rack';

const COLOR_PLANE = '#5cc8ff';
/** Shift held: the hand moves in depth */
const COLOR_DEPTH = '#ffb020';

export class PlumbLine {
  readonly group = new THREE.Group();
  private line: THREE.Line;
  private floorRing: THREE.Mesh;
  private faceTick: THREE.Mesh;

  constructor() {
    const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: COLOR_PLANE, transparent: true, opacity: 0.8, depthTest: false }));
    this.floorRing = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLOR_PLANE, transparent: true, opacity: 0.8, depthTest: false }));
    this.faceTick = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0055, 24), new THREE.MeshBasicMaterial({ color: COLOR_PLANE, transparent: true, opacity: 0.6, depthTest: false }));
    for (const o of [this.line, this.floorRing, this.faceTick]) { o.renderOrder = 30; this.group.add(o); }
    this.group.visible = false;
  }

  /** hangs the line from the hand at `t` (`depthMode`: Shift held) */
  place(t: THREE.Vector3, depthMode: boolean, rack: Rack): void {
    const floor = t.z >= FRONT_Z && !rack.open ? ROOM_FLOOR(rack) : rack.floorY;
    this.group.visible = true;
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, t.x, t.y, t.z);
    pos.setXYZ(1, t.x, floor + 0.002, t.z);
    pos.needsUpdate = true;
    this.floorRing.position.set(t.x, floor + 0.003, t.z);
    // the depth also shown against the rack: a tick on the equipment face
    this.faceTick.position.set(t.x, t.y, Math.max(0.001, Math.min(t.z, 0.002)));
    this.faceTick.scale.setScalar(1 + Math.max(0, t.z) * 8);
    const color = depthMode ? COLOR_DEPTH : COLOR_PLANE;
    for (const o of [this.line, this.floorRing, this.faceTick]) (o.material as THREE.LineBasicMaterial | THREE.MeshBasicMaterial).color.set(color);
  }

  hide(): void {
    this.group.visible = false;
  }
}
