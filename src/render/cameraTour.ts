// A short flight round the cabinet once it is signed off: the camera swings
// to one side and up, looks at the work from three quarters, then comes back
// to the front. The pose over time is a pure function; Stage moves the camera.

/** how far round the cabinet the camera swings (rad), how high it lifts (rad), how close it comes (× distance) */
const SWING = 0.55;
const LIFT = 0.18;
const CLOSER = 0.82;
/** how far the replay of the work drifts either side of the front (rad), how much closer it ends */
const REPLAY_DRIFT = 0.09;
const REPLAY_CLOSER = 0.92;

/** where the camera is, relative to its resting place */
export interface TourPose {
  /** turn round the cabinet's vertical axis (rad) */
  yaw: number;
  /** extra angle above the horizontal (rad) */
  pitch: number;
  /** distance to the target, × the resting one */
  zoom: number;
}

/** smooth in and out, 0..1 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * The pose at `t` (0..1) of the tour: out to three quarters on the right in
 * the first half, a slow pan back across to the left, then home.
 */
export function tourPose(t: number): TourPose {
  const k = Math.max(0, Math.min(1, t));
  // one smooth arc: right, across to the left, back to the middle
  const yaw = SWING * Math.sin(2 * Math.PI * ease(k)) * (1 - 0.4 * k);
  const out = Math.sin(Math.PI * ease(k));
  return { yaw, pitch: LIFT * out, zoom: 1 - (1 - CLOSER) * out };
}

/**
 * The pose at `t` (0..1) of the replay of the work: a slow drift from a little
 * left of the front to a little right, closing in, so that the image is never
 * quite still.
 */
export function replayPose(t: number): TourPose {
  const k = ease(Math.max(0, Math.min(1, t)));
  return { yaw: REPLAY_DRIFT * (2 * k - 1), pitch: 0.04, zoom: 1 - (1 - REPLAY_CLOSER) * k };
}

export class CameraTour {
  private elapsed = 0;

  /** `seconds`: how long it lasts; `done` runs when it is over (or broken off) */
  constructor(private seconds: number, private done: () => void) {}

  /** the pose after `dt` more seconds, or null once it is over */
  advance(dt: number): TourPose | null {
    this.elapsed += dt;
    if (this.elapsed >= this.seconds) {
      this.end();
      return null;
    }
    return tourPose(this.elapsed / this.seconds);
  }

  /** over: the camera is home (or the player took it) */
  end(): void {
    const done = this.done;
    this.done = () => {};
    done();
  }
}
