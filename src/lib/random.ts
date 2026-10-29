// Seeded random draws: the same seed gives the same level, the same aisle,
// on every machine (Math.random would not).

/** a generator of numbers in [0, 1), the same sequence for the same seed (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** shuffles an array in place with `random`, and returns it (Fisher–Yates) */
export function shuffle<T>(a: T[], random: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** one element of `a`, drawn with `random` */
export function pick<T>(a: readonly T[], random: () => number): T {
  return a[Math.floor(random() * a.length)];
}
