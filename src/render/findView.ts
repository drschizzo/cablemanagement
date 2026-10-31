// A find drawn where it lies: a few simple shapes each (a post-it, a USB key,
// a mug, a rubber duck…), small and ordinary enough to be missed under the
// cords.

import * as THREE from 'three/webgpu';
import type { Find, FindId } from '../game/finds';
import { assertNever } from '../lib/assertNever';
import { roundedBox } from './shapes';

const mat = (color: string, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** a mesh of `geometry` and `material`, at (x, y, z) above the find's base, turned by `ry` round the vertical */
function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(0, ry, rz);
  m.castShadow = true;
  return m;
}

/** the shapes of a find, its base at the origin */
function shapesOf(id: FindId): THREE.Mesh[] {
  switch (id) {
    case 'postit': return [part(new THREE.BoxGeometry(0.076, 0.001, 0.076), mat('#f7e463', 0.9), 0, 0.0005, 0, 0.4)];
    case 'usb': return [
      part(roundedBox(0.05, 0.008, 0.018, 0.003), mat('#2d5fd0', 0.4), 0, 0.004, 0, 0.9),
      part(new THREE.BoxGeometry(0.012, 0.0045, 0.012), mat('#c9ccd0', 0.3, 0.9), 0.029 * Math.cos(0.9), 0.004, -0.029 * Math.sin(0.9), 0.9),
    ];
    case 'mug': return [
      part(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 24, 1, true), mat('#eeeae2', 0.35), 0, 0.045, 0),
      part(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 24), mat('#eeeae2', 0.35), 0, 0.002, 0),
      part(new THREE.CylinderGeometry(0.037, 0.037, 0.002, 24), mat('#3b2416', 0.2), 0, 0.075, 0),
      part(new THREE.TorusGeometry(0.022, 0.006, 8, 16, Math.PI), mat('#eeeae2', 0.35), 0.04, 0.045, 0, 0, -Math.PI / 2),
    ];
    case 'duck': return [
      part(new THREE.SphereGeometry(0.03, 20, 14), mat('#ffd21f', 0.4), 0, 0.026, 0),
      part(new THREE.SphereGeometry(0.019, 18, 12), mat('#ffd21f', 0.4), 0.018, 0.06, 0),
      part(new THREE.ConeGeometry(0.008, 0.02, 12), mat('#ff8a1f', 0.4), 0.04, 0.058, 0, 0, -Math.PI / 2),
    ];
    case 'floppy': return [
      part(new THREE.BoxGeometry(0.09, 0.003, 0.094), mat('#1f2a44', 0.5), 0, 0.0015, 0, -0.3),
      part(new THREE.BoxGeometry(0.05, 0.0035, 0.03), mat('#b9bdc2', 0.3, 0.8), -0.03 * Math.sin(-0.3), 0.0016, -0.03 * Math.cos(-0.3), -0.3),
    ];
    case 'screwdriver': return [
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 12), mat('#d13a2a', 0.5), -0.05, 0.012, 0, 0, Math.PI / 2),
      part(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 8), mat('#b9bdc2', 0.3, 0.9), 0.05, 0.012, 0, 0, Math.PI / 2),
    ];
    case 'badge': return [part(roundedBox(0.085, 0.002, 0.054, 0.0008), mat('#f2f4f6', 0.5), 0, 0.001, 0, 0.6)];
    case 'sandwich': return [part(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 3), mat('#d9b27c', 0.9), 0, 0.015, 0, 0.3)];
    case 'keys': return [
      part(new THREE.TorusGeometry(0.014, 0.002, 8, 20), mat('#c9ccd0', 0.3, 0.9), 0, 0.002, 0, 0, Math.PI / 2),
      part(new THREE.BoxGeometry(0.05, 0.002, 0.012), mat('#c9ccd0', 0.3, 0.9), 0.035, 0.002, 0, 0.3),
      part(new THREE.BoxGeometry(0.045, 0.002, 0.012), mat('#b08a3a', 0.3, 0.9), 0.025, 0.004, 0.02, -0.4),
    ];
    // an A5 booklet still in its film: a white cover, the maker's blue band, a grey spine
    case 'manual': return [
      part(roundedBox(0.148, 0.012, 0.21, 0.0015), mat('#e9e7e1', 0.25), 0, 0.006, 0, 0.15),
      part(new THREE.BoxGeometry(0.149, 0.0006, 0.05), mat('#2d5fd0', 0.3), -0.07 * Math.sin(0.15), 0.0122, -0.07 * Math.cos(0.15), 0.15),
      part(new THREE.BoxGeometry(0.006, 0.0122, 0.211), mat('#8d9096', 0.4), -0.072 * Math.cos(0.15), 0.006, 0.072 * Math.sin(0.15), 0.15),
    ];
    default: return assertNever(id);
  }
}

/** the find, placed where it lies */
export function buildFind(find: Find): THREE.Group {
  const g = new THREE.Group();
  g.add(...shapesOf(find.id));
  g.position.set(...find.at);
  return g;
}
