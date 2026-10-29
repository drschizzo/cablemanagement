// The cabinet as the player sees it: its frame, its equipment and their
// ports, the name plates, the LEDs, and the cable management items.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLUMN_X, FRONT_Z, Rack, SIDE_BACK, U, WALL_X, type Port, type UnitSpec } from '../game/rack';
import type { CordType } from '../game/cordTypes';
import { disposeTree, shared } from './dispose';
import { assertNever } from '../lib/assertNever';
import { mergeStatic } from './batch';
import { bevelBox, bevelTemplate } from './bevel';
import { LedGlow, ledGlows } from './ledGlow';
import { STEADY, activity, blinkable, ledGlow, ledMesh, pulse, type LedSpec } from './leds';
import { rackMat } from './rackMaterials';
import { buildItem } from './rackItems';
import { crateWall, roundedBox } from './shapes';
import { buildRoom } from './room';
import { grilleMaterial, railMaterial, softShadow } from './rackTextures';

const markerGeo = shared(new THREE.RingGeometry(0.0085, 0.0105, 24));

/** what the face plate of a unit says it is (the interface knows the words) */
export type UnitLabeller = (unit: UnitSpec) => string;

export interface RackViewOptions {
  /** the floor of the room under the cabinet (default: drawn) */
  roomFloor?: boolean;
  /** the words on the face plates (default: none) */
  labelOf?: UnitLabeller;
}

export class RackView {
  group = new THREE.Group();
  itemsGroup = new THREE.Group();
  /** the rings that highlight ports, made the first time each is asked for (see marker()) */
  portMarkers = new Map<string, THREE.Mesh>();
  /** every port LED, one instance each */
  private leds: THREE.InstancedMesh;
  private ledOf = new Map<string, number>();
  private ledTint: THREE.InstancedBufferAttribute;
  private ledBlink: THREE.InstancedBufferAttribute;
  /** the status and activity lights of the equipment, gathered while it is built */
  private lights: LedSpec[] = [];
  /** the name plates of the equipment (unit, light or dark), gathered while it is built: drawn on one texture */
  private labels: { k: number; light: boolean }[] = [];
  /** so that two cabinets side by side do not blink in step */
  private seed = Math.random() * 1000;
  private builtVersion = -1;
  /** the light of its LEDs, for the cords in front of it */
  readonly glow: LedGlow;

  constructor(private rack: Rack, panelTypes: Map<number, CordType>, private opts: RackViewOptions = {}) {
    this.group.add(this.itemsGroup);
    this.buildCabinet();
    rack.units.forEach((u, k) => this.buildUnit(k, panelTypes.get(k) ?? 'OS2'));
    this.buildLabels();
    // the cabinet and its equipment never move: one mesh per material
    mergeStatic(this.group, (m) => m.parent === this.group && !m.userData.reflective);
    this.layParts();
    const ports = rack.ports.filter((p) => this.ledOf.has(p.id));
    // a unit lens, sized by its instance (blinkable() reads the size there)
    const geo = new THREE.BoxGeometry(1, 1, 0.001);
    this.ledTint = new THREE.InstancedBufferAttribute(new Float32Array(3 * ports.length), 3);
    this.ledBlink = new THREE.InstancedBufferAttribute(new Float32Array(3 * ports.length), 3);
    geo.setAttribute('emissiveTint', this.ledTint);
    geo.setAttribute('blink', this.ledBlink);
    this.leds = new THREE.InstancedMesh(geo, blinkable(new THREE.MeshStandardMaterial({ roughness: 0.3 })), ports.length);
    this.leds.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    for (const p of ports) {
      const i = this.ledOf.get(p.id)!;
      this.leds.setMatrixAt(i, m4.makeScale(0.003, 0.0018, 1).setPosition(p.x, p.y + 0.0078, 0.0006));
      this.setLed(p, 'off');
    }
    const lights = ledMesh(this.lights);
    this.group.add(this.leds, lights);
    this.glow = new LedGlow(this.group, [this.leds, lights], [-COLUMN_X - 0.05, rack.floorY, COLUMN_X + 0.05, rack.topY + 0.15]);
    ledGlows.add(this.glow);
    this.glow.light(this.group);
  }

  private light(x: number, y: number, color: THREE.ColorRepresentation, blink = STEADY, w = 0.0022, h = 0.0016, z = 0.0035): void {
    this.lights.push({ x, y, z, w, h, color, blink });
  }

