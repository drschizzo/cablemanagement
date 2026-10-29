// The carried cord shown a stretch at a time: held by the management (green),
// hanging too long (orange), on the floor (red). While carried, and a moment
// after it is let go or laid.

import * as THREE from 'three';
import { HOLD } from '../../game/evaluation';
import type { PlayContext } from '../context';

/** glow of a stretch: held by the management, hanging too long, on the floor */
const HOLD_TINT = [null, new THREE.Color('#1f9a45'), new THREE.Color('#c06800'), new THREE.Color('#b01c1c')];
const FREE_TINT = new THREE.Color('#5a4a10');
/** how long the cord stays shown once it settles (s) */
export const SETTLE_SHOW = 1.6;

export class HoldView {
  private shown: { cable: number; until: number; nextUpdate: number } | null = null;

  constructor(private ctx: PlayContext) {}

  /** the cord shown, or −1 */
  get cable(): number {
    return this.shown?.cable ?? -1;
  }

  /** shows a cord until `until` (clock time; Infinity: until told otherwise) */
  show(cable: number, until: number): void {
    this.shown = { cable, until, nextUpdate: 0 };
  }

  /** the cord shown fades out at clock time `until` */
  endAt(until: number): void {
    if (this.shown) this.shown.until = until;
  }

  update(): void {
    const h = this.shown, ctx = this.ctx, clock = ctx.clock;
    if (!h) return;
    if (clock >= h.until || h.cable >= ctx.world.cables.length) {
      this.shown = null;
      ctx.cableView.setHighlight(h.cable, false);
      ctx.refreshHighlights();
      return;
    }
    if (clock < h.nextUpdate) return;
    h.nextUpdate = clock + 0.1;
    const map = ctx.world.holdMap(h.cable);
    const fade = Number.isFinite(h.until) ? Math.min(1, (h.until - clock) / 0.5) : 1;
    const free = FREE_TINT.clone().multiplyScalar(fade);
    ctx.cableView.setNodeTints(h.cable, Array.from(map, (m) => m === HOLD.FREE ? free : HOLD_TINT[m]!.clone().multiplyScalar(fade)));
  }
}
