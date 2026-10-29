// Cords that just became tidy, or whose production line came back: they glow
// green for a moment, with a note each, rising while they come in a row.

import { sfx } from '../../audio/sfx';
import type { CableView } from '../../render/cableView';

export class TidyGlows {
  /** cord → clock time its glow ends */
  private until = new Map<number, number>();
  /** cords made tidy in a row, and when the last one was */
  private streak = { count: 0, at: -1e9 };

  /** a cord glows until `until` (clock time) */
  flash(cable: number, until: number): void {
    this.until.set(cable, until);
  }

  /** cords just made tidy: one glow and one note each, a little apart */
  celebrate(fresh: number[], clock: number): void {
    if (clock - this.streak.at > 8) this.streak.count = 0;
    this.streak.at = clock;
    fresh.forEach((c, i) => {
      this.flash(c, clock + 0.9 + i * 0.12);
      window.setTimeout(() => sfx.tidy(this.streak.count++), i * 120);
    });
  }

  /** the cabinet signed off: every cord glows in a wave, top to bottom (given in that order) */
  wave(cables: number[], clock: number, seconds: number): void {
    cables.forEach((c, i) => this.flash(c, clock + 0.6 + (seconds * i) / Math.max(1, cables.length)));
  }

  clear(): void {
    this.until.clear();
  }

  /** `busy`: a cord lit for another reason, left alone */
  update(view: CableView, clock: number, busy: (cable: number) => boolean): void {
    for (const [c, until] of this.until) {
      if (busy(c)) continue;
      const left = until - clock;
      if (left <= 0) {
        this.until.delete(c);
        view.setHighlight(c, false);
        continue;
      }
      const a = Math.min(1, left / 0.6);
      view.setHighlight(c, true, `rgb(${Math.round(30 * a)}, ${Math.round(150 * a)}, ${Math.round(70 * a)})`);
    }
  }
}
