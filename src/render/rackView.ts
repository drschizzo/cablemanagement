import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLUMN_X, FRONT_Z, Rack, SIDE_BACK, SIDE_IN, SIDE_OUT, U, WALL_X, type Item, type Port } from '../game/rack';
import type { StaticShape } from '../physics/cableSim';
import type { FibreType } from '../game/levels';

// warm graphite powder-coat rather than blue-grey steel
const mat = {
  frame: new THREE.MeshStandardMaterial({ color: '#333134', roughness: 0.5, metalness: 0.65 }),
  wall: new THREE.MeshStandardMaterial({ color: '#211f21', roughness: 0.62, metalness: 0.4 }),
  back: new THREE.MeshStandardMaterial({ color: '#131213', roughness: 0.9, metalness: 0.2 }),
  body: new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.55, metalness: 0.5 }),
  floor: new THREE.MeshStandardMaterial({ color: '#46494b', roughness: 0.7, metalness: 0.3 }),
  panel: new THREE.MeshStandardMaterial({ color: '#d6d5d2', roughness: 0.42, metalness: 0.45 }),
  switchFace: new THREE.MeshStandardMaterial({ color: '#272629', roughness: 0.48, metalness: 0.5 }),
  blank: new THREE.MeshStandardMaterial({ color: '#201f22', roughness: 0.65, metalness: 0.4 }),
  hole: new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 }),
  cage: new THREE.MeshStandardMaterial({ color: '#aba8a3', roughness: 0.32, metalness: 0.9 }),
  adapterSM: new THREE.MeshStandardMaterial({ color: '#2d6fd8', roughness: 0.45 }),
  adapterMM: new THREE.MeshStandardMaterial({ color: '#d8cfa8', roughness: 0.45 }),
  ring: new THREE.MeshStandardMaterial({ color: '#19181a', roughness: 0.45, metalness: 0.1 }),
  duct: new THREE.MeshStandardMaterial({ color: '#353437', roughness: 0.55, metalness: 0.1 }),
  ductBack: new THREE.MeshStandardMaterial({ color: '#2f2e31', roughness: 0.8 }),
  mgrPlate: new THREE.MeshStandardMaterial({ color: '#19181b', roughness: 0.55, metalness: 0.3 }),
  copperFace: new THREE.MeshStandardMaterial({ color: '#1e1d20', roughness: 0.5, metalness: 0.5 }),
  keystone: new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.4 }),
  firewall: new THREE.MeshStandardMaterial({ color: '#7a2020', roughness: 0.45, metalness: 0.5 }),
  router: new THREE.MeshStandardMaterial({ color: '#173c6e', roughness: 0.45, metalness: 0.5 }),
  ups: new THREE.MeshStandardMaterial({ color: '#2d2c30', roughness: 0.55, metalness: 0.4 }),
  crate: new THREE.MeshStandardMaterial({ color: '#2c2f32', roughness: 0.6, metalness: 0.0 }),
  strip: new THREE.MeshStandardMaterial({ color: '#fff1dc', emissive: '#ffd7a3', emissiveIntensity: 2.2 }),
};

export const ghostMat = new THREE.MeshStandardMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.45, emissive: '#1f6f99', depthWrite: false });
export const ghostBadMat = new THREE.MeshStandardMaterial({ color: '#ff6f6f', transparent: true, opacity: 0.4, emissive: '#992020', depthWrite: false });

export class RackView {
  group = new THREE.Group();
  itemsGroup = new THREE.Group();
  leds = new Map<string, THREE.MeshStandardMaterial>();
  portMarkers = new Map<string, THREE.Mesh>();
  private builtVersion = -1;

