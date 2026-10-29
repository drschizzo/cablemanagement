// The work as it went: a frame every few seconds of play, for the timelapse
// shown once the cabinet is signed off. A long job keeps its whole length:
// when the frames grow too many, one in two goes and the pace halves.

/** frames kept at most (≈ 15 kB each as JPEG) */
export const MAX_FRAMES = 480;
/** s of play between two frames, at first */
export const FIRST_INTERVAL = 1.5;

export class Timelapse<Frame> {
  readonly frames: Frame[] = [];
  /** s of play between two frames, now */
  interval = FIRST_INTERVAL;
  /** s since the last frame: the first one is due at once */
  private since = Infinity;

  /** `dt` s of play passed: a frame is due now (the next one is then an interval away) */
  due(dt: number): boolean {
    this.since += dt;
    if (this.since < this.interval) return false;
    this.since = 0;
    return true;
  }

  /** a frame taken (it may come a little later: encoding takes a moment); too many, one in two goes */
  add(frame: Frame): void {
    this.frames.push(frame);
    if (this.frames.length < MAX_FRAMES) return;
    for (let k = this.frames.length - 1; k > 0; k -= 2) this.frames.splice(k, 1);
    this.interval *= 2;
  }
}
