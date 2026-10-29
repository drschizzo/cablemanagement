// One rack of the server room, as scenery: its frame and rails, its side
// channels and the bundles running down them, its equipment (patch panels,
// switches, cable managers, servers, a UPS), their ports and lights, and the
// patch cords between them. A tidy rack leads its cords through the managers
// into the side channels; a messy one has none, and its cords sag across the
// front from port to port, a few hanging to the floor. Every cord stays in
// front of the faces it crosses.

import * as THREE from 'three';
import { U } from '../../game/rack';
import { CORD_KINDS } from '../../game/cordTypes';
import { SERVICES } from '../../game/services';
import { pick } from '../../lib/random';
import { activity, pulse } from '../leds';
import { RoomParts } from './roomParts';

/** what a rack of the room is: its size, how it was kept */
export interface RoomRackSpec {
  /** m, outside */
  width: number;
  height: number;
  /** its cords sag anyhow from port to port, where a tidy one leads them through its managers */
  messy: boolean;
  /** how far its door is open (rad); null: it has none */
  door: number | null;
}

/** depth of a rack of the room (m) */
export const ROOM_RACK_DEPTH = 1.0;
/** half the width of a 19" face, ears included (m) */
const HALF = 0.2413;
/** the front of the faces, and just in front of it, where their details lie (m) */
const FACE_Z = -0.02;
const ON_FACE = FACE_Z + 0.0006;
/** the equipment starts above the plinth (m) */
const FIRST_UNIT_Y = 0.1;
/** the pitch of the ports of a switch or a panel (m) */
const PORT_PITCH = 0.0175;
/** how far in front of the faces a cord of a messy rack sags, at least (m): clear of every face and handle */
const SAG_FRONT = 0.06;
/** the fingers of a cable manager stand out to here (m); a tidy cord runs between them */
const FINGER_FRONT = 0.045;
/** where a cord goes into a side channel, just outside the rail (m) */
const CHANNEL_X = HALF + 0.012;

/** a unit as it was put in: where, how tall, what it is, and its ports (x, y) */
interface Placed {
  y: number;
  units: number;
  kind: UnitKind['name'];
  ports: THREE.Vector2[];
}

/** the rack being built: its parts, its draw, and what it holds so far */
interface Build {
  spec: RoomRackSpec;
  random: () => number;
  parts: RoomParts;
  placed: Placed[];
}

/** a rack of the room, in its own frame: its front's middle on the floor, facing +z */
export function roomRack(spec: RoomRackSpec, random: () => number): RoomParts {
  const b: Build = { spec, random, parts: new RoomParts(), placed: [] };
  buildFrame(b);
  fillUnits(b);
  if (spec.messy) cordMessily(b);
  else cordTidily(b);
  buildSideBundles(b);
  return b.parts;
}

// ------------------------------------------------------------- the frame

/** sides, roof and plinth, the rails with their square holes, the dark inside, the door */
function buildFrame({ spec, parts }: Build): void {
  const { width: w, height: h } = spec, d = ROOM_RACK_DEPTH;
  for (const s of [-1, 1]) {
    parts.box(0.02, h, d, s * (w / 2 - 0.01), h / 2, -d / 2, '#1a191c');
    // the front post, against the side, clear of the channel; and the rail the equipment is screwed to
    parts.box(0.015, h - 0.1, 0.03, s * (w / 2 - 0.0275), h / 2, -0.035, '#262529');
    parts.box(0.016, h - 0.16, 0.012, s * (HALF - 0.006), h / 2, FACE_Z - 0.012, '#38373b');
    for (let y = FIRST_UNIT_Y + U / 6; y < h - 0.1; y += U / 3) parts.quad(0.006, 0.006, s * (HALF - 0.006), y, FACE_Z - 0.0055, '#0b0b0c');
    // the back of the side channel
    parts.box(w / 2 - HALF - 0.04, h - 0.12, 0.01, s * (HALF + (w / 2 - HALF) / 2), h / 2, -0.12, '#111113');
  }
  parts.box(w, 0.05, d, 0, h - 0.025, -d / 2, '#1a191c');
  // the name of the rack, on the front of its roof
  parts.quad(0.12, 0.022, 0, h - 0.025, 0.0006, '#c7c9cc');
  parts.box(w, 0.08, d, 0, 0.04, -d / 2, '#141315');
  for (let k = 0; k < 8; k++) parts.quad(0.04, 0.008, -0.21 + k * 0.06, 0.04, 0.0006, '#08080a');
  parts.box(w - 0.04, h - 0.1, 0.01, 0, h / 2, -d + 0.02, '#09090a');
  if (spec.door !== null) buildDoor(spec, parts);
}

