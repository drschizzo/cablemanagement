// The floor every scene stands on: raised tiles lit in a pool under the
// cabinet, fading into the backdrop, some of them perforated, a few cut for a
// grommet. How each map of it is drawn: floorTextures.ts.

import * as THREE from 'three/webgpu';
import { reflective } from './imagePipeline';
import { tsl, type ShaderNode } from './tsl';
import { once } from '../lib/once';
import { ALBEDO_RANGE, floorWear, lightPool, perforatedTile, perforationMask, plainTile } from './floorTextures';

const { texture, uv, vec4, mix, normalMap, materialColor, clamp } = tsl;

export function buildFloor(floorY: number): THREE.Group {
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

/**
 * Tiles i (along x, from x = -4.5 m) and j (along z, from z = -4.2 m)
 * perforated: in the cold aisle before the cabinet, one in two, and in front
 * of the rows down either side of it (see serverRoom).
 */
const PERFORATED: readonly (readonly [number, number])[] = [[3, 8], [5, 8], [7, 8], [9, 8], [11, 8], [5, 4], [5, 6], [9, 4], [9, 6]];
/** where the floor is cut for a brush grommet, cords going under it: the middle of each slot (m, the floor's frame) */
export const GROMMETS: readonly { x: number; z: number }[] = [{ x: -1.08, z: -0.95 }, { x: 0.73, z: -1.7 }, { x: -0.6, z: 2.1 }];
/** a grommet's slot (m): along x, along z */
export const GROMMET_SIZE: readonly [number, number] = [0.22, 0.06];

/**
 * The floor's colour, relief and roughness, the same nodes for every level
 * (three keys its shaders by them): the tile's surface where it is (plain or
 * perforated), in the pool of light, worn.
 */
const floorNodes = once((): { color: ShaderNode; normal: ShaderNode; roughness: ShaderNode } => {
  const at = uv(), onTile = at.mul(TILES);
  const plain = plainTile(), perforated = perforatedTile();
  const perf = texture(perforationMask(TILES, PERFORATED), at).r;
  const surface = mix(texture(plain.surface, onTile), texture(perforated.surface, onTile), perf);
  const relief = mix(texture(plain.normal, onTile), texture(perforated.normal, onTile), perf);
  const pool = texture(lightPool(TILES, GROMMETS, GROMMET_SIZE), at), wear = texture(floorWear(), at);
  return {
    color: vec4(materialColor.mul(pool.rgb).mul(surface.r.mul(ALBEDO_RANGE)).mul(wear.g), pool.a),
    normal: normalMap(relief.xyz),
    roughness: clamp(surface.g.add(wear.r.sub(0.5)), 0.05, 1),
  };
});

