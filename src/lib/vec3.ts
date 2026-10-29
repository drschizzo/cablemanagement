// Points of the cabinet as plain triples (x, y, z in metres), and the few
// operations every part of the game needs on them. The physics keeps its nodes
// in flat Float64Arrays instead; these are for paths and shapes.

export type V3 = [number, number, number];

export function dist(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** a − b */
export function minus(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** the dot product of a and b */
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** the point a fraction `t` of the way from a to b */
export function lerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** the length of a path through these points */
export function polyLength(points: V3[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  return length;
}