  constructor(private rack: Rack, panelTypes: Map<number, FibreType>, private opts: { roomFloor?: boolean } = {}) {
    this.group.add(this.itemsGroup);
    this.buildCabinet();
    rack.units.forEach((u, k) => this.buildUnit(k, panelTypes.get(k) ?? 'OS2'));
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
    const r = this.rack;
    const top = r.topY, bot = r.floorY;
    if (r.open) {
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
      this.add(rbox(0.02, h, 0.5 + FRONT_Z - 0.004, 0.004), mat.wall, s * (WALL_X + 0.01), cy, (FRONT_Z - 0.004 - 0.5) / 2);
      this.add(new THREE.BoxGeometry(WALL_X - COLUMN_X, h, 0.02), mat.back, s * (COLUMN_X + WALL_X) / 2, cy, SIDE_BACK - 0.01);
      // rails with their square holes
      const rail = this.add(new THREE.BoxGeometry(0.018, top + 0.06, 0.012), mat.frame, s * (COLUMN_X - 0.004), top / 2, -0.004);
      rail.material = railMaterial(top + 0.06);
      // front posts of the cabinet
      this.add(rbox(0.034, h, 0.032, 0.006), mat.frame, s * (WALL_X + 0.006), cy, FRONT_Z - 0.014);
    }
    // the cabinet floor is lighter, so that fallen cords stand out on it
    this.add(rbox(0.84, 0.03, 0.5 + FRONT_Z, 0.004), mat.floor, 0, bot - 0.015, (FRONT_Z - 0.5) / 2);
    // kick plate in front of the floor
    this.add(rbox(0.866, 0.03, 0.02, 0.005), mat.frame, 0, bot - 0.015, FRONT_Z - 0.008);
    // (the body casts no shadow: it would darken the inside, where the play is)
    this.add(rbox(0.86, 0.035, 0.5 + FRONT_Z + 0.006, 0.008), mat.wall, 0, roofY + 0.0175, (FRONT_Z + 0.006 - 0.5) / 2);
    // front cross bar under the roof, carrying the name plate
    this.add(rbox(WALL_X * 2 - 0.02, 0.055, 0.032, 0.006), mat.frame, 0, roofY - 0.0275, FRONT_Z - 0.014);
    // warm LED strip under the roof, behind the cross bar
    this.add(rbox(0.6, 0.006, 0.012, 0.003), mat.strip, 0, roofY - 0.004, FRONT_Z - 0.05, false);
    const lamp = new THREE.SpotLight('#ffd2a1', 1.4, 0, 1.15, 1, 2);
    lamp.position.set(0, roofY - 0.01, FRONT_Z - 0.06);
    lamp.target.position.set(0, bot, 0.02);
    this.group.add(lamp, lamp.target);
    // low lip at the front of the floor (no front bar: it hid the floor)
    const lip = this.add(new THREE.CylinderGeometry(0.007, 0.007, WALL_X * 2, 16), mat.frame, 0, bot + 0.012, FRONT_Z - 0.008);
    lip.rotation.z = Math.PI / 2;
    lip.castShadow = true;
    // plinth below the first unit
    this.add(new THREE.BoxGeometry(COLUMN_X * 2 - 0.02, -0.02 - bot, 0.02), mat.back, 0, (bot - 0.02) / 2, -0.01);
    this.buildCrate();
    if (this.opts.roomFloor !== false) {
      this.group.add(buildRoom(bot - 0.03));
      // contact shadows of the cabinet and the crate on the room floor
      const c = r.crate();
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
    for (const z of [c.min[2] + t / 2, c.max[2] - t / 2]) this.add(front, mat.crate, cx, cy, z).castShadow = true;
    for (const x of [c.min[0] + t / 2, c.max[0] - t / 2]) {
      const m = this.add(side, mat.crate, x, cy, cz);
      m.rotation.y = Math.PI / 2;
      m.castShadow = true;
    }
    // thicker rim around the top edge
    const rimY = c.max[1] - 0.005, rt = t + 0.006;
    for (const z of [c.min[2] + t / 2, c.max[2] - t / 2]) this.add(rbox(cw + 0.006, 0.012, rt, 0.003), mat.crate, cx, rimY, z).castShadow = true;
    for (const x of [c.min[0] + t / 2, c.max[0] - t / 2]) this.add(rbox(rt, 0.012, cd - 2 * t, 0.003), mat.crate, x, rimY, cz).castShadow = true;
    // bottom with a few stiffening ribs
    this.add(rbox(cw - 0.004, 0.006, cd - 0.004, 0.002), mat.crate, cx, c.min[1] + 0.003, cz);
    for (let i = -1; i <= 1; i++) this.add(rbox(0.006, 0.003, cd - 2 * t, 0.0012), mat.crate, cx + i * cw * 0.25, c.min[1] + 0.0065, cz);
  }

  /** an open two-post rack: two uprights on feet, a top bar */
  private buildOpenFrame(): void {
    const r = this.rack;
    const top = r.topY + 0.03, bot = r.floorY;
    for (const s of [-1, 1]) {
      const rail = this.add(new THREE.BoxGeometry(0.022, top - bot, 0.03), mat.frame, s * (COLUMN_X - 0.002), (top + bot) / 2, -0.012);
      rail.material = railMaterial(top - bot);
      rail.castShadow = true;
      this.add(rbox(0.06, 0.012, 0.42, 0.004), mat.frame, s * (COLUMN_X - 0.002), bot + 0.006, -0.1).castShadow = true;
    }
    this.add(rbox(COLUMN_X * 2 + 0.02, 0.03, 0.03, 0.005), mat.frame, 0, top + 0.015, -0.012);
    this.add(new THREE.BoxGeometry(COLUMN_X * 2 - 0.02, -0.02 - bot, 0.02), mat.back, 0, (bot - 0.02) / 2, -0.01);
    if (this.opts.roomFloor !== false) this.group.add(buildRoom(bot));
  }

  private buildUnit(k: number, type: FibreType): void {
    const r = this.rack;
    const u = r.units[k];
    const y = r.unitY(k);
    const w = COLUMN_X * 2 - 0.036;
    // the body of the equipment behind its face: seen from the side, and it gives the rack a solid shadow
    if (u.kind !== 'hmgr' && u.kind !== 'blank') this.add(new THREE.BoxGeometry(w - 0.01, U - 0.003, 0.3), mat.body, 0, y, -0.16).castShadow = true;
    if (u.kind === 'blank') {
      this.add(rbox(w, U - 0.001, 0.01, 0.0015), mat.blank, 0, y, -0.005).castShadow = true;
      return;
    }
    if (u.kind === 'hmgr') return;
    if (u.kind === 'server') {
      if (u.style === 'ups') this.buildUps(y, w);
      else this.buildServer(y, w);
      if (!u.portsAt) return;
    }
    const style = u.style ?? (u.kind === 'panel' ? 'fibre' : 'switch');
    const face = style === 'fibre' ? mat.panel : style === 'copper' ? mat.copperFace : style === 'firewall' ? mat.firewall : style === 'router' ? mat.router : mat.switchFace;
    if (u.kind !== 'server') this.add(rbox(w, U - 0.0012, 0.01, 0.0015), face, 0, y, -0.005);
    // ears with the name of the equipment
    const label = labelTexture(r, k, style === 'fibre');
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, U - 0.002), new THREE.MeshStandardMaterial({ map: label, transparent: true, roughness: 0.6 }));
    plane.position.set(0, y, 0.0004);
    this.group.add(plane);
    for (const p of r.ports.filter((q) => q.unit === k)) {
      if (style === 'copper') {
        // white keystone jack with its RJ45 opening
        this.add(new THREE.BoxGeometry(0.0135, 0.0135, 0.005), mat.keystone, p.x, p.y - 0.002, 0.0025);
        this.add(new THREE.BoxGeometry(0.0115, 0.0085, 0.002), mat.hole, p.x, p.y - 0.003, 0.0052);
      } else if (u.kind === 'panel') {
        this.add(new THREE.BoxGeometry(0.0095, 0.0105, 0.006), type === 'OS2' ? mat.adapterSM : mat.adapterMM, p.x, p.y - 0.002, 0.003);
        this.add(new THREE.BoxGeometry(0.0055, 0.0065, 0.002), mat.hole, p.x, p.y - 0.002, 0.0062);
      } else {
        this.add(new THREE.BoxGeometry(0.011, 0.0115, 0.004), mat.cage, p.x, p.y - 0.002, 0.002);
        this.add(new THREE.BoxGeometry(0.0085, 0.008, 0.002), mat.hole, p.x, p.y - 0.002, 0.0042);
      }
      const led = new THREE.MeshStandardMaterial({ color: '#202020', emissive: '#000000', roughness: 0.3 });
      this.add(new THREE.BoxGeometry(0.003, 0.0018, 0.001), led, p.x, p.y + 0.0078, 0.0006);
      this.leds.set(p.id, led);
      // invisible marker used to highlight a port
      const marker = new THREE.Mesh(new THREE.RingGeometry(0.0085, 0.0105, 24), new THREE.MeshBasicMaterial({ color: '#7ee0ff', transparent: true, opacity: 0.9, depthTest: false }));
      marker.position.set(p.x, p.y - 0.002, 0.008);
      marker.visible = false;
      marker.renderOrder = 10;
      this.group.add(marker);
      this.portMarkers.set(p.id, marker);
    }
  }

  /** a 1U server: bezel with a vent grille, drive bays and blinking lights */
  private buildServer(y: number, w: number): void {
    this.add(rbox(w, U - 0.0012, 0.012, 0.0018), mat.switchFace, 0, y, -0.006);
    // drive bays on the left, network ports in the middle, vents on the right
    for (let i = 0; i < 6; i++) {
      this.add(rbox(0.03, U * 0.55, 0.003, 0.001), mat.blank, -0.2 + i * 0.033, y, 0.0015);
      const led = new THREE.MeshStandardMaterial({ color: '#1a1a1a', emissive: i % 3 === 2 ? '#ffae1f' : '#39c8ff', emissiveIntensity: 1.6 + (i % 2) });
      this.add(new THREE.BoxGeometry(0.0025, 0.0025, 0.001), led, -0.188 + i * 0.033, y - U * 0.18, 0.0035);
    }
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.1, U * 0.62), new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.6, transparent: true }));
    grille.position.set(0.17, y, 0.0005);
    this.group.add(grille);
  }

  /** a 1U UPS: lit status display and a row of buttons */
  private buildUps(y: number, w: number): void {
    this.add(rbox(w, U - 0.0012, 0.014, 0.0018), mat.ups, 0, y, -0.007);
    const lcd = new THREE.MeshStandardMaterial({ color: '#0a1a14', emissive: '#3ff0a8', emissiveIntensity: 0.9 });
    this.add(rbox(0.06, 0.018, 0.002, 0.0008), lcd, -0.12, y, 0.001);
    for (let i = 0; i < 4; i++) this.add(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 12).rotateX(Math.PI / 2), mat.cage, -0.07 + i * 0.012, y, 0.0015);
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, U * 0.6), new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.6, transparent: true }));
    vent.position.set(w * 0.2, y, 0.0005);
    this.group.add(vent);
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

  setLed(port: Port, state: 'off' | 'ok' | 'wrong'): void {
    const m = this.leds.get(port.id);
    if (!m) return;
    const c = state === 'ok' ? '#39ff6a' : state === 'wrong' ? '#ffae1f' : '#000000';
    m.emissive.set(c);
    m.emissiveIntensity = state === 'off' ? 0 : 2.2;
    m.color.set(state === 'off' ? '#202020' : c);
  }

  /** rebuilds the managers, ducts and rings when the rack items change */
  syncItems(version: number): void {
    if (version === this.builtVersion) return;
    this.builtVersion = version;
    for (const c of [...this.itemsGroup.children]) {
      this.itemsGroup.remove(c);
      c.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    const statics = this.rack.statics();
    for (const it of this.rack.items) this.itemsGroup.add(buildItem(this.rack, it, statics, null));
  }
}

