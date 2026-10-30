// The server room round the cabinet of a level, as scenery: rows of racks in
// the dim, put up over the years (not quite in line, of every height, some
// kept tidy and others not), cable trays over them, things left lying about,
// a light from behind that outlines the cabinet, and LED battens hung over
// the aisle, their light in the haze. Nothing here is played: it never moves, and is never picked.

import * as THREE from 'three/webgpu';
import { rng } from '../../lib/random';
import { once } from '../../lib/once';
import { ledMesh } from '../leds';
import type { InstancedParts } from '../instancedParts';
import { RoomParts, mergedMesh } from './roomParts';
import { ROOM_RACK_DEPTH, roomRack, type RoomRackSpec } from './roomRack';
import { boxStack, cableTray, cordCoil, crashCart, extinguisher, floorCord, velcroRoll, cableTies, tileStack, grommetSlack } from './roomProps';
import { GROMMETS, GROMMET_SIZE } from '../floor';
import { battenBody, battenLight } from './battens';

/**
 * How lit the lights of the room are, against those of the cabinet: past
 * white on an HDR screen, but under the bloom threshold, so that they stay
 * behind it and never halo.
 */
const LED_DIM = 0.7;
/** how much of the lamps' light the room takes: it stands in the dim, the cabinet in the light */
const ROOM_SHADE = 0.16;
/** the light from behind the cabinet: its tint and strength */
const RIM_COLOR = '#7fb2ff';
const RIM_INTENSITY = 1.1;
/** the trays over the rows (m above the floor) */
const TRAY_Y = 2.45;
/** the room left either side of a rack pushed out and turned, so that it touches neither neighbour (m) */
const ASTRAY_CLEARANCE = 0.12;
/** how far from the cabinet the things left in the aisle lie, at least (m) */
const CLEAR_OF_CABINET = 2.0;
/**
 * Where what is left on the floor of the aisle lies (m): beside the cabinet
 * and behind it, but only where the cabinet hides none of it from the player
 * (straight behind it, nothing is seen), each spot a zone to draw in.
 */
const LOOSE_ZONES = {
  left: { x: [-1.15, -0.8], z: [-1.75, -1.3] },
  leftNear: { x: [-0.78, -0.65], z: [-0.45, -0.2] },
  right: { x: [0.7, 0.95], z: [-1.05, -0.75] },
  rightNear: { x: [0.62, 0.72], z: [-0.4, -0.15] },
  back: { x: [-1.35, -1.1], z: [-2.45, -2.3] },
};
/** where the battens hang, along the aisle behind the cabinet, in two lines end to end (m) */
const LAMPS = [{ x: -0.85, z: -1.35 }, { x: -0.85, z: -2.6 }, { x: 0.85, z: -1.35 }, { x: 0.85, z: -2.6 }];

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

/** a footprint on the floor (m): what is left there keeps clear of what already is */
interface Taken {
  x: number;
  z: number;
  r: number;
}

/** a rack as it stands in its row: along the row and out of line (m), turned (rad), and what it is */
interface Slot {
  along: number;
  out: number;
  yaw: number;
  spec: RoomRackSpec;
}

/**
 * The light from behind the room, the same object for every room (there is
 * one at a time): three keys every lit shader by the identity of its lights.
 */
const roomRim = once((): THREE.DirectionalLight => {
  const rim = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY);
  rim.position.set(0.4, 2.5, -2.5);
  rim.target.position.set(0, 0.6, 0);
  return rim;
});

