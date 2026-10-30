// The server room round the cabinet of a level, as scenery: rows of racks in
// the dim, put up over the years (not quite in line, of every height, some
// kept tidy and others not), cable trays over them, things left lying about,
// a light from behind that outlines the cabinet, and shafts of light in the
// haze. Nothing here is played: it never moves, and is never picked.

import * as THREE from 'three';
import { rng } from '../../lib/random';
import { ledMesh } from '../leds';
import type { InstancedParts } from '../instancedParts';
import { RoomParts, mergedMesh } from './roomParts';
import { ROOM_RACK_DEPTH, roomRack, type RoomRackSpec } from './roomRack';
import { boxStack, cableTray, cordCoil, crashCart, extinguisher, floorCord } from './roomProps';
import { roomHaze } from './roomHaze';

/** how lit the lights of the room are, against those of the cabinet: they stay behind it */
const LED_DIM = 0.4;
/** how much of the lamps' light the room takes: it stands in the dim, the cabinet in the light */
const ROOM_SHADE = 0.12;
/** the light from behind the cabinet: its tint and strength */
const RIM_COLOR = '#7fb2ff';
const RIM_INTENSITY = 1.1;
/** the trays over the rows (m above the floor) */
const TRAY_Y = 2.45;
/** the room left either side of a rack pushed out and turned, so that it touches neither neighbour (m) */
const ASTRAY_CLEARANCE = 0.12;
/** how far from the cabinet the things left in the aisle lie, at least (m) */
const CLEAR_OF_CABINET = 2.0;
/** where the shafts of light fall, round the cabinet (m) */
const SHAFTS = [{ x: -1.1, z: -1.4 }, { x: 1.2, z: -1.8 }, { x: -0.2, z: -2.5 }];

/**
 * A row of racks: where it starts (its first rack's front corner), the way it
 * runs (+x of its frame) and faces (+z), how long it is (m).
 */
interface Row {
  x: number;
  z: number;
  yaw: number;
  length: number;
}

/**
 * A row at the end of the aisle the cabinet stands in, and one down each
 * side, turned a little towards the player: clear of the cabinet and its crate.
 */
const ROWS: Row[] = [
  { x: -3.4, z: -3.0, yaw: 0, length: 6.8 },
  { x: -1.8, z: 0.4, yaw: Math.PI / 2 - 0.2, length: 2.6 },
  { x: 1.8 - 2.6 * Math.sin(0.2), z: 0.4 - 2.6 * Math.cos(0.2), yaw: -(Math.PI / 2 - 0.2), length: 2.6 },
];

/** a rack as it stands in its row: along the row and out of line (m), turned (rad), and what it is */
interface Slot {
  along: number;
  out: number;
  yaw: number;
  spec: RoomRackSpec;
}

let rim: THREE.DirectionalLight | null = null;

/**
 * The light from behind the room, the same object for every room (there is
 * one at a time): three keys every lit shader by the identity of its lights.
 */
function roomRim(): THREE.DirectionalLight {
  if (!rim) {
    rim = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY);
    rim.position.set(0.4, 2.5, -2.5);
    rim.target.position.set(0, 0.6, 0);
  }
  return rim;
}

/** the scenery round a cabinet whose room floor is at `floorY`; the same room for the same `seed` */
export function buildServerRoom(floorY: number, seed: number): THREE.Group {
  const random = rng(seed);
  const room = new RoomParts();
  ROWS.forEach((row, k) => buildRow(row, k === 0, random, room));
  placeLoose(random, room);
  const shade = new THREE.Color(ROOM_SHADE, ROOM_SHADE, ROOM_SHADE);
  const g = new THREE.Group();
  g.add(
    mergedMesh(room.solids, new THREE.MeshStandardMaterial({ vertexColors: true, color: shade, roughness: 0.7, metalness: 0.15 })),
    mergedMesh(room.cords, new THREE.MeshStandardMaterial({ vertexColors: true, color: shade, roughness: 0.45, metalness: 0 })),
    mergedMesh(room.screens, new THREE.MeshBasicMaterial({ vertexColors: true })),
    dimmed(ledMesh(room.lights)),
    roomHaze(SHAFTS, random),
  );
  g.position.y = floorY;
  const rim = roomRim();
  g.add(rim, rim.target);
  // scenery: the pointer goes through it
  g.traverse((o) => { o.raycast = () => {}; });
  return g;
}