/** a perforated door, hinged on the left, standing open */
function buildDoor({ width: w, height: h, door }: RoomRackSpec, parts: RoomParts): void {
  const a = door!, along = (t: number) => [-w / 2 + Math.cos(a) * t, 0.01 + Math.sin(a) * t] as const;
  const [cx, cz] = along(w / 2);
  parts.box(w, h - 0.04, 0.018, cx, h / 2, cz, '#232226', -a);
  // the perforated panel, slightly sunk, and the handle on the free edge
  parts.box(w - 0.07, h - 0.18, 0.02, cx + Math.sin(a) * 0.002, h / 2, cz - Math.cos(a) * 0.002, '#131315', -a);
  const [hx, hz] = along(w - 0.035);
  parts.box(0.02, 0.16, 0.03, hx - Math.sin(a) * 0.015, h / 2, hz + Math.cos(a) * 0.015, '#4a4a50', -a);
}

// ------------------------------------------------------------- the equipment

/**
 * The units from the bottom up: a UPS at the foot now and then, servers, then
 * the network (panels, switches and, in a tidy rack, a manager under each);
 * some racks only partly filled, a few slots left empty.
 */
function fillUnits(b: Build): void {
  const { spec, random } = b;
  const units = Math.floor((spec.height - FIRST_UNIT_Y - 0.08) / U);
  const top = units - Math.floor(random() * random() * units * 0.4);
  let u = 0;
  const put = (kind: UnitKind) => {
    if (u + kind.units > top) return false;
    const y = FIRST_UNIT_Y + (u + kind.units / 2) * U;
    b.placed.push({ y, units: kind.units, kind: kind.name, ports: kind.build(b, y) });
    u += kind.units;
    return true;
  };
  if (random() < 0.35) put(UPS);
  // servers below, the network above: as racks are filled
  const servers = Math.floor(top * (0.2 + random() * 0.5));
  while (u < servers) {
    if (random() < 0.08) u++;
    else put(pick([SERVER_1U, SERVER_1U, SERVER_2U, BLANK_1U], random));
  }
  while (u < top) {
    if (random() < 0.06) { u++; continue; }
    const kind = pick([PANEL, PANEL, SWITCH, SWITCH, BLANK_1U], random);
    if (!put(kind)) break;
    if (!spec.messy && kind !== BLANK_1U && !put(MANAGER)) break;
  }
}

/** a sort of equipment of the room: its height, and how it is drawn (its ports returned) */
interface UnitKind {
  name: 'server' | 'ups' | 'panel' | 'switch' | 'manager' | 'blank';
  units: number;
  build: (b: Build, y: number) => THREE.Vector2[];
}

/** the face of a unit and its ears with their screws */
function face(parts: RoomParts, y: number, units: number, color: string, ears = true): void {
  const h = units * U - 0.0015;
  parts.box(HALF * 2 - 0.036, h, 0.012, 0, y, FACE_Z - 0.006, color);
  if (!ears) return;
  for (const s of [-1, 1]) {
    parts.box(0.018, h, 0.004, s * (HALF - 0.009), y, FACE_Z - 0.002, color);
    for (const dy of units > 1 ? [-U / 2, U / 2] : [0]) parts.quad(0.004, 0.004, s * (HALF - 0.008), y + dy, ON_FACE, '#77777c');
  }
}

/** the x of a row of `n` ports, centred on the face */
function across(n: number, pitch = PORT_PITCH): number[] {
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}

