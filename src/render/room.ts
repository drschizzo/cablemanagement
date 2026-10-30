// An abstract stage around the rack: a floor of raised tiles lit in a pool
// under it, fading into the backdrop. Each tile has its surface drawn close
// up (colour, roughness, relief: a plain tile or a perforated one, repeated
// over the floor), worn over the whole floor by years of use.

import * as THREE from 'three/webgpu';
import { shared } from './dispose';
import { reflective } from './imagePipeline';
import { tsl, type ShaderNode } from './tsl';
import { rng } from '../lib/random';

const { texture, uv, vec4, mix, normalMap, materialColor, clamp } = tsl;

export function buildRoom(floorY: number): THREE.Group {
  const g = new THREE.Group();
  // picked up by the screen-space reflections of the stage
  const m = reflective(new THREE.MeshStandardNodeMaterial({ color: STAGE_FLOOR, transparent: true, metalness: 0 }));
  const n = floorNodes();
  m.colorNode = n.color;
  m.normalNode = n.normal;
  m.roughnessNode = n.roughness;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), m);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, 0.3);
  floor.receiveShadow = true;
  g.add(floor);
  return g;
}

const STAGE_FLOOR = '#2f3438';
/** the plane is 9 m wide: 15 tiles of 60 cm, the cabinet centred on one of them */
const TILES = 15;
/** a tile's colour is stored over this range (it can be lighter than the floor's colour) */
const ALBEDO_RANGE = 1.5;

/**
 * Tiles i (along x, from x = -4.5 m) and j (along z, from z = -4.2 m)
 * perforated: in the cold aisle before the cabinet, one in two, and in front
 * of the rows down either side of it (see serverRoom).
 */
const PERFORATED: [number, number][] = [[3, 8], [5, 8], [7, 8], [9, 8], [11, 8], [5, 4], [5, 6], [9, 4], [9, 6]];
/** where the floor is cut for a brush grommet, cords going under it: the middle of each slot (m, the floor's frame) */
export const GROMMETS = [{ x: -1.08, z: -0.95 }, { x: 0.73, z: -1.7 }, { x: -0.6, z: 2.1 }];
/** a grommet's slot (m): along x, along z */
export const GROMMET_SIZE = [0.22, 0.06];

let nodes: { color: ShaderNode; normal: ShaderNode; roughness: ShaderNode } | null = null;
/**
 * The floor's colour, relief and roughness, the same nodes for every level
 * (three keys its shaders by them): the tile's surface where it is (plain or
 * perforated), in the pool of light, worn.
 */
function floorNodes(): NonNullable<typeof nodes> {
  if (nodes) return nodes;
  const at = uv(), onTile = at.mul(TILES);
  const plain = plainTile(), perforated = perforatedTile();
  const perf = texture(perforationMask(), at).r;
  const surface = mix(texture(plain.surface, onTile), texture(perforated.surface, onTile), perf);
  const relief = mix(texture(plain.normal, onTile), texture(perforated.normal, onTile), perf);
  const pool = texture(poolTexture(), at), wear = texture(wearTexture(), at);
  nodes = {
    color: vec4(materialColor.mul(pool.rgb).mul(surface.r.mul(ALBEDO_RANGE)).mul(wear.g), pool.a),
    normal: normalMap(relief.xyz),
    roughness: clamp(surface.g.add(wear.r.sub(0.5)), 0.05, 1),
  };
  return nodes;
}

let pool: THREE.CanvasTexture | null = null;
/**
 * The light on the floor, white, bright in the middle, darker then transparent
 * towards the edges; each tile a little different, dirt along the joints, the
 * grommets cut in it.
 */
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
  const tile = N / TILES;
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < TILES; i++) for (let j = 0; j < TILES; j++) {
    const k = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    g.fillStyle = `rgba(0,0,0,${0.03 + 0.04 * (k - Math.floor(k))})`;
    g.fillRect(i * tile, j * tile, tile, tile);
  }
  const random = rng(7);
  // tiles replaced over the years, of a newer batch: a little lighter
  for (let k = 0; k < 10; k++) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(Math.floor(3 + random() * 9) * tile, Math.floor(2 + random() * 11) * tile, tile, tile);
  }
  // the dirt gathered along the joints, fading out of them (the joint itself: see plainTile)
  for (let i = 0; i <= TILES; i++) {
    const x = Math.round(i * tile);
    g.fillStyle = 'rgba(0,0,0,0.035)';
    g.fillRect(x - 4, 0, 9, N); g.fillRect(0, x - 4, N, 9);
  }
  // a slot cut in a tile, its brush closing it: a dark gap, bristles lighter across it
  for (const s of GROMMETS) {
    const w = GROMMET_SIZE[0] / 0.6 * tile, h = GROMMET_SIZE[1] / 0.6 * tile;
    const x0 = (s.x + 4.5) / 0.6 * tile - w / 2, y0 = (s.z + 4.2) / 0.6 * tile - h / 2;
    g.fillStyle = 'rgba(20,20,22,0.9)';
    g.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    g.fillStyle = 'rgba(0,0,0,0.95)';
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = 'rgba(70,70,74,0.6)';
    g.lineWidth = 1;
    for (let x = x0 + 1; x < x0 + w; x += 2) {
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (random() - 0.5) * 2, y0 + h * (0.3 + random() * 0.2)); g.stroke();
      g.beginPath(); g.moveTo(x, y0 + h); g.lineTo(x + (random() - 0.5) * 2, y0 + h * (0.5 + random() * 0.2)); g.stroke();
    }
  }
  // a faint trace of the interface's green at the foot of the cabinet
  g.globalCompositeOperation = 'source-over';
  const hint = g.createRadialGradient(N / 2, N * 0.48, 0, N / 2, N * 0.48, N * 0.07);
  hint.addColorStop(0, 'rgba(139,227,180,0.10)');
  hint.addColorStop(1, 'rgba(139,227,180,0)');
  g.fillStyle = hint;
  g.fillRect(0, 0, N, N);
  pool = shared(new THREE.CanvasTexture(c));
  pool.anisotropy = 8;
  pool.colorSpace = THREE.SRGBColorSpace;
  return pool;
}