/** the frame of a row: its start on the floor, running along +x, facing +z */
function rowFrame(row: Row): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(row.yaw).setPosition(row.x, 0, row.z);
}

/** a row's racks, the tray over it, and what was left in its gaps and at its feet */
function buildRow(row: Row, isEnd: boolean, random: () => number, room: RoomParts): void {
  const frame = rowFrame(row);
  const slots = drawSlots(row.length, random);
  const local = (along: number, out: number, yaw: number) =>
    new THREE.Matrix4().makeRotationY(yaw).setPosition(along, 0, out).premultiply(frame);
  for (const s of slots) roomRack(s.spec, random).placeInto(room, local(s.along, s.out, s.yaw));
  // over the racks' middle: bundles drop into some of them
  const drops = slots.filter(() => random() < 0.45).map((s) => ({ x: s.along, top: s.spec.height }));
  cableTray(row.length, TRAY_Y, drops, random).placeInto(room, local(0, -ROOM_RACK_DEPTH / 2, 0));
  // boxes stacked in the gaps of the row
  let end = 0;
  for (const s of slots) {
    if (s.along - s.spec.width / 2 - end > 0.45 && random() < 0.7) boxStack(random).placeInto(room, local((end + s.along - s.spec.width / 2) / 2, -0.3, random()));
    end = s.along + s.spec.width / 2;
  }
  if (isEnd) {
    extinguisher().placeInto(room, local(row.length * (0.15 + random() * 0.7), 0.15, 0));
    return;
  }
  // at the feet of a side row, out in the aisle: a cart pulled up to a rack, a cord left on the floor, boxes;
  // away from the cabinet
  const far = slots.filter((s) => new THREE.Vector3(s.along, 0, 0.5).applyMatrix4(frame).setY(0).length() > CLEAR_OF_CABINET);
  const anySlot = (): Slot | undefined => far[Math.floor(random() * far.length)];
  const cart = anySlot();
  if (cart) crashCart(random).placeInto(room, local(cart.along, 0.6, Math.PI + (random() - 0.5) * 0.4));
  const cord = anySlot();
  if (cord) floorCord(0.8 + random() * 0.8, random).placeInto(room, local(cord.along, 0.05, -Math.PI / 2 + (random() - 0.5) * 0.8));
  const boxes = anySlot();
  if (boxes && random() < 0.6) boxStack(random).placeInto(room, local(boxes.along + 0.3, 0.45, random()));
}

/**
 * The racks along a row, drawn one after the other: of two widths and three
 * heights, a gap now and then, a little out of line, one sometimes pushed
 * out and askew (with room round it); a third of them messy, a door left open
 * here and there. No two ever overlap.
 */
function drawSlots(length: number, random: () => number): Slot[] {
  const slots: Slot[] = [];
  let at = 0;
  while (true) {
    if (random() < 0.12) at += 0.3 + random() * 0.6;
    const width = random() < 0.7 ? 0.6 : 0.8;
    const astray = random() < 0.1;
    // a rack pushed out and turned stands clear of its neighbours, whichever way it turned
    if (astray) at += ASTRAY_CLEARANCE;
    if (at + width > length) break;
    const h = random();
    const height = h < 0.55 ? 2.0 : h < 0.8 ? 2.2 : 1.25;
    slots.push({
      along: at + width / 2,
      out: astray ? 0.1 + random() * 0.1 : (random() - 0.5) * 0.02,
      yaw: astray ? (random() - 0.5) * 0.2 : 0,
      spec: { width, height, messy: random() < 0.35, door: random() < 0.15 ? 0.7 + random() * 0.6 : null },
    });
    at += width + 0.01 + random() * 0.02 + (astray ? ASTRAY_CLEARANCE : 0);
  }
  return slots;
}

/** coils of cord dropped on the floor of the aisle, behind the cabinet */
function placeLoose(random: () => number, room: RoomParts): void {
  const coils = 1 + Math.floor(random() * 2);
  for (let k = 0; k < coils; k++) {
    const m = new THREE.Matrix4().makeRotationY(random() * 6.3).setPosition(-1.2 + random() * 2.4, 0, -2.2 + random() * 1.1);
    cordCoil(random).placeInto(room, m);
  }
}

/** the lights of the room, dimmer than those of the cabinet */
function dimmed(leds: InstancedParts): InstancedParts {
  const tint = leds.geometry.attributes.emissiveTint as THREE.InstancedBufferAttribute;
  for (let i = 0; i < tint.array.length; i++) tint.array[i] *= LED_DIM;
  return leds;
}
