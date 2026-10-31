// What a level shows, besides the cords' own view: the cabinet (its units,
// ports and LEDs, the traffic of each link in its service's colour) and the
// room round it. Built for a level being played, or out of sight beforehand
// so that its shaders are ready when it opens (warmLevel).

import type * as THREE from 'three/webgpu';
import type { Stage } from '../render/stage';
import { RackView, type UnitLabeller } from '../render/rackView';
import { CableView } from '../render/cableView';
import { disposeTree } from '../render/dispose';
import { levelScenery } from '../render/levelScenery';
import { warmShaders } from '../render/shaderWarmup';
import { World } from '../game/world';
import { SERVICES } from '../game/services';
import { levelSite } from '../game/levels/site';
import type { CordType } from '../game/cordTypes';
import type { LevelDef } from '../game/levels/levelDef';
import { seedOf } from '../lib/random';

/**
 * Builds what `level` shows, out of sight, and its shaders between frames
 * (warmShaders): the first level opened then does not stall on them. What
 * was built (the cabinet, its room, its cords) is kept, out of the scene,
 * until the caller frees it, and every level meanwhile finds the shaders of
 * the same materials. Given up once `stop()` (a level opens): null.
 * `progress`: the share of its shaders built (0 to 1).
 */
export async function warmLevel(stage: Stage, level: LevelDef, unitLabel: UnitLabeller, stop: () => boolean, progress?: (f: number) => void): Promise<{ dispose(): void } | null> {
  const world = new World(level);
  const rackView = rackViewOf(world, unitLabel);
  const scenery = sceneryOf(world, level);
  const cableView = new CableView(world);
  cableView.lightBy(rackView.glow);
  rackView.syncItems(world.itemsVersion);
  cableView.update(true);
  const free = () => {
    rackView.dispose();
    disposeTree(scenery);
    disposeTree(cableView.group);
  };
  let warmed = false;
  try {
    warmed = await warmShaders(stage, [rackView.group, scenery, cableView.group], stop, progress);
  } finally {
    // (what the cords are drawn from, not the cords)
    world.dispose();
    if (!warmed) free();
  }
  return warmed ? { dispose: free } : null;
}

/** the cabinet of a level */
export function rackViewOf(world: World, unitLabel: UnitLabeller): RackView {
  const types = new Map<number, CordType>();
  world.circuits.forEach((c) => types.set(world.rack.port(c.a).unit, c.type));
  // a link carries its service's traffic: the switch shows it in the colour of its cords and labels
  const traffic = new Map<string, string>();
  for (const ci of world.circuits) for (const id of [ci.a, ci.b]) traffic.set(id, SERVICES[ci.service].color);
  return new RackView(world.rack, types, {
    labelOf: (u) => unitLabel(u),
    trafficColorOf: (p) => traffic.get(p.id) ?? null,
    sharedLamp: true,
  });
}

/** the room round the cabinet of a level, drawn from where the level is played */
export function sceneryOf(world: World, level: LevelDef): THREE.Group {
  return levelScenery(world.rack, seedOf(levelSite(level)));
}
