// What stands round a level's cabinet and is not the cabinet: the floor of
// the room, the contact shadows of the cabinet and its crate on it, and the
// server room (serverRoom/), the same for the same seed (the level's site).

import * as THREE from 'three/webgpu';
import { FRONT_Z, ROOM_FLOOR, type Rack } from '../game/rack';
import { buildFloor } from './floor';
import { softShadow } from './rackTextures';
import { buildServerRoom } from './serverRoom/serverRoom';

/** the scenery round the cabinet of `rack`, in the cabinet's frame; the same room for the same `seed` */
export function levelScenery(rack: Rack, seed: number): THREE.Group {
  const g = new THREE.Group();
  // an open frame stands on the room's floor; a cabinet on its own, a little above it
  const floorY = rack.open ? rack.floorY : ROOM_FLOOR(rack);
  g.add(buildFloor(floorY));
  if (!rack.open) {
    const c = rack.crate();
    g.add(
      softShadow(0.98, 0.86, 0, floorY, (FRONT_Z - 0.5) / 2, 0.55),
      softShadow(c.max[0] - c.min[0] + 0.07, c.max[2] - c.min[2] + 0.07, (c.min[0] + c.max[0]) / 2, floorY, (c.min[2] + c.max[2]) / 2, 0.6),
    );
  }
  g.add(buildServerRoom(floorY, seed));
  return g;
}