/** a server: drive bays with their lights on the left, a vent, power on the right; handles on its ears */
const server = (units: number): UnitKind => ({
  name: 'server', units,
  build: ({ parts, random }, y) => {
    face(parts, y, units, '#2a292d');
    const rows = units, bays = 8;
    for (let r = 0; r < rows; r++) {
      const by = y + (r - (rows - 1) / 2) * U;
      for (let k = 0; k < bays; k++) {
        const x = -0.19 + k * 0.026;
        parts.box(0.023, U * 0.62, 0.006, x, by, FACE_Z + 0.001, random() < 0.15 ? '#1b1b1d' : '#3b3b40');
        parts.light(x - 0.008, by - U * 0.2, FACE_Z + 0.0045, '#39ff6a', activity(random() * 999, 0.5));
      }
    }
    for (let k = 0; k < 6 * units; k++) parts.quad(0.1, 0.0016, 0.1, y + (k - (6 * units - 1) / 2) * 0.0045, ON_FACE, '#0c0c0d');
    parts.light(0.185, y + 0.006, ON_FACE + 0.0004, random() < 0.08 ? '#ffae1f' : '#3aa8ff');
    parts.quad(0.006, 0.006, 0.185, y - 0.008, ON_FACE, '#55555a');
    for (const s of [-1, 1]) parts.box(0.006, units * U * 0.7, 0.012, s * (HALF - 0.009), y, FACE_Z + 0.006, '#4a4a50');
    return [];
  },
});
const SERVER_1U = server(1);
const SERVER_2U = server(2);

/** a UPS: a lit display, its buttons, a vent */
const UPS: UnitKind = {
  name: 'ups', units: 2,
  build: ({ parts }, y) => {
    face(parts, y, 2, '#2d2c30');
    parts.screen(new THREE.PlaneGeometry(0.07, 0.025).translate(-0.12, y + 0.01, ON_FACE + 0.0005), '#1f6b4c');
    for (let k = 0; k < 4; k++) parts.quad(0.008, 0.008, -0.06 + k * 0.014, y + 0.01, ON_FACE, '#4a4a50');
    for (let k = 0; k < 10; k++) parts.quad(0.2, 0.002, 0.09, y + (k - 4.5) * 0.007, ON_FACE, '#0c0c0d');
    return [];
  },
};

/** a switch: two rows of ports in their cages, a light over each, its uplinks and console on the right */
const SWITCH: UnitKind = {
  name: 'switch', units: 1,
  build: ({ parts, random }, y) => {
    face(parts, y, 1, '#222226');
    const ports: THREE.Vector2[] = [];
    for (const row of [-1, 1]) {
      const py = y + row * 0.0085 - 0.001;
      for (const x of across(20, 0.0145).map((v) => v - 0.03)) {
        parts.quad(0.0125, 0.0095, x, py, ON_FACE, '#8a8a8f');
        parts.quad(0.0105, 0.0075, x, py, ON_FACE + 0.0003, '#050505');
        if (random() < 0.7) parts.light(x + 0.004, py + row * 0.0062, ON_FACE + 0.0006, random() < 0.9 ? '#39ff6a' : '#ffae1f', activity(random() * 999, 0.7));
        ports.push(new THREE.Vector2(x, py));
      }
    }
    // the uplinks, the console, a light that blinks the heartbeat
    for (let k = 0; k < 4; k++) parts.quad(0.011, 0.007, 0.15 + k * 0.014, y - 0.006, ON_FACE, '#6c6c72');
    parts.quad(0.01, 0.007, 0.2, y + 0.008, ON_FACE, '#3a5f8a');
    parts.light(0.205, y - 0.008, ON_FACE + 0.0006, '#ffae1f', pulse(1, 0.1, random()));
    parts.quad(0.03, 0.005, -0.205, y + 0.012, ON_FACE, '#5e636b');
    return ports;
  },
};

