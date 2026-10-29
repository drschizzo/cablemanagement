// What is under the pointer: the cords (in screen space, one pick per cord,
// Tab walking down the list), the guides, the free ports.

import * as THREE from 'three';
import type { Stage } from '../render/stage';
import type { World } from '../game/world';
import type { Guide, Port } from '../game/rack';
import type { Pointer } from './pointer';

/** a cord under the pointer */
export interface Pick {
  cable: number;
  /** the node nearest the pointer */
  node: number;
  point: THREE.Vector3;
  /** picked on a connector: which end (else −1) */
  end: number;
}

/** how far (px) the pointer may move before Tab starts again from the frontmost cord */
const CYCLE_STAY = 5;

export class CordPicker {
  /** every node on the screen (px) with its depth, three numbers a node */
  private screen = new Float32Array(0);
  /** the place in the list Tab has reached, and where the pointer was then */
  private cycleIndex = 0;
  private cycleAt = { x: -1e9, y: -1e9 };

  constructor(private stage: Stage, private world: World, private pointer: Pointer) {}

  /**
   * The cord under the pointer: the frontmost, connectors before the cords
   * lying around them (a connector buried in a heap must stay reachable), or
   * the one Tab reached.
   */
  pick(): Pick | null {
    const list = this.pickAll();
    if (list.length === 0) return null;
    this.resetCycleIfMoved();
    return list[this.cycleIndex % list.length];
  }

  /** Tab: the next cord under the pointer, its place and how many there are (null: fewer than two) */
  next(): { pick: Pick; index: number; count: number } | null {
    const list = this.pickAll();
    if (list.length < 2) return null;
    this.resetCycleIfMoved();
    this.cycleIndex = (this.cycleIndex + 1) % list.length;
    this.cycleAt = { x: this.pointer.px.x, y: this.pointer.px.y };
    return { pick: list[this.cycleIndex], index: this.cycleIndex, count: list.length };
  }

  private resetCycleIfMoved(): void {
    const a = this.cycleAt, p = this.pointer.px;
    if (Math.hypot(a.x - p.x, a.y - p.y) > CYCLE_STAY) this.cycleIndex = 0;
  }

  /** every node on the screen (px) with its depth, three numbers a node */
  projectNodes(): Float32Array {
    const sim = this.world.sim, N = sim.n, x = sim.x;
    if (this.screen.length < N * 3) this.screen = new Float32Array(N * 3);
    const project = this.pointer.projector();
    for (let i = 0; i < N; i++) project(x[3 * i], x[3 * i + 1], x[3 * i + 2], this.screen, 3 * i);
    return this.screen;
  }

  /** the cords under the pointer, one pick each, best first */
  pickAll(): Pick[] {
    const world = this.world;
    const cam = this.stage.camera;
    const H = this.stage.renderer.domElement.getBoundingClientRect().height;
    const S = this.projectNodes();
    const project = this.pointer.projector();
    const x = world.sim.x;
    const mx = this.pointer.px.x, my = this.pointer.px.y;
    // tolerance: the projected cable radius plus a few pixels
    const pxPerM = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const best = new Map<number, { score: number; pick: Pick }>();
    const consider = (ax: number, ay: number, aw: number, bx: number, by: number, bw: number, cable: number, nodeA: number, nodeB: number, end: number, extra: number) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((mx - ax) * dx + (my - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - mx, qy = ay + dy * t - my;
      const d = Math.sqrt(qx * qx + qy * qy);
      const w = aw + (bw - aw) * t;
      const tol = Math.max(6, (0.0022 + extra) * pxPerM / w + 4);
      if (d > tol) return;
      // distance to the camera, then to the pointer; a connector counts as
      // 4 cm closer, 12 cm when the pointer is right on it
      // a plugged one only when the pointer is right on it: a cord passing by is what the player wants
      const plugged = end >= 0 && !!world.cables[cable].ends[end].port;
      const score = w + d * 0.0006 - (end >= 0 ? (d < 8 ? 0.12 : plugged ? 0 : 0.04) : 0);
      const old = best.get(cable);
      if (old && old.score <= score) return;
      const pa = new THREE.Vector3(x[3 * nodeA], x[3 * nodeA + 1], x[3 * nodeA + 2]);
      const pb = new THREE.Vector3(x[3 * nodeB], x[3 * nodeB + 1], x[3 * nodeB + 2]);
      best.set(cable, { score, pick: { cable, node: t < 0.5 ? nodeA : nodeB, point: pa.lerp(pb, t), end } });
    };
    const tip = new Float32Array(3);
    world.cables.forEach((cb, c) => {
      for (let i = cb.start; i < cb.start + cb.count - 1; i++) {
        const e = world.endOfNode(i);
        consider(S[3 * i], S[3 * i + 1], S[3 * i + 2], S[3 * i + 3], S[3 * i + 4], S[3 * i + 5], c, i, i + 1, e && world.endOfNode(i + 1) ? e.end : -1, 0);
      }
      for (const e of [0, 1]) {
        const [n0] = world.endNodes(c, e);
        const t = world.connectorTip(c, e);
        project(t[0], t[1], t[2], tip, 0);
        consider(S[3 * n0], S[3 * n0 + 1], S[3 * n0 + 2], tip[0], tip[1], tip[2], c, n0, n0, e, 0.003);
      }
    });
    return [...best.values()].sort((a, b) => a.score - b.score).map((b) => b.pick);
  }
}

/** the guide under the pointer (the nearest along the ray), or null */
export function guideUnderPointer(world: World, pointer: Pointer): Guide | null {
  const ray = pointer.ray();
  let best: Guide | null = null, bestDistance = Infinity;
  const box = new THREE.Box3(), hit = new THREE.Vector3();
  for (const g of world.rack.guides()) {
    box.min.fromArray(g.reach.min);
    box.max.fromArray(g.reach.max);
    if (!ray.intersectBox(box, hit)) continue;
    const d = hit.distanceTo(ray.origin);
    if (d < bestDistance) { bestDistance = d; best = g; }
  }
  return best;
}

/** the free port under the pointer (within 18 px), or null */
export function freePortUnderPointer(world: World, pointer: Pointer): Port | null {
  let best: Port | null = null, bestDistance = 18;
  for (const p of world.rack.ports) {
    if (p.plug >= 0) continue;
    const d = pointer.screenDistance(p.x, p.y, 0);
    if (d < bestDistance) { bestDistance = d; best = p; }
  }
  return best;
}
