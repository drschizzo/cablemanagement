import * as THREE from 'three';
import { COLUMN_X, FRONT_Z, Rack, SIDE_BACK, SIDE_IN, SIDE_OUT, U, WALL_X, type Item, type Port } from '../game/rack';
import type { StaticShape } from '../physics/cableSim';
import type { FibreType } from '../game/levels';

const mat = {
  frame: new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.55, metalness: 0.7 }),
  wall: new THREE.MeshStandardMaterial({ color: '#171b21', roughness: 0.8, metalness: 0.3 }),
  back: new THREE.MeshStandardMaterial({ color: '#101317', roughness: 0.9, metalness: 0.2 }),
  floor: new THREE.MeshStandardMaterial({ color: '#3a414b', roughness: 0.75, metalness: 0.3 }),
  panel: new THREE.MeshStandardMaterial({ color: '#cfd4da', roughness: 0.45, metalness: 0.45 }),
  switchFace: new THREE.MeshStandardMaterial({ color: '#22262d', roughness: 0.5, metalness: 0.5 }),
  blank: new THREE.MeshStandardMaterial({ color: '#1c2026', roughness: 0.7, metalness: 0.4 }),
  hole: new THREE.MeshStandardMaterial({ color: '#050607', roughness: 1 }),
  cage: new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.35, metalness: 0.9 }),
  adapterSM: new THREE.MeshStandardMaterial({ color: '#2d6fd8', roughness: 0.45 }),
  adapterMM: new THREE.MeshStandardMaterial({ color: '#d8cfa8', roughness: 0.45 }),
  ring: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.45, metalness: 0.1 }),
  duct: new THREE.MeshStandardMaterial({ color: '#30353c', roughness: 0.55, metalness: 0.1 }),
  ductBack: new THREE.MeshStandardMaterial({ color: '#2c3239', roughness: 0.8 }),
  mgrPlate: new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.6, metalness: 0.3 }),
  copperFace: new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.55, metalness: 0.5 }),
  keystone: new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 0.4 }),
  firewall: new THREE.MeshStandardMaterial({ color: '#7a2020', roughness: 0.45, metalness: 0.5 }),
  router: new THREE.MeshStandardMaterial({ color: '#173c6e', roughness: 0.45, metalness: 0.5 }),
  ups: new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.6, metalness: 0.4 }),
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
    const h = top - bot + 0.16;
    const cy = (top + 0.16 + bot) / 2;
    // walls, back of the side channels, floor, roof
    for (const s of [-1, 1]) {
      this.add(new THREE.BoxGeometry(0.02, h, 0.5 + FRONT_Z), mat.wall, s * (WALL_X + 0.01), cy, (FRONT_Z - 0.5) / 2);
      this.add(new THREE.BoxGeometry(WALL_X - COLUMN_X, h, 0.02), mat.back, s * (COLUMN_X + WALL_X) / 2, cy, SIDE_BACK - 0.01);
      // rails with their square holes
      const rail = this.add(new THREE.BoxGeometry(0.018, top + 0.06, 0.012), mat.frame, s * (COLUMN_X - 0.004), top / 2, -0.004);
      rail.material = railMaterial(top + 0.06);
      // front frame of the cabinet
      this.add(new THREE.BoxGeometry(0.03, h, 0.03), mat.frame, s * (WALL_X + 0.005), cy, FRONT_Z - 0.015);
    }
    // the cabinet floor is lighter, so that fallen cords stand out on it
    this.add(new THREE.BoxGeometry(0.84, 0.03, 0.5 + FRONT_Z), mat.floor, 0, bot - 0.015, (FRONT_Z - 0.5) / 2);
    this.add(new THREE.BoxGeometry(0.9, 0.03, 0.75), mat.wall, 0, top + 0.14, -0.125);
    this.add(new THREE.BoxGeometry(0.9, 0.04, 0.03), mat.frame, 0, top + 0.12, FRONT_Z - 0.015);
    // low lip at the front of the floor (no front bar: it hid the floor)
    const lip = this.add(new THREE.CylinderGeometry(0.007, 0.007, WALL_X * 2, 12), mat.frame, 0, bot + 0.012, FRONT_Z - 0.008);
    lip.rotation.z = Math.PI / 2;
    lip.castShadow = true;
    // plinth below the first unit
    this.add(new THREE.BoxGeometry(COLUMN_X * 2 - 0.02, -0.02 - bot, 0.02), mat.back, 0, (bot - 0.02) / 2, -0.01);
    // the crate for unplugged cords and spares
    const c = r.crate();
    const crate = new THREE.MeshStandardMaterial({ color: '#2d5f8f', roughness: 0.6 });
    const t = 0.008, cw = c.max[0] - c.min[0], ch = c.max[1] - c.min[1], cd = c.max[2] - c.min[2];
    const cx = (c.min[0] + c.max[0]) / 2, cy2 = (c.min[1] + c.max[1]) / 2, cz = (c.min[2] + c.max[2]) / 2;
    for (const [w, d, x, z] of [[t, cd, c.min[0] + t / 2, cz], [t, cd, c.max[0] - t / 2, cz], [cw, t, cx, c.min[2] + t / 2], [cw, t, cx, c.max[2] - t / 2]]) {
      const m = this.add(new THREE.BoxGeometry(w, ch, d), crate, x, cy2, z);
      m.castShadow = true;
    }
    this.add(new THREE.BoxGeometry(cw, 0.004, cd), crate, cx, c.min[1] + 0.002, cz);
    // the room floor
    if (this.opts.roomFloor !== false) {
      const floor = this.add(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 0.9 }), 0, bot - 0.03, 0);
      floor.rotation.x = -Math.PI / 2;
    }
  }

  /** an open two-post rack: two uprights on feet, a top bar */
  private buildOpenFrame(): void {
    const r = this.rack;
    const top = r.topY + 0.03, bot = r.floorY;
    for (const s of [-1, 1]) {
      const rail = this.add(new THREE.BoxGeometry(0.022, top - bot, 0.03), mat.frame, s * (COLUMN_X - 0.002), (top + bot) / 2, -0.012);
      rail.material = railMaterial(top - bot);
      rail.castShadow = true;
      this.add(new THREE.BoxGeometry(0.06, 0.012, 0.42), mat.frame, s * (COLUMN_X - 0.002), bot + 0.006, -0.1);
    }
    this.add(new THREE.BoxGeometry(COLUMN_X * 2 + 0.02, 0.03, 0.03), mat.frame, 0, top + 0.015, -0.012);
    this.add(new THREE.BoxGeometry(COLUMN_X * 2 - 0.02, -0.02 - bot, 0.02), mat.back, 0, (bot - 0.02) / 2, -0.01);
    if (this.opts.roomFloor !== false) {
      const floor = this.add(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 0.9 }), 0, bot, 0);
      floor.rotation.x = -Math.PI / 2;
    }
  }

  private buildUnit(k: number, type: FibreType): void {
    const r = this.rack;
    const u = r.units[k];
    const y = r.unitY(k);
    const w = COLUMN_X * 2 - 0.036;
    if (u.kind === 'blank') {
      this.add(new THREE.BoxGeometry(w, U - 0.001, 0.01), mat.blank, 0, y, -0.005);
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
    if (u.kind !== 'server') this.add(new THREE.BoxGeometry(w, U - 0.0012, 0.01), face, 0, y, -0.005);
    this.add(new THREE.BoxGeometry(w, U - 0.0012, 0.01), face, 0, y, -0.005);
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
    this.add(new THREE.BoxGeometry(w, U - 0.0012, 0.012), mat.switchFace, 0, y, -0.006);
    // drive bays on the left, network ports in the middle, vents on the right
    for (let i = 0; i < 6; i++) {
      this.add(new THREE.BoxGeometry(0.03, U * 0.55, 0.003), mat.blank, -0.2 + i * 0.033, y, 0.0015);
      const led = new THREE.MeshStandardMaterial({ color: '#1a1a1a', emissive: i % 3 === 2 ? '#ffae1f' : '#39c8ff', emissiveIntensity: 1.6 + (i % 2) });
      this.add(new THREE.BoxGeometry(0.0025, 0.0025, 0.001), led, -0.188 + i * 0.033, y - U * 0.18, 0.0035);
    }
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.1, U * 0.62), new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.6, transparent: true }));
    grille.position.set(0.17, y, 0.0005);
    this.group.add(grille);
  }

  /** a 1U UPS: lit status display and a row of buttons */
  private buildUps(y: number, w: number): void {
    this.add(new THREE.BoxGeometry(w, U - 0.0012, 0.014), mat.ups, 0, y, -0.007);
    const lcd = new THREE.MeshStandardMaterial({ color: '#0a1a14', emissive: '#3ff0a8', emissiveIntensity: 0.9 });
    this.add(new THREE.BoxGeometry(0.06, 0.018, 0.002), lcd, -0.12, y, 0.001);
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
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.056), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.6 }));
    m.position.set(0, this.rack.topY + 0.12, FRONT_Z + 0.002);
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
    const plate = new THREE.Mesh(new THREE.BoxGeometry(COLUMN_X * 2 - 0.036, U - 0.001, 0.01), ghost ?? mat.mgrPlate);
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