/** meshes of an item, built from its own collision shapes so that what you see is what holds */
export function buildItem(rack: Rack, it: Item, statics: StaticShape[] | null, ghost: THREE.Material | null): THREE.Group {
  const g = new THREE.Group();
  const shapes = (statics ?? itemShapes(rack, it)).filter((s) => s.owner === it.id);
  const ringMat = ghost ?? (it.kind === 'duct' ? mat.duct : mat.ring);
  for (const s of shapes) {
    if (s.kind === 'capsule') {
      const a = new THREE.Vector3(s.ax, s.ay, s.az), b = new THREE.Vector3(s.bx, s.by, s.bz);
      const len = a.distanceTo(b);
      if (it.kind !== 'vring') {
        // duct and manager fingers are flat plastic strips
        const dir = b.clone().sub(a);
        const t = 2 * s.r + 0.0008;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(dir.x) + t, Math.abs(dir.y) + t, Math.abs(dir.z) + t), ringMat);
        strip.position.copy(a).add(b).multiplyScalar(0.5);
        strip.castShadow = !ghost; strip.receiveShadow = true;
        g.add(strip);
        continue;
      }
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, len, 10), ringMat);
      cyl.position.copy(a).add(b).multiplyScalar(0.5);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      cyl.castShadow = !ghost; cyl.receiveShadow = true;
      g.add(cyl);
      for (const p of [a, b]) {
        const sph = new THREE.Mesh(new THREE.SphereGeometry(s.r, 10, 8), ringMat);
        sph.position.copy(p);
        g.add(sph);
      }
    } else {
      const sx = s.max[0] - s.min[0], sy = s.max[1] - s.min[1], sz = s.max[2] - s.min[2];
      const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), ghost ?? mat.ductBack);
      box.position.set((s.max[0] + s.min[0]) / 2, (s.max[1] + s.min[1]) / 2, (s.max[2] + s.min[2]) / 2);
      box.receiveShadow = true;
      g.add(box);
    }
  }
  // backing plates
  if (it.kind === 'hmgr') {
    const plate = new THREE.Mesh(rbox(COLUMN_X * 2 - 0.036, U - 0.001, 0.01, 0.0015), ghost ?? mat.mgrPlate);
    plate.position.set(0, rack.unitY(it.unit), -0.004);
    plate.receiveShadow = true;
    g.add(plate);
  } else if (it.kind === 'duct') {
    const yTop = rack.topY - it.unit * U, yBot = rack.topY - (it.unit + it.span) * U;
    const back = new THREE.Mesh(new THREE.BoxGeometry(SIDE_OUT - SIDE_IN, yTop - yBot, 0.004), ghost ?? mat.ductBack);
    back.position.set((it.side * (SIDE_IN + SIDE_OUT)) / 2, (yTop + yBot) / 2, SIDE_BACK + 0.002);
    back.receiveShadow = true;
    g.add(back);
  }
  return g;
}