let mask: THREE.DataTexture | null = null;
/** one texel a tile: 1 where it is perforated */
function perforationMask(): THREE.DataTexture {
  if (mask) return mask;
  const data = new Uint8Array(TILES * TILES * 4);
  // rows go up the texture (v), from the front of the floor (z = 4.8 m): tile j is row 14 - j
  for (const [i, j] of PERFORATED) data[((TILES - 1 - j) * TILES + i) * 4] = 255;
  mask = shared(new THREE.DataTexture(data, TILES, TILES));
  mask.magFilter = mask.minFilter = THREE.NearestFilter;
  mask.needsUpdate = true;
  return mask;
}

let wear: THREE.DataTexture | null = null;
/**
 * Years of use over the whole floor (about 9 mm a texel): in R the roughness
 * added (0.5: none), polished where people walk, in G the colour left (1:
 * clean), mottled with grime, greyer on the paths and at the feet of the rows.
 */
function wearTexture(): THREE.DataTexture {
  if (wear) return wear;
  const N = 1024, data = new Uint8Array(N * N * 4);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = -4.5 + 9 * (px + 0.5) / N, z = 4.8 - 9 * (py + 0.5) / N;
    // the paths: the aisle before the cabinet, and down either side of it
    const front = Math.exp(-((x / 1.2) ** 2)) * smooth(0.2, 0.8, z);
    const sides = Math.exp(-(((Math.abs(x) - 1.05) / 0.3) ** 2)) * smooth(-2.6, -1.8, z);
    const walk = Math.min(1, front + sides);
    const mottle = fbm(x * 1.6 + 11, z * 1.6 - 3, 4), fine = fbm(x * 9, z * 9, 3);
    // grime where the rows stand (|x| about 1.6 m, z below 0.4 m; and the end row, z about -3 m)
    const feet = Math.exp(-(((Math.abs(x) - 1.6) / 0.15) ** 2)) * smooth(0.6, 0.2, z) + Math.exp(-(((z + 2.95) / 0.15) ** 2));
    const rough = 0.5 - 0.13 * walk + 0.12 * (mottle - 0.5) + 0.05 * (fine - 0.5);
    const clean = 1 - 0.16 * mottle * mottle - 0.05 * walk - 0.12 * Math.min(1, feet) - 0.04 * fine;
    const o = (py * N + px) * 4;
    data[o] = clamp255(rough); data[o + 1] = clamp255(clean); data[o + 3] = 255;
  }
  wear = shared(new THREE.DataTexture(data, N, N));
  linearMipmapped(wear, 8);
  return wear;
}

/** a tile's surface (in R its colour, over ALBEDO_RANGE; in G its roughness) and its relief */
interface TileMaps {
  surface: THREE.DataTexture;
  normal: THREE.DataTexture;
}

let plain: TileMaps | null = null;
/**
 * A plain tile (about 1.2 mm a texel): a laminate, finely flecked and a
 * little uneven, its edge trimmed in a darker, glossier plastic rounded down
 * to the narrow joint with its neighbours.
 */
function plainTile(): TileMaps {
  if (plain) return plain;
  const N = 512;
  plain = tileMaps(N, 600 / N, rng(11), () => null);
  return plain;
}

let perforated: TileMaps | null = null;
/**
 * A perforated tile (about 0.6 mm a texel): the same edge and laminate, and
 * inside a border of 25 mm, rows of round holes (10 mm, 22 mm apart) with
 * a chamfered rim, going down into the dark under the floor.
 */
