// The tone curve: from the linear HDR image to what the screen shows. ACES
// up to white, as on any screen; on an HDR screen, what is brighter than any
// lit surface (the LEDs, their glow) goes on past white, up to the headroom,
// while the rest of the image stays as it is up to white.

import { tsl, type ShaderNode } from './tsl';

const { acesFilmicToneMapping, exp, float, luminance, max, min, mix, vec3 } = tsl;

/** the exposure of the image: ×1.15 on the light of the scene */
const EXPOSURE = 1.15;

/** the brightest the image goes on an HDR screen (linear, × white) */
export const HDR_HEADROOM = 4;

/**
 * Luminance (linear, × white, after the exposure) from which the highlights
 * go past white: above any surface the lamps light, below the LEDs (LED_LUMA,
 * leds.ts).
 */
const HIGHLIGHT_KNEE = 1.5;
/** how slowly the highlights climb towards the headroom (luminance over the knee) */
const HIGHLIGHT_SOFTNESS = 3;
/** how far the highlights pale towards white as they climb, as a bright lamp seems */
const HIGHLIGHT_PALE = 0.5;

/**
 * The image after the curve (linear, white = 1), past white up to
 * `headroom` (× white, a node); at a headroom of 1, ACES alone.
 */
export function toneCurve(color: ShaderNode, headroom: ShaderNode): ShaderNode {
  const exposed = color.mul(EXPOSURE);
  const sdr = acesFilmicToneMapping(color, float(EXPOSURE));
  const over = max(luminance(exposed).sub(HIGHLIGHT_KNEE), 0);
  const extra = headroom.sub(1).mul(exp(over.div(HIGHLIGHT_SOFTNESS).negate()).oneMinus());
  const hue = mix(exposed.div(max(luminance(exposed), 1e-4)), vec3(1), HIGHLIGHT_PALE);
  return min(sdr.add(hue.mul(extra)), vec3(headroom));
}
