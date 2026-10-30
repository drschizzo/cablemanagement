// Small functions of one number, used wherever something is eased or wrapped.

/** 0 below a, 1 above b, smoothly between (a > b turns it round) */
export function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** the part of `x` after its integer part, in [0, 1) (below 0 too: -0.25 gives 0.75); TSL's fract on the GPU */
export function fractionalPart(x: number): number {
  return x - Math.floor(x);
}
