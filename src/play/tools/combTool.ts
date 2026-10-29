// The cable comb: press on a bundle and slide along it, the cords in its
// teeth held at it; let go, they are laid side by side in their order along
// the way it took, and the crossings come undone (game/comb.ts).

import * as THREE from 'three';
import { sfx } from '../../audio/sfx';
import { CombStroke } from '../../game/comb';
import type { V3 } from '../../lib/vec3';
import type { PlayContext, ToolHandler } from '../context';

/** m the comb moves before it knows which way it goes, and between two of its moves */
const MIN_STEP = 0.004;

export class CombTool implements ToolHandler {
  readonly cursor = 'crosshair';
  readonly worksOnCords = true;
  readonly worksWhilePreparing = false;
  /** the comb going along a bundle: the stroke, the plane it slides in, where it was last */
  private stroke: { comb: CombStroke; plane: THREE.Plane; last: THREE.Vector3 } | null = null;
  /** a stroke over, its cords held in their lanes a moment (see step) */
  private laying: CombStroke | null = null;

  constructor(private ctx: PlayContext) {}

  pointerDown(e: PointerEvent): boolean {
    const pick = this.ctx.picker.pick();
    if (!pick || pick.end >= 0) return false;
    this.stopLaying();
    this.ctx.history.remember();
    // the comb slides in the plane of the cord it went into
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -pick.point.z);
    this.stroke = { comb: new CombStroke(this.ctx.world), plane, last: pick.point.clone() };
    this.ctx.pointer.capture(e);
    this.ctx.events.onHint({ kind: 'comb', cords: 0 });
    return true;
  }

  pointerMove(): boolean {
    const s = this.stroke;
    if (!s) return false;
    const at = this.ctx.pointer.onPlane(s.plane, 0);
    if (!at || at.distanceTo(s.last) < MIN_STEP) return true;
    const d = at.clone().sub(s.last).setZ(0).normalize();
    const before = s.comb.combed;
    const cords = s.comb.move([at.x, at.y, at.z], [d.x, d.y, 0] as V3);
    if (s.comb.combed > before) sfx.comb();
    s.last.copy(at);
    this.ctx.events.onHint({ kind: 'comb', cords });
    return true;
  }

  pointerUp(): boolean {
    const s = this.stroke;
    if (!s) return false;
    this.stroke = null;
    this.ctx.events.onHint(null);
    // a comb that went through fewer than two cords had nothing to sort
    if (s.comb.combed < 2) {
      s.comb.end();
      this.ctx.history.forgetLast();
      return true;
    }
    s.comb.release();
    this.laying = s.comb;
    sfx.velcro();
    return true;
  }

  /** a physics step: the cords of the last stroke held in their lanes, until they are let go */
  step(dt: number): void {
    if (this.laying?.step(dt)) this.laying = null;
  }

  /** the cords of the last stroke let go at once (another gesture begins) */
  stopLaying(): void {
    this.laying?.end();
    this.laying = null;
  }

  cancel(): void {
    this.stroke?.comb.end();
    this.stroke = null;
    this.ctx.events.onHint(null);
  }

  dispose(): void {
    this.cancel();
    this.stopLaying();
  }
}