  /** the small parts of the ports, by material: where each copy of its shape goes */
  private parts = new Map<THREE.Material, { geo: THREE.BufferGeometry; x: number; y: number; z: number }[]>();

  /**
   * A small part repeated at every port: laid straight into one mesh with the
   * others of its material (layParts). A mesh each, copied, moved and merged
   * afterwards, took most of the time a rack took to build.
   */
  private part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): void {
    let list = this.parts.get(m);
    if (!list) this.parts.set(m, (list = []));
    list.push({ geo, x, y, z });
  }

  private layParts(): void {
    for (const [m, list] of this.parts) {
      let verts = 0, idx = 0;
      for (const p of list) { verts += p.geo.attributes.position.count; idx += p.geo.index!.count; }
      const pos = new Float32Array(3 * verts), nrm = new Float32Array(3 * verts), uv = new Float32Array(2 * verts);
      const index = new Uint32Array(idx);
      let v = 0, i = 0;
      for (const p of list) {
        const P = p.geo.attributes.position.array, N = p.geo.attributes.normal.array, T = p.geo.attributes.uv.array, I = p.geo.index!.array;
        const n = P.length / 3;
        for (let k = 0; k < n; k++) {
          pos[3 * (v + k)] = P[3 * k] + p.x; pos[3 * (v + k) + 1] = P[3 * k + 1] + p.y; pos[3 * (v + k) + 2] = P[3 * k + 2] + p.z;
        }
        nrm.set(N, 3 * v);
        uv.set(T, 2 * v);
        for (let k = 0; k < I.length; k++) index[i + k] = I[k] + v;
        v += n;
        i += I.length;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.parts.clear();
  }

  private add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = shadow;
    mesh.castShadow = false;
    this.group.add(mesh);
    return mesh;
  }

  private buildCabinet(): void {
    const rack = this.rack;
    const top = rack.topY, bot = rack.floorY;
    if (rack.open) {
      this.buildOpenFrame();
      return;
    }
    // No two parts share a face plane: coplanar faces flicker as the camera
    // moves. Front posts stand 2 mm proud of the walls, the roof lip 6 mm.
    const roofY = top + 0.125;
    const h = roofY - bot;
    const cy = (roofY + bot) / 2;
    // walls, back of the side channels, floor, roof
    for (const s of [-1, 1]) {
      this.add(roundedBox(0.02, h, 0.5 + FRONT_Z - 0.004, 0.004), rackMat.wall, s * (WALL_X + 0.01), cy, (FRONT_Z - 0.004 - 0.5) / 2);
      this.add(bevelBox(WALL_X - COLUMN_X, h, 0.02, 0.003), rackMat.back, s * (COLUMN_X + WALL_X) / 2, cy, SIDE_BACK - 0.01);
      // rails with their square holes
      const rail = this.add(bevelBox(0.018, top + 0.06, 0.012, 0.0015), rackMat.frame, s * (COLUMN_X - 0.004), top / 2, -0.004);
      rail.material = railMaterial(top + 0.06);
      // front posts of the cabinet
      this.add(roundedBox(0.034, h, 0.032, 0.006), rackMat.frame, s * (WALL_X + 0.006), cy, FRONT_Z - 0.014);
    }
    // the cabinet floor is lighter, so that fallen cords stand out on it
    this.add(roundedBox(0.84, 0.03, 0.5 + FRONT_Z, 0.004), rackMat.floor, 0, bot - 0.015, (FRONT_Z - 0.5) / 2);
    // kick plate in front of the floor
    this.add(roundedBox(0.866, 0.03, 0.02, 0.005), rackMat.frame, 0, bot - 0.015, FRONT_Z - 0.008);
    // (the body casts no shadow: it would darken the inside, where the play is)
    this.add(roundedBox(0.86, 0.035, 0.5 + FRONT_Z + 0.006, 0.008), rackMat.wall, 0, roofY + 0.0175, (FRONT_Z + 0.006 - 0.5) / 2);
    // front cross bar under the roof, carrying the name plate
    this.add(roundedBox(WALL_X * 2 - 0.02, 0.055, 0.032, 0.006), rackMat.frame, 0, roofY - 0.0275, FRONT_Z - 0.014);
    // the lamp is one spot, which lights a round pool in the middle: a round downlight under the
    // middle of the cross bar, where it shines from (a bar the width of the cabinet promised an even light)
    const lampY = roofY - 0.055 - 0.008, lampZ = FRONT_Z - 0.02;
    this.add(new THREE.CylinderGeometry(0.03, 0.032, 0.008, 32), rackMat.frame, 0, lampY + 0.004, lampZ, false);
    // its lens, a shallow dome: seen from the front it stays an oval a few pixels tall, and lit below
    // the bloom (a thin lens over the threshold flashed from a line to a blot as the camera moved)
    const lens = this.add(new THREE.SphereGeometry(0.024, 32, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), rackMat.lens, 0, lampY, lampZ, false);
    lens.scale.y = 0.4;
    // the bulb behind it, peeking out of its middle: the only part that glows, a little
    this.add(new THREE.SphereGeometry(0.011, 24, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), rackMat.core, 0, lampY, lampZ, false);
    const lamp = new THREE.SpotLight('#ffd2a1', 1.4, 0, 1.15, 1, 2);
    lamp.position.set(0, lampY - 0.006, lampZ);
    lamp.target.position.set(0, bot, 0.02);
    this.group.add(lamp, lamp.target);
    // low lip at the front of the floor (no front bar: it hid the floor)
    const lip = this.add(new THREE.CylinderGeometry(0.007, 0.007, WALL_X * 2, 16), rackMat.frame, 0, bot + 0.012, FRONT_Z - 0.008);
    lip.rotation.z = Math.PI / 2;
    lip.castShadow = true;
    // plinth below the first unit
    this.add(bevelBox(COLUMN_X * 2 - 0.02, -0.02 - bot, 0.02, 0.003), rackMat.back, 0, (bot - 0.02) / 2, -0.01);
    this.buildCrate();
    if (this.opts.roomFloor !== false) {
      this.group.add(buildRoom(bot - 0.03));
      // contact shadows of the cabinet and the crate on the room floor
      const c = rack.crate();
      this.group.add(
        softShadow(0.98, 0.86, 0, bot - 0.03, (FRONT_Z - 0.5) / 2, 0.55),
        softShadow(c.max[0] - c.min[0] + 0.07, c.max[2] - c.min[2] + 0.07, (c.min[0] + c.max[0]) / 2, bot - 0.03, (c.min[2] + c.max[2]) / 2, 0.6),
      );
    }
  }

  /** the plastic crate for unplugged cords and spares: walls with a handle and vent slots, a rim on top */
  private buildCrate(): void {
    const c = this.rack.crate();
    const t = 0.008, cw = c.max[0] - c.min[0], ch = c.max[1] - c.min[1], cd = c.max[2] - c.min[2];
    const cx = (c.min[0] + c.max[0]) / 2, cy = (c.min[1] + c.max[1]) / 2, cz = (c.min[2] + c.max[2]) / 2;
    const front = crateWall(cw, ch, t), side = crateWall(cd - 2 * t + 0.002, ch, t);
    for (const z of [c.min[2] + t / 2, c.max[2] - t / 2]) this.add(front, rackMat.crate, cx, cy, z).castShadow = true;
    for (const x of [c.min[0] + t / 2, c.max[0] - t / 2]) {
      const m = this.add(side, rackMat.crate, x, cy, cz);
      m.rotation.y = Math.PI / 2;
      m.castShadow = true;
    }
    // thicker rim around the top edge
    const rimY = c.max[1] - 0.005, rt = t + 0.006;
    for (const z of [c.min[2] + t / 2, c.max[2] - t / 2]) this.add(roundedBox(cw + 0.006, 0.012, rt, 0.003), rackMat.crate, cx, rimY, z).castShadow = true;
    for (const x of [c.min[0] + t / 2, c.max[0] - t / 2]) this.add(roundedBox(rt, 0.012, cd - 2 * t, 0.003), rackMat.crate, x, rimY, cz).castShadow = true;
    // bottom with a few stiffening ribs
    this.add(roundedBox(cw - 0.004, 0.006, cd - 0.004, 0.002), rackMat.crate, cx, c.min[1] + 0.003, cz);
    for (let i = -1; i <= 1; i++) this.add(roundedBox(0.006, 0.003, cd - 2 * t, 0.0012), rackMat.crate, cx + i * cw * 0.25, c.min[1] + 0.0065, cz);
  }

  /** an open two-post rack: two uprights on feet, a top bar */
  private buildOpenFrame(): void {
    const rack = this.rack;
    const top = rack.topY + 0.03, bot = rack.floorY;
    for (const s of [-1, 1]) {
      const rail = this.add(bevelBox(0.022, top - bot, 0.03, 0.002), rackMat.frame, s * (COLUMN_X - 0.002), (top + bot) / 2, -0.012);
      rail.material = railMaterial(top - bot);
      rail.castShadow = true;
      this.add(roundedBox(0.06, 0.012, 0.42, 0.004), rackMat.frame, s * (COLUMN_X - 0.002), bot + 0.006, -0.1).castShadow = true;
    }
    this.add(roundedBox(COLUMN_X * 2 + 0.02, 0.03, 0.03, 0.005), rackMat.frame, 0, top + 0.015, -0.012);
    this.add(bevelBox(COLUMN_X * 2 - 0.02, -0.02 - bot, 0.02, 0.003), rackMat.back, 0, (bot - 0.02) / 2, -0.01);
    if (this.opts.roomFloor !== false) this.group.add(buildRoom(bot));
  }

  private buildUnit(k: number, type: CordType): void {
    const rack = this.rack;
    const u = rack.units[k];
    const y = rack.unitY(k);
    const w = COLUMN_X * 2 - 0.036;
    // the body of the equipment behind its face: seen from the side, and it gives the rack a solid shadow
    if (u.kind !== 'fingerManager' && u.kind !== 'blank') this.add(bevelBox(w - 0.01, U - 0.003, 0.3, 0.002), rackMat.body, 0, y, -0.16).castShadow = true;
    if (u.kind === 'blank') {
      this.add(roundedBox(w, U - 0.001, 0.01, 0.0015), rackMat.blank, 0, y, -0.005).castShadow = true;
      return;
    }
    if (u.kind === 'fingerManager') return;
    if (u.kind === 'server') {
      if (u.style === 'ups') this.buildUps(y, w);
      else this.buildServer(y, w);
      if (!u.portsAt) return;
    }
    const style = u.style ?? (u.kind === 'panel' ? 'fibre' : 'switch');
    if (u.kind !== 'server') this.add(roundedBox(w, U - 0.0012, 0.01, 0.0015), faceOf(style), 0, y, -0.005);
    // active equipment: power and a status light at the right end of its face
    if (u.kind === 'switch') {
      const s = this.seed + y * 1000, x = w / 2 - 0.016;
      this.light(x, y + U * 0.22, '#39ff6a');
      if (style === 'firewall') this.light(x, y, '#ff3b30', pulse(0.4, 0.5, fractOf(s * 1.7)));
      // a power strip has its power light only
      else if (style !== 'pdu') this.light(x, y, style === 'router' ? '#3aa8ff' : '#ffae1f', activity(s, 0.45));
    }
    // ears with the name of the equipment
    this.labels.push({ k, light: style === 'fibre' });
    for (const p of rack.ports.filter((q) => q.unit === k)) {
      if (p.power) {
        // a C13 outlet or a C14 inlet: a black socket, its three pins in a keyed recess
        this.part(bevelTemplate(0.017, 0.0125, 0.004, 0.0012), rackMat.socket, p.x, p.y - 0.002, 0.002);
        this.part(bevelTemplate(0.013, 0.0085, 0.002, 0.0008), rackMat.hole, p.x, p.y - 0.002, 0.0042);
      } else if (style === 'copper') {
        // white keystone jack with its RJ45 opening
        this.part(bevelTemplate(0.0135, 0.0135, 0.005, 0.0008), rackMat.keystone, p.x, p.y - 0.002, 0.0025);
        this.part(bevelTemplate(0.0115, 0.0085, 0.002, 0.0005), rackMat.hole, p.x, p.y - 0.003, 0.0052);
      } else if (u.kind === 'panel') {
        this.part(bevelTemplate(0.0095, 0.0105, 0.006, 0.0008), type === 'OS2' ? rackMat.adapterSM : rackMat.adapterMM, p.x, p.y - 0.002, 0.003);
        this.part(bevelTemplate(0.0055, 0.0065, 0.002, 0.0005), rackMat.hole, p.x, p.y - 0.002, 0.0062);
      } else {
        this.part(bevelTemplate(0.011, 0.0115, 0.004, 0.0006), rackMat.cage, p.x, p.y - 0.002, 0.002);
        this.part(bevelTemplate(0.0085, 0.008, 0.002, 0.0005), rackMat.hole, p.x, p.y - 0.002, 0.0042);
      }
      this.ledOf.set(p.id, this.ledOf.size);
    }
  }

  /**
   * The ring that highlights a port, hidden until shown. Made when first asked
   * for: one per port, hidden, was every port of an aisle of tall racks (14 000)
   * gone through by the passes that walk the whole scene, hidden or not, each frame.
   */
  marker(id: string): THREE.Mesh {
    let m = this.portMarkers.get(id);
    if (m) return m;
    const p = this.rack.port(id);
    m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: '#7ee0ff', transparent: true, opacity: 0.9, depthTest: false }));
    m.position.set(p.x, p.y - 0.002, 0.008);
    m.visible = false;
    m.renderOrder = 10;
    this.group.add(m);
    this.portMarkers.set(id, m);
    return m;
  }

  /**
   * The name plates of all the equipment, on one texture (a row each) and one
   * mesh: one plane and one texture per unit was a draw call each in every
   * pass, and 1.6 MB each. Past 8192 px of rows, another texture; in a tall
   * rack (seen from afar), rows of half the size.
   */
  private buildLabels(): void {
    const w = COLUMN_X * 2 - 0.036;
    const scale = this.labels.length > 24 ? 0.5 : 1;
    const rowH = LABEL_H * scale, per = Math.floor(8192 / rowH);
    for (let i0 = 0; i0 < this.labels.length; i0 += per) {
      const rows = this.labels.slice(i0, i0 + per);
      const c = document.createElement('canvas');
      c.width = LABEL_W * scale; c.height = rowH * rows.length;
      const g = c.getContext('2d')!;
      const planes = rows.map(({ k, light }, row) => {
        g.save();
        g.translate(0, row * rowH);
        g.scale(scale, scale);
        drawLabel(g, this.rack, k, light, this.opts.labelOf?.(this.rack.units[k]) ?? '');
        g.restore();
        const p = new THREE.PlaneGeometry(w, U - 0.002).translate(0, this.rack.unitY(k), 0.0004);
        // its row of the texture (the canvas is flipped: its top row at v = 1)
        const uv = p.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / rows.length);
        return p;
      });
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      const geo = mergeGeometries(planes);
      for (const p of planes) p.dispose();
      this.group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6 })));
    }
  }

  /** a 1U server: bezel with a vent grille, drive bays and blinking lights */
  private buildServer(y: number, w: number): void {
    this.add(roundedBox(w, U - 0.0012, 0.012, 0.0018), rackMat.switchFace, 0, y, -0.006);
    // drive bays on the left, network ports in the middle, vents on the right
    // every other drive busy: a green light flickering with its reads and writes
    const s = this.seed + y * 1000;
    for (let i = 0; i < 6; i++) {
      this.add(roundedBox(0.03, U * 0.55, 0.003, 0.001), rackMat.blank, -0.2 + i * 0.033, y, 0.0015);
      if (i % 2 === 0) this.light(-0.188 + i * 0.033, y - U * 0.18, '#39ff6a', activity(s + i, 0.55));
    }
    // power
    this.light(0.105, y, '#3aa8ff', STEADY, 0.0028, 0.0028);
    this.add(new THREE.PlaneGeometry(0.1, U * 0.62), grilleMaterial(), 0.17, y, 0.0005, false);
  }

  /** a 1U UPS: lit status display and a row of buttons */
  private buildUps(y: number, w: number): void {
    this.add(roundedBox(w, U - 0.0012, 0.014, 0.0018), rackMat.ups, 0, y, -0.007);
    this.add(roundedBox(0.06, 0.018, 0.002, 0.0008), rackMat.lcd, -0.12, y, 0.001);
    for (let i = 0; i < 4; i++) this.add(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 12).rotateX(Math.PI / 2), rackMat.cage, -0.07 + i * 0.012, y, 0.0015);
    // on line
    this.light(-0.07, y + U * 0.3, '#39ff6a');
    this.add(new THREE.PlaneGeometry(w * 0.45, U * 0.6), grilleMaterial(), w * 0.2, y, 0.0005, false);
  }

  /** the name plate on top of the cabinet */
  addPlate(text: string): void {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0d1218'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#5cc8ff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.045), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.6 }));
    // on the cross bar (the open frame has none: the plate then floats above it)
    m.position.set(0, this.rack.topY + (this.rack.open ? 0.12 : 0.0975), FRONT_Z + 0.0045);
    this.group.add(m);
  }

  /**
   * Every port LED: off when free, green on a line connected as planned,
   * orange otherwise. The ports of a production line cut blink red, fast
   * (`down`); on a bypass, amber, its traffic going elsewhere (`bypass`).
   */
  showLeds(okPorts: Set<string>, down = new Set<string>(), bypass = new Set<string>()): void {
    for (const p of this.rack.ports) {
      this.setLed(p, bypass.has(p.id) && !okPorts.has(p.id) ? 'bypass' : down.has(p.id) ? 'down' : !p.plugged ? 'off' : okPorts.has(p.id) ? 'ok' : 'wrong');
    }
  }

  setLed(port: Port, state: 'off' | 'ok' | 'wrong' | 'down' | 'bypass'): void {
    const i = this.ledOf.get(port.id);
    if (i === undefined) return;
    const c = state === 'ok' ? '#39ff6a' : state === 'wrong' ? '#ffae1f' : state === 'down' ? '#ff3b2f' : state === 'bypass' ? '#ffcf4a' : '#000000';
    const col = state === 'off' ? new THREE.Color(0, 0, 0) : ledGlow(new THREE.Color(c));
    col.toArray(this.ledTint.array, 3 * i);
    this.ledTint.needsUpdate = true;
    // a good line carries traffic (only active equipment shows it: a patch panel is passive);
    // a wrong one blinks slowly, as a fault does
    const active = this.rack.units[port.unit].kind !== 'panel';
    const b = state === 'wrong' ? pulse(1.2, 0.6) : state === 'down' ? pulse(3, 0.5) : (state === 'ok' || state === 'bypass') && active ? activity(this.seed + i, state === 'ok' ? 0.8 : 0.4) : STEADY;
    this.ledBlink.setXYZ(i, b.rate, b.duty, b.phase);
    this.ledBlink.needsUpdate = true;
    this.leds.setColorAt(i, col.set(state === 'off' ? '#202020' : c));
    this.leds.instanceColor!.needsUpdate = true;
  }

  /** rebuilds the managers, ducts and rings when the rack items change */
  syncItems(version: number): void {
    if (version === this.builtVersion) return;
    this.builtVersion = version;
    for (const c of [...this.itemsGroup.children]) {
      this.itemsGroup.remove(c);
      disposeTree(c);
    }
    const statics = this.rack.statics();
    for (const it of this.rack.items) this.itemsGroup.add(buildItem(this.rack, it, statics, null));
    mergeStatic(this.itemsGroup);
    this.glow.light(this.itemsGroup);
  }

  /**
   * Frees the cabinet on the GPU, its glow too: taken off the scene, the glow
   * is only left undrawn (an aisle set aside for a level shows again as it was).
   */
  dispose(): void {
    ledGlows.delete(this.glow);
    this.glow.dispose();
    disposeTree(this.group);
  }
}