function itemShapes(rack: Rack, it: Item): StaticShape[] {
  // a throw-away rack holding only this item gives its shapes
  const tmp = Object.create(Rack.prototype) as Rack;
  Object.assign(tmp, rack, { items: [it] });
  return tmp.statics();
}

let grille: THREE.CanvasTexture | null = null;
function grilleTexture(): THREE.CanvasTexture {
  if (grille) return grille;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a3038'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#07090c';
  for (let y = 6; y < 60; y += 9) for (let x = 6 + ((y / 9) % 2) * 4; x < 252; x += 9) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  grille = new THREE.CanvasTexture(c);
  grille.colorSpace = THREE.SRGBColorSpace;
  return grille;
}

function railMaterial(height: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a4049'; g.fillRect(0, 0, 32, 128);
  g.fillStyle = '#07090b';
  // three square holes per unit
  for (let i = 0; i < 3; i++) g.fillRect(11, 8 + i * 42, 10, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, height / U);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.7 });
}

function labelTexture(rack: Rack, k: number, light: boolean): THREE.CanvasTexture {
  const u = rack.units[k];
  const W = 2048, H = 200;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
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
  g.fillText(u.label ?? '', W - 16, H - 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** a box with rounded edges (r: bevel radius) */
function rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

/** a centred rounded rectangle (a shape, or a hole when `hole`) */
function roundRect(w: number, h: number, r: number, x = 0, y = 0, hole = false): THREE.Shape | THREE.Path {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  const x0 = x - w / 2, y0 = y - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x0 + r, y0);
  p.lineTo(x0 + w - r, y0);
  p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  p.lineTo(x0 + w, y0 + h - r);
  p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  p.lineTo(x0 + r, y0 + h);
  p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  p.lineTo(x0, y0 + r);
  p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}

/** a crate wall (w × h, t thick, centred, facing z): a handle slot near the top, vent slots below */
function crateWall(w: number, h: number, t: number): THREE.BufferGeometry {
  const s = roundRect(w, h, 0.006) as THREE.Shape;
  s.holes.push(roundRect(Math.min(0.11, w * 0.4), 0.02, 0.01, 0, h / 2 - 0.025, true) as THREE.Path);
  const n = Math.floor((w - 0.06) / 0.028);
  for (let i = 0; i <= n; i++) s.holes.push(roundRect(0.011, 0.045, 0.0055, (i - n / 2) * 0.028, -h / 2 + 0.037, true) as THREE.Path);
  const bev = 0.0018;
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(t - 2 * bev) / 2);
  return g;
}

