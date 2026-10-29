// The quality of the image: the levels it steps down through when the GPU
// cannot keep up, and what the player chose — adapted from a level, or held
// as set (Stage.setQuality).

/** what a level of quality turns on, and how finely */
export interface QualitySettings {
  /** pixels drawn per CSS pixel, at most the screen's own: the cost of every pass scales with it */
  ratio: number;
  /** ambient occlusion */
  ao: boolean;
  /** reflections on the floor */
  ssr: boolean;
  /** px on a side of the shadow map */
  shadow: number;
}

/**
 * The levels the image steps down through when the GPU cannot keep up (see
 * Stage.adapt()), from the full image: the pixel density first, then the
 * ambient occlusion, the reflections on the floor, the resolution of the
 * shadows, and last below 1 px a pixel.
 */
export const QUALITY: readonly QualitySettings[] = [
  { ratio: 2, ao: true, ssr: true, shadow: 2048 },
  { ratio: 1.5, ao: true, ssr: true, shadow: 2048 },
  { ratio: 1, ao: true, ssr: true, shadow: 2048 },
  { ratio: 1, ao: false, ssr: true, shadow: 2048 },
  { ratio: 1, ao: false, ssr: false, shadow: 2048 },
  { ratio: 1, ao: false, ssr: false, shadow: 1024 },
  { ratio: 0.75, ao: false, ssr: false, shadow: 1024 },
];

/**
 * auto: the image starts at `level` of QUALITY and steps down while the frames
 * come too late; fixed: these settings, never adapted.
 */
export type QualityChoice =
  | { kind: 'auto'; level: number }
  | { kind: 'fixed'; settings: QualitySettings };

/** adapted, from the full image */
export const AUTO_QUALITY: QualityChoice = { kind: 'auto', level: 0 };

/** the settings a choice draws with, before the screen caps the ratio */
export function settingsOf(choice: QualityChoice): QualitySettings {
  return choice.kind === 'auto' ? QUALITY[choice.level] : choice.settings;
}

/** the two draw the same image on a screen of this pixel density */
export function drawAlike(a: QualitySettings, b: QualitySettings, devicePixelRatio: number): boolean {
  return Math.min(a.ratio, devicePixelRatio) === Math.min(b.ratio, devicePixelRatio)
    && a.ao === b.ao && a.ssr === b.ssr && a.shadow === b.shadow;
}
