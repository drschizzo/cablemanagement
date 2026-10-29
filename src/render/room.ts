// An abstract stage around the rack: a floor of raised tiles lit in a pool
// under it, fading into the backdrop.

import * as THREE from 'three';
import { shared } from './dispose';

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
  pool = shared(new THREE.CanvasTexture(c));
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
  tileN = shared(new THREE.DataTexture(data, N, N));
  tileN.wrapS = tileN.wrapT = THREE.RepeatWrapping;
  tileN.repeat.set(15, 15);
  tileN.magFilter = THREE.LinearFilter;
  tileN.minFilter = THREE.LinearMipmapLinearFilter;
  tileN.generateMipmaps = true;
  tileN.anisotropy = 8;
  tileN.needsUpdate = true;
  return tileN;
}