/** the material of the face of a unit, by its look */
function faceOf(style: NonNullable<UnitSpec['style']>): THREE.Material {
  switch (style) {
    case 'fibre': return rackMat.panel;
    case 'copper': return rackMat.copperFace;
    case 'firewall': return rackMat.firewall;
    case 'router': return rackMat.router;
    case 'switch': return rackMat.switchFace;
    case 'pdu': return rackMat.pdu;
    // a server draws its own front (buildServer, buildUps)
    case 'server':
    case 'ups': return rackMat.body;
    default: return assertNever(style);
  }
}

function fractOf(x: number): number {
  return x - Math.floor(x);
}

/** size of the name plate of a unit on its texture (px) */
const LABEL_W = 2048, LABEL_H = 200;

/** the port numbers, name and label of unit k, light on a dark face or dark on a light one */
function drawLabel(g: CanvasRenderingContext2D, rack: Rack, k: number, light: boolean, label: string): void {
  const u = rack.units[k];
  const W = LABEL_W, H = LABEL_H;
  const w = COLUMN_X * 2 - 0.036;
  const toPx = (x: number) => ((x + w / 2) / w) * W;
  g.fillStyle = light ? '#2a3038' : '#c9d1da';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 40px system-ui, sans-serif';
  for (const p of rack.ports.filter((q) => q.unit === k)) g.fillText(String(p.index + 1), toPx(p.x), 30);
  g.font = 'bold 86px system-ui, sans-serif';
  g.fillStyle = light ? '#1d4fa8' : '#59c2ff';
  g.textAlign = 'left';
  g.fillText(u.name ?? '', 18, H / 2 + 6);
  g.font = '30px system-ui, sans-serif';
  g.fillStyle = light ? '#59616b' : '#8d97a3';
  g.textAlign = 'right';
  g.fillText(label, W - 16, H - 26);
}
