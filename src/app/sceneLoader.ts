// One scene at a time: every load bumps a token, and a load overtaken by
// another (two quick clicks, an aisle slow to fall) does nothing, or throws
// its result away. While a load runs, the loading veil is up.

import type { Stage } from '../render/stage';

/** the veil paints before the (blocking) settle of the mess starts */
const PAINT_DELAY_MS = 30;

export class SceneLoader {
  /** bumps on every scene change */
  private token = 0;
  /** loads in progress: the veil stays up while any is running */
  private running = 0;

  constructor(private stage: Stage, private veil: HTMLElement) {}

  /** runs `build` once the veil has painted, unless another load overtook it */
  load(build: (token: number) => void | Promise<void>): void {
    const token = ++this.token;
    this.started();
    setTimeout(async () => {
      try {
        if (token === this.token) await build(token);
      } finally {
        this.ended();
      }
    }, PAINT_DELAY_MS);
  }

  /** a load began with this token has been overtaken since */
  isStale(token: number): boolean {
    return token !== this.token;
  }

  private started(): void {
    this.running++;
    this.stage.busy++;
    this.veil.classList.add('on');
  }

  private ended(): void {
    if (this.running > 0) this.stage.busy--;
    this.running = Math.max(0, this.running - 1);
    if (this.running > 0) return;
    this.veil.classList.remove('on');
  }
}