/** an abstract stage around the rack: a floor lit in a pool under it, fading into the backdrop */
export function buildRoom(floorY: number): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshStandardMaterial({
      color: STAGE_FLOOR, map: poolTexture(), transparent: true, roughness: 0.8, metalness: 0,
      normalMap: tileNormals(), normalScale: new THREE.Vector2(1, 1),
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, 0.3);
  floor.receiveShadow = true;
  // picked up by the screen-space reflections of the stage
  floor.userData.reflective = true;
  g.add(floor);
  return g;
}

const STAGE_FLOOR = '#2f3438';

let pool: THREE.CanvasTexture | null = null;
/** raised-floor tiles (60 cm), white, bright in the middle, darker then transparent towards the edges */
function poolTexture(): THREE.CanvasTexture {
  if (pool) return pool;
  const N = 2048, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(225,225,225,1)');
  grad.addColorStop(0.45, 'rgba(120,120,120,0.85)');
  grad.addColorStop(1, 'rgba(60,60,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  // the plane is 9 m wide: 15 tiles, the cabinet centred on one of them
  const tile = N / 15;
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) {
    const k = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    g.fillStyle = `rgba(0,0,0,${0.03 + 0.04 * (k - Math.floor(k))})`;
    g.fillRect(i * tile, j * tile, tile, tile);
  }
  for (let i = 0; i <= 15; i++) {
    const x = Math.round(i * tile);
    // a light seam: the relief comes from the normal map
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x - 1, 0, 3, N); g.fillRect(0, x - 1, N, 3);
  }
  // a light speckle in the colour (about 4 mm a pixel), as in a vinyl tile
  const img = g.getImageData(0, 0, N, N), px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const k = Math.sin(i * 0.000917 + (i % 7919) * 12.9898) * 43758.5453;
    const f = 0.95 + 0.1 * (k - Math.floor(k));
    px[i] *= f; px[i + 1] *= f; px[i + 2] *= f;
  }
  g.putImageData(img, 0, 0);
  // a faint trace of the interface's green at the foot of the cabinet
  const hint = g.createRadialGradient(N / 2, N * 0.48, 0, N / 2, N * 0.48, N * 0.07);
  hint.addColorStop(0, 'rgba(139,227,180,0.10)');
  hint.addColorStop(1, 'rgba(139,227,180,0)');
  g.fillStyle = hint;
  g.fillRect(0, 0, N, N);
  pool = new THREE.CanvasTexture(c);
  pool.anisotropy = 8;
  pool.colorSpace = THREE.SRGBColorSpace;
  return pool;
}

