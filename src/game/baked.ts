// The default aisle of the title screen, fallen once and for all (npm run bake):
// its mess took seconds of physics on every visit, while the rest of the game
// loads in a moment. What is stored is the nodes of each bay's mess where they
// came to rest, nothing else: the racks, the schedule and the tidy cabinet come
// back from the seed, as they always do.
//
// Each bay is kept with the print of its mess before the fall: if the code
// that lays it out changes, the print no longer matches, and the game lets
// that bay fall as before (until it is baked again).
//
// The format: a header (magic, bays; per bay its nodes and its print), then
// per bay its x, y and z in 0.1 mm steps, each node as the step from the one
// before it (cords are chains of nodes a few cm apart: small numbers, which
// gzip packs well), all of it gzipped.

/** the step of the stored positions (m) */
const STEP = 1e-4;
const MAGIC = 0x314b4243; // 'CBK1'

export interface BakedBay {
  /** print of the mess before it fell (see printOf) */
  print: number;
  /** where its nodes came to rest */
  x: Float64Array;
}

/** a print of node positions, to 0.1 mm (FNV-1a) */
export function printOf(x: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    h ^= Math.round(x[i] / STEP) | 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** the bays, as stored (before gzip) */
export function encode(bays: BakedBay[]): Uint8Array {
  const head = 2 + 2 * bays.length;
  const total = bays.reduce((a, b) => a + b.x.length, 0);
  const out = new ArrayBuffer(4 * head + 2 * total);
  const h = new Uint32Array(out, 0, head);
  h[0] = MAGIC;
  h[1] = bays.length;
  bays.forEach((b, k) => { h[2 + 2 * k] = b.x.length / 3; h[3 + 2 * k] = b.print; });
  const d = new Int16Array(out, 4 * head);
  let o = 0;
  for (const b of bays) {
    const n = b.x.length / 3;
    for (let axis = 0; axis < 3; axis++) {
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const q = Math.round(b.x[3 * i + axis] / STEP);
        const step = q - prev;
        if (step < -32768 || step > 32767) throw new Error(`a step of ${step * STEP} m does not fit`);
        d[o++] = step;
        prev = q;
      }
    }
  }
  return new Uint8Array(out);
}

export function decode(buf: ArrayBuffer): BakedBay[] {
  const h0 = new Uint32Array(buf, 0, 2);
  if (h0[0] !== MAGIC) throw new Error('not a baked aisle');
  const count = h0[1], head = 2 + 2 * count;
  const h = new Uint32Array(buf, 0, head);
  const d = new Int16Array(buf, 4 * head);
  const bays: BakedBay[] = [];
  let o = 0;
  for (let k = 0; k < count; k++) {
    const n = h[2 + 2 * k];
    const x = new Float64Array(3 * n);
    for (let axis = 0; axis < 3; axis++) {
      let q = 0;
      for (let i = 0; i < n; i++) {
        q += d[o++];
        x[3 * i + axis] = q * STEP;
      }
    }
    bays.push({ print: h[3 + 2 * k], x });
  }
  return bays;
}

/** fetches and unpacks a baked aisle (null if it cannot be had: the bays then fall as before) */
export async function loadBaked(url: string): Promise<BakedBay[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return null;
    return decode(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  } catch {
    return null;
  }
}