function perforatedTile(): TileMaps {
  if (perforated) return perforated;
  const N = 1024, mm = 600 / N, pitch = 22, holeR = 5, chamfer = 0.8, field = 25 * pitch, start = (600 - field) / 2;
  perforated = tileMaps(N, mm, rng(12), (xm, ym) => {
    const u = xm - start, v = ym - start;
    if (u < 0 || v < 0 || u > field || v > field) return null;
    const cx = (Math.floor(u / pitch) + 0.5) * pitch, cy = (Math.floor(v / pitch) + 0.5) * pitch;
    const d = Math.hypot(u - cx, v - cy);
    if (d > holeR + chamfer) return null;
    if (d > holeR) {
      // the chamfer: down 0.8 mm to the hole's edge, a little darker
      const t = (d - holeR) / chamfer;
      return { height: -0.8 * (1 - t), albedo: 0.75 + 0.2 * t, roughness: 0.55 };
    }
    // the hole: deep, lit less the deeper one looks into it
    return { height: -4, albedo: 0.04 + 0.1 * (d / holeR) ** 4, roughness: 1 };
  });
  return perforated;
}

/** what a tile has at (xm, ym) mm from its corner, instead of its laminate; null: the laminate */
type TileFeature = (xm: number, ym: number) => { height: number; albedo: number; roughness: number } | null;

/** the maps of a tile N texels a side, `mm` a texel: its laminate, its edge, and `feature` */
function tileMaps(N: number, mm: number, random: () => number, feature: TileFeature): TileMaps {
  const height = new Float32Array(N * N), surface = new Uint8Array(N * N * 4);
  // the trim along the edge, its rounded fall to the joint, the joint (mm)
  const TRIM = 6, ROUND = 10, FALL = 1.6, JOINT = 1, BLOTCH = 15;
  // flecks in the laminate, darker and lighter
  const flecks = new Float32Array(N * N);
  for (let k = 0; k < N * N * 0.02; k++) {
    const p = Math.floor(random() * N * N), s = random() < 0.5 ? -1 : 1;
    flecks[p] += s * (0.06 + random() * 0.1);
    if (random() < 0.4) flecks[(p + 1) % (N * N)] += s * 0.05;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xm = (x + 0.5) * mm, ym = (y + 0.5) * mm, i = y * N + x;
    const e = Math.min(xm, 600 - xm, ym, 600 - ym);
    let h: number, albedo: number, rough: number;
    if (e < JOINT) {
      h = -FALL - 2; albedo = 0.25; rough = 1;
    } else if (e < ROUND) {
      const t = 1 - (e - JOINT) / (ROUND - JOINT);
      h = -FALL * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      albedo = 0.8; rough = 0.5;
    } else {
      // an orange peel in the laminate, its gloss uneven over a few cm
      const peel = fbm(xm / 3, ym / 3, 2) - 0.5, blotch = fbm(xm / BLOTCH, ym / BLOTCH, 3);
      h = 0.03 * peel;
      albedo = e < ROUND + TRIM ? 0.82 : 0.97 + 0.05 * (blotch - 0.5) + flecks[i];
      rough = e < ROUND + TRIM ? 0.55 : 0.72 + 0.12 * (blotch - 0.5) + 0.03 * peel;
    }
    const f = feature(xm, ym);
    if (f) { h += f.height; albedo = f.albedo; rough = f.roughness; }
    height[i] = h;
    const o = i * 4;
    surface[o] = clamp255(albedo / ALBEDO_RANGE); surface[o + 1] = clamp255(rough); surface[o + 3] = 255;
  }
  const normal = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (height[y * N + ((x + 1) % N)] - height[y * N + ((x + N - 1) % N)]) / (2 * mm);
    const dy = (height[((y + 1) % N) * N + x] - height[((y + N - 1) % N) * N + x]) / (2 * mm);
    // rows go up the texture (v), so the slope along v is +dy
    let nx = -dx, ny = -dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * N + x) * 4;
    normal[o] = (nx * 0.5 + 0.5) * 255; normal[o + 1] = (ny * 0.5 + 0.5) * 255; normal[o + 2] = (nz * 0.5 + 0.5) * 255; normal[o + 3] = 255;
  }
  const maps = { surface: shared(new THREE.DataTexture(surface, N, N)), normal: shared(new THREE.DataTexture(normal, N, N)) };
  for (const t of [maps.surface, maps.normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    linearMipmapped(t, 16);
  }
  return maps;
}

/** a data texture filtered across its mipmaps, data (not colour) */
function linearMipmapped(t: THREE.DataTexture, anisotropy: number): void {
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** 0 below a, 1 above b, smoothly between (a > b turns it round) */
function smooth(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** a value at each corner of the unit grid, in [0, 1), repeating every 256 cells */
const LATTICE = (() => {
  const random = rng(5), t = new Float32Array(256 * 256);
  for (let k = 0; k < t.length; k++) t[k] = random();
  return t;
})();

function lattice(i: number, j: number): number {
  return LATTICE[((i & 255) << 8) | (j & 255)];
}

/** smooth noise in [0, 1) */
function valueNoise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(i, j), b = lattice(i + 1, j), c = lattice(i, j + 1), d = lattice(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** octaves of noise, each twice as fine and half as strong, in [0, 1) */
function fbm(x: number, y: number, octaves: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, y);
    norm += amp;
    x *= 2; y *= 2; amp *= 0.5;
  }
  return sum / norm;
}
