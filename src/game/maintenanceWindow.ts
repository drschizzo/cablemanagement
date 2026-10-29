// The maintenance window: the links working when the player arrives are in
// production, and every second one of them is cut costs the weight of its
// service from a downtime budget. A bypass (a temporary path for the traffic)
// keeps a link running while it is recabled.

import { SERVICES } from './services';
import type { Circuit } from './mess/tangle';
import type { CircuitIndex } from './world';

export class MaintenanceWindow {
  /** links that worked at the start: the service must keep running */
  readonly live = new Set<CircuitIndex>();
  /** downtime spent so far */
  downtime = 0;
  /** links on a bypass, and whether they were cut since it was put on */
  readonly bypassed = new Map<CircuitIndex, { cut: boolean }>();

  /**
   * `isUp`: whether a link carries traffic now (one cord of the right type
   * joins its two ports); `budget`: the downtime allowed (Infinity: none);
   * `stock`: the bypasses left, shared with the player's inventory.
   */
  constructor(
    private circuits: Circuit[],
    private isUp: (i: CircuitIndex) => boolean,
    readonly budget: number,
    private stock: { bypass: number },
  ) {
    // what works at the start is in production
    circuits.forEach((_, i) => { if (isUp(i)) this.live.add(i); });
  }

  /** production links currently cut */
  liveDown(): number {
    let n = 0;
    for (const i of this.live) if (!this.isUp(i)) n++;
    return n;
  }

  /** a production link cut now (a bypass may still carry its traffic) */
  isDown(i: CircuitIndex): boolean {
    return this.live.has(i) && !this.isUp(i);
  }

  /**
   * Time passes with production links cut: the downtime grows. A bypass
   * carries its link meanwhile, and comes back to the stock once the link is
   * restored. Returns the links whose bypass just came back.
   */
  tick(dt: number): CircuitIndex[] {
    const back: CircuitIndex[] = [];
    for (const i of this.live) {
      const up = this.isUp(i), bypass = this.bypassed.get(i);
      if (bypass) {
        if (!up) bypass.cut = true;
        else if (bypass.cut) {
          this.bypassed.delete(i);
          this.stock.bypass++;
          back.push(i);
        }
      } else if (!up) this.downtime += dt * this.weight(i);
    }
    return back;
  }

  /** puts a bypass on a production link, or takes it off; false when there is none left or it is no production link */
  toggleBypass(i: CircuitIndex): boolean {
    if (this.bypassed.has(i)) {
      this.bypassed.delete(i);
      this.stock.bypass++;
      return true;
    }
    if (!this.live.has(i) || this.stock.bypass <= 0) return false;
    this.bypassed.set(i, { cut: !this.isUp(i) });
    this.stock.bypass--;
    return true;
  }

  /** what a second of this link cut costs now (0: not in production, or on a bypass) */
  cutCost(i: CircuitIndex): number {
    return this.live.has(i) && !this.bypassed.has(i) ? this.weight(i) : 0;
  }

  private weight(i: CircuitIndex): number {
    return SERVICES[this.circuits[i].service].weight;
  }
}
