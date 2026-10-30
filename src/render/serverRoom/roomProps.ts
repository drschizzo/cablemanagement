// The things lying about the server room, as scenery: the cable tray over a
// row of racks and the bundles dropping from it, cardboard boxes, coils of
// cord, a cart with its monitor, cords left on the floor, an extinguisher,
// what is left after work on the floor (spare tiles, velcro,
// cable ties, slack out of a grommet).
// Each is built in its own frame (on the floor, at the origin), then placed.

import * as THREE from 'three';
import { CORD_R, RoomParts, randomCordColor } from './roomParts';

/** the tray: its width (m), the pitch of its rungs */
const TRAY_W = 0.3;
const RUNG_PITCH = 0.3;

/**
 * A ladder tray `length` long along +x, at height `y`, centred on z = 0: its
 * rails and rungs, bundles of cords running along it, sagging between the
 * rungs, and at each of `drops` (x, and the height of the rack top under it) a
 * bundle falling into the rack; here and there a loop hanging below it.
 */
export function cableTray(length: number, y: number, drops: { x: number; top: number }[], random: () => number): RoomParts {
  const parts = new RoomParts();
  for (const s of [-1, 1]) parts.box(length, 0.05, 0.012, length / 2, y, s * TRAY_W / 2, '#3a3a3e');
  for (let x = 0.05; x < length; x += RUNG_PITCH) parts.box(0.02, 0.012, TRAY_W, x, y - 0.02, 0, '#3a3a3e');
  // the bundles lying on the rungs, each a few cords side by side
  const bundles = 3 + Math.floor(random() * 3);
  for (let b = 0; b < bundles; b++) {
    const z0 = -TRAY_W / 2 + 0.04 + (b / bundles) * (TRAY_W - 0.08), color = randomCordColor(random);
    for (let c = 0; c < 4; c++) {
      const z = z0 + c * 0.007, lift = -0.006 + c * 0.004;
      const path: THREE.Vector3[] = [];
      for (let x = 0; x <= length; x += RUNG_PITCH / 2) {
        // on a rung, or sagging a little between two
        const between = Math.round(x / (RUNG_PITCH / 2)) % 2;
        path.push(new THREE.Vector3(x, y - 0.006 + lift - between * 0.008, z + (random() - 0.5) * 0.004));
      }
      parts.cord(path, random() < 0.85 ? color : randomCordColor(random));
    }
  }
  for (const d of drops) {
    const color = randomCordColor(random), n = 3 + Math.floor(random() * 5);
    for (let c = 0; c < n; c++) {
      const x = d.x + (c - n / 2) * 0.008, z = (random() - 0.5) * 0.1;
      parts.cord([new THREE.Vector3(x - 0.1, y - 0.008, z), new THREE.Vector3(x, y - 0.03, z), new THREE.Vector3(x + (random() - 0.5) * 0.02, (y + d.top) / 2, z * 0.5),
        new THREE.Vector3(x, d.top - 0.02, 0)], c % 3 === 0 ? randomCordColor(random) : color);
    }
  }
  // a loop someone left hanging below the tray
  for (let k = 0; k < 2; k++) {
    if (random() < 0.4) continue;
    const x = 0.3 + random() * (length - 0.6), w = 0.15 + random() * 0.3, sag = 0.2 + random() * 0.4;
    parts.cord([new THREE.Vector3(x, y - 0.01, 0.05), new THREE.Vector3(x + w * 0.2, y - sag * 0.8, 0.08), new THREE.Vector3(x + w * 0.5, y - sag, 0.1),
      new THREE.Vector3(x + w * 0.8, y - sag * 0.8, 0.08), new THREE.Vector3(x + w, y - 0.01, 0.05)], randomCordColor(random));
  }
  return parts;
}

/** one to three cardboard boxes stacked, a little askew, their tape across the top */
export function boxStack(random: () => number): RoomParts {
  const parts = new RoomParts();
  let y = 0;
  const n = 1 + Math.floor(random() * 3);
  for (let k = 0; k < n; k++) {
    const w = 0.35 + random() * 0.2, h = 0.22 + random() * 0.15, d = 0.3 + random() * 0.15, yaw = (random() - 0.5) * 0.4;
    const x = (random() - 0.5) * 0.06, z = (random() - 0.5) * 0.06;
    parts.box(w, h, d, x, y + h / 2, z, random() < 0.3 ? '#9a7a52' : '#7d5f3e', yaw);
    parts.box(w + 0.002, 0.003, 0.05, x, y + h + 0.001, z, '#b59a6e', yaw);
    y += h;
  }
  return parts;
}

/** a coil of cord lying on the floor, turns piled loosely */
export function cordCoil(random: () => number): RoomParts {
  const parts = new RoomParts();
  const color = randomCordColor(random), r = 0.1 + random() * 0.08, turns = 4 + Math.floor(random() * 5);
  for (let k = 0; k < turns; k++) {
    const t = new THREE.TorusGeometry(r + (random() - 0.5) * 0.02, 0.0028, 6, 48).rotateX(Math.PI / 2);
    parts.coil(t.rotateZ((random() - 0.5) * 0.08).translate((random() - 0.5) * 0.02, 0.003 + k * 0.004, (random() - 0.5) * 0.02), color);
  }
  // its two ends, straying out of it
  for (const a of [random() * 6.3, random() * 6.3]) {
    parts.cord([new THREE.Vector3(Math.cos(a) * r, 0.01, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * (r + 0.1), 0.004, Math.sin(a) * (r + 0.12)),
      new THREE.Vector3(Math.cos(a + 0.4) * (r + 0.25), 0.003, Math.sin(a + 0.4) * (r + 0.2))], color);
  }
  return parts;
}

