// What the server room is made of, gathered piece by piece to be drawn in a
// few meshes: solids and cords coloured per vertex, dimly lit screens, and
// blinking lights. A rack or a prop is built in its own frame, then placed.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STEADY, type Blink, type LedSpec } from '../leds';
import { bevelBox } from '../bevel';
import { CORD_KINDS } from '../../game/cordTypes';
import { SERVICES } from '../../game/services';
import { pick } from '../../lib/random';

/** the radius of a cord of the room (m) */
export const CORD_R = 0.0025;
/** the edges of the boxes cut off (m; less on a thin one): nothing in the room has a knife edge */
const BEVEL = 0.006;

export class RoomParts {
  /** boxes, cylinders… lit as the rest of the room */
  readonly solids: THREE.BufferGeometry[] = [];
  /** cords and coils: of a softer, non-metallic surface */
  readonly cords: THREE.BufferGeometry[] = [];
  /** screens: they give their own light, not lit */
  readonly screens: THREE.BufferGeometry[] = [];
  readonly lights: LedSpec[] = [];

  /** a box of this size, its edges cut off, its middle at (x, y, z), turned by `yaw` about y */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, yaw = 0): void {
    this.solids.push(painted(bevelBox(w, h, d, BEVEL).rotateY(yaw).translate(x, y, z), color));
  }

  /** a flat face of this size facing +z, its middle at (x, y, z): an opening, a label, a slit */
  quad(w: number, h: number, x: number, y: number, z: number, color: string): void {
    this.solids.push(painted(new THREE.PlaneGeometry(w, h).translate(x, y, z), color));
  }

  /** a solid of any shape, already in place */
  solid(geo: THREE.BufferGeometry, color: string): void {
    this.solids.push(painted(geo, color));
  }

  /** a cord through these points, smoothed */
  cord(path: THREE.Vector3[], color: string, r = CORD_R): void {
    const curve = new THREE.CatmullRomCurve3(path);
    // about a segment every 3 cm: a long cord hanging to the floor stays round
    const segments = Math.max(6, Math.ceil(curve.getLength() / 0.03));
    this.cords.push(painted(new THREE.TubeGeometry(curve, segments, r, 6, false), color));
  }

  /** a coil, a reel…: a shape drawn as the cords are */
  coil(geo: THREE.BufferGeometry, color: string): void {
    this.cords.push(painted(geo, color));
  }

  /** a plane giving off its own dim light (a monitor), already in place */
  screen(geo: THREE.BufferGeometry, color: string): void {
    this.screens.push(painted(geo, color));
  }

  /** a status or activity light facing +z */
  light(x: number, y: number, z: number, color: string, blink: Blink = STEADY): void {
    this.lights.push({ x, y, z, w: 0.0025, h: 0.0018, color, blink });
  }

  /** everything here, moved by `m`, added to `into` (these geometries are spent) */
  placeInto(into: RoomParts, m: THREE.Matrix4): void {
    for (const g of this.solids) into.solids.push(g.applyMatrix4(m));
    for (const g of this.cords) into.cords.push(g.applyMatrix4(m));
    for (const g of this.screens) into.screens.push(g.applyMatrix4(m));
    const v = new THREE.Vector3();
    for (const l of this.lights) {
      v.set(l.x, l.y, l.z).applyMatrix4(m);
      into.lights.push({ ...l, x: v.x, y: v.y, z: v.z });
    }
  }
}

/** one mesh for them all (the geometries are spent): the room is a few draw calls in every pass */
export function mergedMesh(geos: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry(), material);
  for (const g of geos) g.dispose();
  mesh.receiveShadow = true;
  return mesh;
}

/** the geometry, every vertex of this colour (the merged meshes keep only position, normal, uv and colour) */
function painted(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) c.toArray(a, 3 * i);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** the colour of a cord of the room: a service's, or a fibre's */
export function randomCordColor(random: () => number): string {
  return random() < 0.75 ? pick(SERVICES, random).color : pick([CORD_KINDS.OS2.color, CORD_KINDS.OM4.color], random);
}
