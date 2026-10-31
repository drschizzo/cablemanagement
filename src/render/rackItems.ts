// The cable management items of a cabinet (finger managers, ducts),
// built from their own collision shapes so that what you see is what holds.

import * as THREE from 'three/webgpu';
import { COLUMN_X, Rack, SIDE_BACK, SIDE_IN, SIDE_OUT, U, type Item } from '../game/rack';
import type { RackShape } from '../game/physics/rackCableSim';
import type { ItemKind } from '../game/supplies';
import { assertNever } from '../lib/assertNever';
import { bevelBox } from './bevel';
import { rackMat } from './rackMaterials';
import { roundedBox } from './shapes';

/** meshes of an item, built from its own collision shapes so that what you see is what holds */
export function buildItem(rack: Rack, it: Item, statics: RackShape[] | null, ghost: THREE.Material | null): THREE.Group {
  const g = new THREE.Group();
  const shapes = (statics ?? rack.itemShapes(it)).filter((s) => s.owner === it.id && s.kind !== 'keeper');
  const fingerMat = ghost ?? fingerMaterial(it.kind);
  for (const s of shapes) {
    if (s.kind === 'capsule') {
      const a = new THREE.Vector3(s.ax, s.ay, s.az), b = new THREE.Vector3(s.bx, s.by, s.bz);
      // duct and manager fingers are flat plastic strips
      const dir = b.clone().sub(a);
      const t = 2 * s.r + 0.0008;
      const strip = new THREE.Mesh(bevelBox(Math.abs(dir.x) + t, Math.abs(dir.y) + t, Math.abs(dir.z) + t, 0.0012), fingerMat);
      strip.position.copy(a).add(b).multiplyScalar(0.5);
      strip.castShadow = !ghost; strip.receiveShadow = true;
      g.add(strip);
    } else {
      const sx = s.max[0] - s.min[0], sy = s.max[1] - s.min[1], sz = s.max[2] - s.min[2];
      const box = new THREE.Mesh(bevelBox(sx, sy, sz, 0.0015), ghost ?? rackMat.ductBack);
      box.position.set((s.max[0] + s.min[0]) / 2, (s.max[1] + s.min[1]) / 2, (s.max[2] + s.min[2]) / 2);
      box.receiveShadow = true;
      g.add(box);
    }
  }
  g.add(backingPlate(rack, it, ghost));
  return g;
}

/** the plastic of an item's fingers */
function fingerMaterial(kind: ItemKind): THREE.Material {
  switch (kind) {
    case 'fingerManager': return rackMat.manager;
    case 'duct': return rackMat.duct;
    default: return assertNever(kind);
  }
}

/** the plate behind a manager or a duct */
function backingPlate(rack: Rack, it: Item, ghost: THREE.Material | null): THREE.Mesh {
  switch (it.kind) {
    case 'fingerManager': {
      const plate = new THREE.Mesh(roundedBox(COLUMN_X * 2 - 0.036, U - 0.001, 0.01, 0.0015), ghost ?? rackMat.mgrPlate);
      plate.position.set(0, rack.unitY(it.unit), -0.004);
      plate.receiveShadow = true;
      return plate;
    }
    case 'duct': {
      const yTop = rack.topY - it.unit * U, yBot = rack.topY - (it.unit + it.span) * U;
      const back = new THREE.Mesh(bevelBox(SIDE_OUT - SIDE_IN, yTop - yBot, 0.004, 0.0015), ghost ?? rackMat.ductBack);
      back.position.set((it.side * (SIDE_IN + SIDE_OUT)) / 2, (yTop + yBot) / 2, SIDE_BACK + 0.002);
      back.receiveShadow = true;
      return back;
    }
    default: return assertNever(it.kind);
  }
}