/** a patch panel: a row of keystones (or fibre adapters) under a strip for their numbers */
const PANEL: UnitKind = {
  name: 'panel', units: 1,
  build: ({ parts, random }, y) => {
    const fibre = random() < 0.35;
    face(parts, y, 1, fibre ? '#c9c8c4' : '#1e1d20');
    parts.quad(HALF * 2 - 0.08, 0.008, 0, y + 0.014, ON_FACE, fibre ? '#e6e5e1' : '#d8d8d8');
    const ports: THREE.Vector2[] = [];
    for (const x of across(24)) {
      parts.quad(0.013, 0.013, x, y - 0.003, ON_FACE, fibre ? (random() < 0.5 ? '#2d6fd8' : '#d8cfa8') : '#dcd9d2');
      parts.quad(0.009, 0.007, x, y - 0.004, ON_FACE + 0.0003, '#060606');
      ports.push(new THREE.Vector2(x, y - 0.003));
    }
    return ports;
  },
};

/**
 * A horizontal manager: a plate with a row of fingers along its top edge and
 * another along its bottom; a cord comes in between two fingers and runs along
 * the open trough between the rows.
 */
const MANAGER: UnitKind = {
  name: 'manager', units: 1,
  build: ({ parts }, y) => {
    face(parts, y, 1, '#161618');
    for (const x of fingerXs()) {
      for (const s of [-1, 1]) parts.box(0.007, U * 0.26, FINGER_FRONT - FACE_Z, x, y + s * U * 0.36, (FINGER_FRONT + FACE_Z) / 2, '#1d1d20');
    }
    return [];
  },
};

/** where the fingers of a manager stand */
function fingerXs(): number[] {
  return across(13, 0.034);
}

const BLANK_1U: UnitKind = {
  name: 'blank', units: 1,
  build: ({ parts }, y) => {
    face(parts, y, 1, '#18181a');
    parts.quad(HALF * 2 - 0.08, 0.002, 0, y + 0.008, ON_FACE, '#252528');
    parts.quad(HALF * 2 - 0.08, 0.002, 0, y - 0.008, ON_FACE, '#252528');
    return [];
  },
};

// ------------------------------------------------------------- the cords

/**
 * Tidy: each port in use sends its cord straight out, down (or up) between two
 * fingers of the manager next to it, along the manager to the side the port is
 * nearer, and into the side channel. Ports without a manager next to them stay
 * empty: the rack was cabled by someone careful.
 */
function cordTidily({ parts, placed, random }: Build): void {
  const managers = placed.filter((p) => p.kind === 'manager').map((p) => p.y);
  const fingers = fingerXs();
  for (const unit of placed) {
    if (!unit.ports.length) continue;
    const yM = managers.find((m) => Math.abs(m - unit.y) < U * 1.1);
    if (yM === undefined) continue;
    const color = randomCordColor(random);
    for (const p of unit.ports) {
      if (random() < 0.3) continue;
      const side = p.x < 0 ? -1 : 1;
      // the gap between two fingers nearest the port, on its way to the side
      const gap = fingers.reduce((best, f) => (Math.abs(f + side * 0.017 - p.x) < Math.abs(best - p.x) ? f + side * 0.017 : best), fingers[0]);
      const z = 0.02 + random() * 0.012;
      parts.cord([
        new THREE.Vector3(p.x, p.y, FACE_Z), new THREE.Vector3(p.x, p.y, 0.012),
        new THREE.Vector3(gap, (p.y + yM) / 2, z), new THREE.Vector3(gap, yM, z),
        new THREE.Vector3(side * (HALF - 0.04), yM, z), new THREE.Vector3(side * CHANNEL_X, yM - 0.02, 0.0),
        new THREE.Vector3(side * CHANNEL_X, yM - 0.08, -0.07),
      ], random() < 0.85 ? color : randomCordColor(random));
    }
  }
}

/**
 * Messy: patch cords from a panel to a switch a few units away (and some the
 * other way), each sagging across the front at its own depth; others loop off
 * into a side channel; a few, low down, hang all the way to the floor.
 */