let tileN: THREE.DataTexture | null = null;
/** normals of one 60 cm tile, repeated over the floor: rounded edges down to a narrow seam */
function tileNormals(): THREE.DataTexture {
  if (tileN) return tileN;
  const N = 512, h = new Float32Array(N * N);
  // about 0.85 px per mm: a 12 mm rounded edge falling 2 mm, then a 2 mm gap between tiles
  const B = 10, D = 1.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const e = Math.min(x + 0.5, N - 0.5 - x, y + 0.5, N - 0.5 - y);
    const t = Math.max(0, 1 - e / B);
    h[y * N + x] = e < 1 ? -D - 1.5 : -D * (1 - Math.sqrt(1 - t * t));
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)];
    const hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    // rows go up the texture (v), so the slope along v is +hy
    let nx = -hx, ny = -hy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * N + x) * 4;
    data[o] = (nx * 0.5 + 0.5) * 255; data[o + 1] = (ny * 0.5 + 0.5) * 255; data[o + 2] = (nz * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  tileN = new THREE.DataTexture(data, N, N);
  tileN.wrapS = tileN.wrapT = THREE.RepeatWrapping;
  tileN.repeat.set(15, 15);
  tileN.magFilter = THREE.LinearFilter;
  tileN.minFilter = THREE.LinearMipmapLinearFilter;
  tileN.generateMipmaps = true;
  tileN.anisotropy = 8;
  tileN.needsUpdate = true;
  return tileN;
}

/** a dark soft-edged plane lying on the floor: the contact shadow a light map would give */
function softShadow(w: number, d: number, x: number, y: number, z: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: '#000000' }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.0005, z);
  m.renderOrder = -1;
  return m;
}

let blob: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
  if (blob) return blob;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  // stacked faint rounded rectangles: dense in the middle, fading at the edges
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 24; i++) {
    const m = 2 + i * 1.4;
    g.beginPath();
    g.roundRect(m, m, N - 2 * m, N - 2 * m, 30 - i);
    g.fill();
  }
  // only the alpha counts: the material colour is black
  blob = new THREE.CanvasTexture(c);
  return blob;
}