/** the scenery round a cabinet whose room floor is at `floorY`; the same room for the same `seed` */
export function buildServerRoom(floorY: number, seed: number): THREE.Group {
  const random = rng(seed);
  const room = new RoomParts();
  const taken: Taken[] = [];
  ROWS.forEach((row, k) => buildRow(row, k === 0, random, room, taken));
  placeLoose(random, room, taken);
  for (const l of LAMPS) battenBody().placeInto(room, new THREE.Matrix4().makeTranslation(l.x, 0, l.z));
  const shade = new THREE.Color(ROOM_SHADE, ROOM_SHADE, ROOM_SHADE);
  const g = new THREE.Group();
  g.add(
    mergedMesh(room.solids, new THREE.MeshStandardMaterial({ vertexColors: true, color: shade, roughness: 0.7, metalness: 0.15 })),
    mergedMesh(room.cords, new THREE.MeshStandardMaterial({ vertexColors: true, color: shade, roughness: 0.45, metalness: 0 })),
    mergedMesh(room.screens, new THREE.MeshBasicMaterial({ vertexColors: true })),
    dimmed(ledMesh(room.lights)),
    battenLight(LAMPS, random),
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
function buildRow(row: Row, isEnd: boolean, random: () => number, room: RoomParts, taken: Taken[]): void {
  const frame = rowFrame(row);
  const slots = drawSlots(row.length, random);
  const local = (along: number, out: number, yaw: number) =>
    new THREE.Matrix4().makeRotationY(yaw).setPosition(along, 0, out).premultiply(frame);
  /** marks the floor round (along, out) as taken, `r` round it */
  const take = (along: number, out: number, r: number) => {
    const p = new THREE.Vector3(along, 0, out).applyMatrix4(frame);
    taken.push({ x: p.x, z: p.z, r });
  };
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
    const at = row.length * (0.15 + random() * 0.7);
    extinguisher().placeInto(room, local(at, 0.15, 0));
    take(at, 0.15, 0.12);
    return;
  }
  // at the feet of a side row, out in the aisle: a cart pulled up to a rack, a cord left on the floor, boxes;
  // away from the cabinet
  const far = slots.filter((s) => new THREE.Vector3(s.along, 0, 0.5).applyMatrix4(frame).setY(0).length() > CLEAR_OF_CABINET);
  const anySlot = (): Slot | undefined => far[Math.floor(random() * far.length)];
  const cart = anySlot();
  if (cart) {
    crashCart(random).placeInto(room, local(cart.along, 0.6, Math.PI + (random() - 0.5) * 0.4));
    take(cart.along, 0.6, 0.4);
  }
  const cord = anySlot();
  if (cord) floorCord(0.8 + random() * 0.8, random).placeInto(room, local(cord.along, 0.05, -Math.PI / 2 + (random() - 0.5) * 0.8));
  const boxes = anySlot();
  if (boxes && random() < 0.6) {
    boxStack(random).placeInto(room, local(boxes.along + 0.3, 0.45, random()));
    take(boxes.along + 0.3, 0.45, 0.35);
  }
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

/**
 * What was left on the floor of the aisle, where the player sees it beside
 * the cabinet: a coil of cord, cords out of the grommets, velcro,
 * cable ties, spare tiles; each kept clear of what the rows left.
 */
function placeLoose(random: () => number, room: RoomParts, taken: Taken[]): void {
  const put = (parts: RoomParts, zone: { x: number[]; z: number[] }, r: number, yaw = random() * 6.3) => {
    for (let tries = 0; tries < 8; tries++) {
      const x = zone.x[0] + random() * (zone.x[1] - zone.x[0]), z = zone.z[0] + random() * (zone.z[1] - zone.z[0]);
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) continue;
      taken.push({ x, z, r });
      parts.placeInto(room, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
      return;
    }
  };
  // the slack out of the grommets (cut in the floor's texture), falling towards the aisle
  for (const g of GROMMETS) {
    const m = new THREE.Matrix4().makeRotationY(g.x < 0 ? -0.4 : 0.4).setPosition(g.x, 0, g.z + GROMMET_SIZE[1] / 2);
    grommetSlack(GROMMET_SIZE[0], random).placeInto(room, m);
    taken.push({ x: g.x, z: g.z + 0.2, r: 0.2 });
  }
  // a coil each side, or a cord on one of them
  put(cordCoil(random), LOOSE_ZONES.left, 0.35);
  if (random() < 0.6) put(cordCoil(random), LOOSE_ZONES.right, 0.25);
  else put(floorCord(0.5 + random() * 0.4, random), LOOSE_ZONES.right, 0.25, -Math.PI / 2 + (random() - 0.5) * 0.6);
  // the tools of the job, put down by the cabinet
  if (random() < 0.5) put(velcroRoll(random), LOOSE_ZONES.leftNear, 0.1);
  else put(cableTies(random), LOOSE_ZONES.leftNear, 0.1);
  if (random() < 0.6) put(cableTies(random), LOOSE_ZONES.rightNear, 0.08);
  else put(velcroRoll(random), LOOSE_ZONES.rightNear, 0.08);
  if (random() < 0.7) put(tileStack(random), LOOSE_ZONES.back, 0.45, (random() - 0.5) * 0.3);
}

/** the lights of the room, dimmer than those of the cabinet */
function dimmed(leds: InstancedParts): InstancedParts {
  const tint = leds.geometry.attributes.emissiveTint as THREE.InstancedBufferAttribute;
  for (let i = 0; i < tint.array.length; i++) tint.array[i] *= LED_DIM;
  return leds;
}