function cordMessily({ parts, placed, random }: Build): void {
  const panels = placed.filter((p) => p.kind === 'panel'), switches = placed.filter((p) => p.kind === 'switch');
  for (const panel of panels) {
    const near = switches.filter((s) => Math.abs(s.y - panel.y) < U * 4);
    // one colour for most of a panel's cords: they were run in one go
    const usual = randomCordColor(random);
    for (const p of panel.ports) {
      const r = random();
      if (r < 0.45) continue;
      const color = random() < 0.7 ? usual : randomCordColor(random);
      if (near.length && r < 0.85) {
        // to a port across the switch, not far along it
        const ports = pick(near, random).ports.filter((q) => Math.abs(q.x - p.x) < 0.12);
        if (ports.length) sag(parts, p, pick(ports, random), random, color);
      } else if (r < 0.97 || p.y > 0.9) {
        // off to a side channel, loosely
        const side = random() < 0.5 ? -1 : 1, drop = 0.05 + random() * 0.25;
        parts.cord([
          new THREE.Vector3(p.x, p.y, FACE_Z), new THREE.Vector3(p.x, p.y - 0.004, 0.03),
          new THREE.Vector3((p.x + side * HALF) / 2, p.y - drop, SAG_FRONT + random() * 0.04),
          new THREE.Vector3(side * CHANNEL_X, p.y - drop * 0.5, 0.02), new THREE.Vector3(side * CHANNEL_X, p.y - drop * 0.5 - 0.06, -0.07),
        ], color);
      } else {
        hangToFloor(parts, p, random, color);
      }
    }
  }
}

/** a cord from port `a` to port `b`, sagging across the front between them */
function sag(parts: RoomParts, a: THREE.Vector2, b: THREE.Vector2, random: () => number, color: string): void {
  const low = Math.min(a.y, b.y) - 0.015 - random() * 0.05 - Math.abs(a.x - b.x) * 0.1;
  const z = SAG_FRONT + random() * 0.03;
  parts.cord([
    new THREE.Vector3(a.x, a.y, FACE_Z), new THREE.Vector3(a.x, a.y - 0.004, 0.03),
    new THREE.Vector3(a.x + (b.x - a.x) * 0.3, low + (a.y - low) * 0.25, z),
    new THREE.Vector3(a.x + (b.x - a.x) * 0.7, low + (b.y - low) * 0.25, z),
    new THREE.Vector3(b.x, b.y - 0.004, 0.03), new THREE.Vector3(b.x, b.y, FACE_Z),
  ], color);
}

/** a cord falling straight from its port in front of the units below, and lying on the floor */
function hangToFloor(parts: RoomParts, p: THREE.Vector2, random: () => number, color: string): void {
  const z = SAG_FRONT + random() * 0.04, dx = (random() - 0.5) * 0.1;
  parts.cord([
    new THREE.Vector3(p.x, p.y, FACE_Z), new THREE.Vector3(p.x, p.y - 0.006, 0.03),
    new THREE.Vector3(p.x + dx * 0.3, p.y - 0.08, z), new THREE.Vector3(p.x + dx, p.y * 0.4, z + 0.01),
    new THREE.Vector3(p.x + dx, 0.03, z + 0.05), new THREE.Vector3(p.x + dx * 2, 0.004, z + 0.2 + random() * 0.2),
    new THREE.Vector3(p.x + dx * 3 + (random() - 0.5) * 0.3, 0.004, z + 0.4 + random() * 0.3),
  ], color);
}

/** the bundles running down the side channels, from the roof to the plinth: thicker in a tidy rack */
function buildSideBundles({ spec, parts, random }: Build): void {
  const room = spec.width / 2 - HALF - 0.045;
  for (const s of [-1, 1]) {
    const n = spec.messy ? 3 + Math.floor(random() * 5) : 8 + Math.floor(random() * 10);
    const color = randomCordColor(random);
    for (let k = 0; k < n; k++) {
      const x = s * (HALF + 0.004 + random() * room), z = -0.11 + random() * 0.05;
      const path: THREE.Vector3[] = [];
      for (let y = spec.height - 0.06; y > 0.06; y -= 0.25) path.push(new THREE.Vector3(x + (random() - 0.5) * 0.004, y, z + (random() - 0.5) * 0.004));
      path.push(new THREE.Vector3(x, 0.08, z));
      parts.cord(path, random() < 0.7 ? color : randomCordColor(random));
    }
  }
}

/** the colour of a cord of the room: a service's, or a fibre's */
export function randomCordColor(random: () => number): string {
  return random() < 0.75 ? pick(SERVICES, random).color : pick([CORD_KINDS.OS2.color, CORD_KINDS.OM4.color], random);
}