/** a cart with a monitor and a keyboard on it, for working at a rack; the monitor on, dimly */
export function crashCart(random: () => number): RoomParts {
  const parts = new RoomParts();
  const w = 0.55, d = 0.45;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.box(0.025, 0.9, 0.025, sx * (w / 2 - 0.02), 0.5, sz * (d / 2 - 0.02), '#4a4b50');
      parts.solid(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 20).rotateZ(Math.PI / 2).translate(sx * (w / 2 - 0.02), 0.03, sz * (d / 2 - 0.02)), '#111112');
    }
  }
  for (const y of [0.25, 0.92]) parts.box(w, 0.02, d, 0, y, 0, '#38393d');
  // the monitor, turned a little, and its keyboard
  const yaw = (random() - 0.5) * 0.5;
  parts.box(0.04, 0.12, 0.04, 0, 0.99, -0.08, '#1b1b1d');
  parts.box(0.46, 0.3, 0.03, 0, 1.18, -0.08, '#18181a', yaw);
  parts.screen(new THREE.PlaneGeometry(0.42, 0.26).rotateY(yaw).translate(Math.sin(yaw) * 0.016, 1.18, -0.08 + Math.cos(yaw) * 0.016), '#1d3b55');
  parts.box(0.38, 0.015, 0.13, 0.02, 0.94, 0.12, '#202022', (random() - 0.5) * 0.3);
  // something left on the bottom shelf
  parts.box(0.3, 0.12, 0.25, -0.05, 0.32, 0, '#7d5f3e', random());
  return parts;
}

/** a cord left lying on the floor, wandering from the origin over `length` m along +x */
export function floorCord(length: number, random: () => number): RoomParts {
  const parts = new RoomParts();
  const path: THREE.Vector3[] = [];
  let z = 0;
  for (let x = 0; x <= length; x += 0.15) {
    z += (random() - 0.5) * 0.12;
    path.push(new THREE.Vector3(x, 0.003, z));
  }
  parts.cord(path, randomCordColor(random));
  return parts;
}

/** a fire extinguisher standing on the floor */
export function extinguisher(): RoomParts {
  const parts = new RoomParts();
  parts.solid(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 28).translate(0, 0.25, 0), '#a8241c');
  parts.solid(new THREE.CylinderGeometry(0.03, 0.05, 0.06, 20).translate(0, 0.53, 0), '#1a1a1a');
  parts.box(0.12, 0.02, 0.03, 0.04, 0.57, 0, '#1a1a1a');
  return parts;
}

/** a roll of velcro tape lying flat, its loose end out */
export function velcroRoll(random: () => number): RoomParts {
  const parts = new RoomParts();
  const color = random() < 0.6 ? '#1b1c1e' : '#2f4f8a';
  parts.coil(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 32).translate(0, 0.01, 0), color);
  parts.solid(new THREE.CylinderGeometry(0.019, 0.019, 0.0205, 20).translate(0, 0.01, 0), '#8a7a5e');
  parts.box(0.12, 0.0015, 0.02, 0.1, 0.001, 0.045, color, -0.15);
  return parts;
}

/** cable ties dropped on the floor, cut off or new */
export function cableTies(random: () => number): RoomParts {
  const parts = new RoomParts();
  const n = 4 + Math.floor(random() * 6), color = random() < 0.5 ? '#e6e3dc' : '#1c1c1e';
  for (let k = 0; k < n; k++) {
    const len = random() < 0.5 ? 0.05 + random() * 0.05 : 0.2;
    parts.box(len, 0.0015, 0.0045, (random() - 0.5) * 0.3, 0.001, (random() - 0.5) * 0.25, color, random() * 6.3);
  }
  return parts;
}

/** spare floor tiles (60 cm) stacked against the wall of racks, not quite square on each other */
export function tileStack(random: () => number): RoomParts {
  const parts = new RoomParts();
  const n = 2 + Math.floor(random() * 4);
  for (let k = 0; k < n; k++) {
    parts.box(0.6, 0.03, 0.6, (random() - 0.5) * 0.04, 0.015 + k * 0.031, (random() - 0.5) * 0.04, k === n - 1 && random() < 0.5 ? '#6f7377' : '#5c6064', (random() - 0.5) * 0.06);
  }
  return parts;
}

/**
 * Cords left coming up out of a grommet whose slot is `w` long along x: they
 * rise out of it, fall over and lie on the floor towards +z, a plug at each end.
 */
export function grommetSlack(w: number, random: () => number): RoomParts {
  const parts = new RoomParts();
  const n = 2 + Math.floor(random() * 4), color = randomCordColor(random);
  for (let c = 0; c < n; c++) {
    const x = (c / Math.max(1, n - 1) - 0.5) * w * 0.7, len = 0.25 + random() * 0.4, turn = (random() - 0.5) * 1.2;
    const path = [new THREE.Vector3(x, -0.05, 0), new THREE.Vector3(x, 0.03, 0), new THREE.Vector3(x + 0.01, 0.04 + random() * 0.03, 0.04)];
    let px = x, pz = 0.08, a = Math.PI / 2 + turn * 0.3;
    for (let s = 0; s < len; s += 0.08) {
      a += (random() - 0.5) * 0.5;
      px += Math.cos(a) * 0.08; pz += Math.sin(a) * 0.08;
      path.push(new THREE.Vector3(px, CORD_R, pz));
    }
    const cord = random() < 0.8 ? color : randomCordColor(random);
    parts.cord(path, cord);
    const end = path[path.length - 1], prev = path[path.length - 2];
    parts.box(0.03, 0.012, 0.014, end.x, 0.006, end.z, '#d9dbd6', -Math.atan2(end.z - prev.z, end.x - prev.x));
  }
  return parts;
}
